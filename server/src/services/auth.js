// Đăng nhập / đăng ký — docx 6.6, 6.7, 6.8, 13.2
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const userRepo = require("../repositories/userRepo");
const counters = require("../repositories/counterRepo");
const { isoNow } = require("../utils/time");
const { unauthorized, forbidden, conflict, notFound, isTxCanceled } = require("../utils/errors");
const { clean } = require("../utils/clean");

const ADMIN_ROLES = ["Admin", "Manager"];
const normalizeEmail = (e) => e.trim().toLowerCase();

// Customer → customer; Staff Admin/Manager đang hoạt động → admin; còn lại không được phép
function roleOf(u) {
  if (u.EntityType === "Customer") return "customer";
  if (u.EntityType === "Staff" && ADMIN_ROLES.includes(u.Role) && u.IsActive === true) return "admin";
  return null;
}

function toSessionUser(u) {
  const role = roleOf(u);
  return {
    id: u.EntityType === "Customer" ? u.CustomerID : u.StaffID,
    role,
    email: u.Email,
    ...clean(u),
  };
}

function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, email: user.email }, process.env.JWT_SECRET, { expiresIn: "8h" });
}

async function login(email, password) {
  const u = await userRepo.findByEmail(normalizeEmail(email));
  if (!u) throw unauthorized("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
  if (!u.PasswordHash) throw forbidden("Tài khoản chưa đăng ký đăng nhập online, không được phép đăng nhập", "NO_PASSWORD");
  if (!(await bcrypt.compare(password, u.PasswordHash))) throw unauthorized("Email hoặc mật khẩu không đúng", "INVALID_CREDENTIALS");
  if (!roleOf(u)) {
    const msg = u.EntityType === "Staff" && u.IsActive === false
      ? "Tài khoản nhân viên đã bị khóa"
      : "Tài khoản không được phép đăng nhập vào hệ thống này";
    throw forbidden(msg, "ROLE_NOT_ALLOWED");
  }
  const user = toSessionUser(u);
  return { user, token: signToken(user) };
}

async function register(input) {
  const email = normalizeEmail(input.email);
  if (await userRepo.emailExists(email)) throw conflict("Email đã được sử dụng", "EMAIL_TAKEN");

  const customerId = await counters.nextCustomerId();
  const customer = {
    CustomerID: customerId,
    FullName: input.fullName.trim(),
    Email: email,
    Phone: input.phone.trim(),
    IDType: input.idType,
    IDNumber: input.idNumber.trim(),
    IsGuestAccount: false,
    PasswordHash: await bcrypt.hash(input.password, 10),
    TotalBookings: 0,
    TotalSpent: 0,
    LoyaltyTier: "Member",
  };
  try {
    await userRepo.createCustomer(customer, isoNow());
  } catch (e) {
    if (isTxCanceled(e)) throw conflict("Email đã được sử dụng", "EMAIL_TAKEN");
    throw e;
  }
  const user = toSessionUser({ ...customer, EntityType: "Customer" });
  return { user, token: signToken(user) };
}

// Cập nhật thông tin cá nhân khách hàng
async function updateProfile(userPayload, input) {
  const customer = await userRepo.findByEmail(userPayload.email);
  if (!customer) throw notFound("Không tìm thấy người dùng");
  if (customer.EntityType !== "Customer") throw forbidden("Chỉ khách hàng mới có thể chỉnh sửa thông tin cá nhân");

  const fields = {};
  if (input.fullName) fields.FullName = input.fullName.trim();
  if (input.phone) fields.Phone = input.phone.trim();
  if (input.idType) fields.IDType = input.idType;
  if (input.idNumber) fields.IDNumber = input.idNumber.trim();
  if (input.dateOfBirth) fields.DateOfBirth = input.dateOfBirth;
  if (input.gender) fields.Gender = input.gender;
  if (input.nationality) fields.Nationality = input.nationality.trim();
  if (input.address) fields.Address = input.address.trim();

  await userRepo.updateCustomer(customer.CustomerID, fields, isoNow());
  return me(userPayload);
}

// Người dùng hiện tại: đọc lại từ DB theo AP11 để phản ánh thay đổi (ví dụ nhân viên bị khóa)
async function me(payload) {
  const u = await userRepo.findByEmail(payload.email);
  if (!u || !roleOf(u)) throw unauthorized("Phiên đăng nhập không còn hợp lệ");
  return toSessionUser(u);
}

module.exports = { login, register, updateProfile, me, roleOf };
