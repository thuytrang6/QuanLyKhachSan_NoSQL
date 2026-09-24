const { z } = require("zod");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải có dạng YYYY-MM-DD")
  .refine((s) => !Number.isNaN(Date.parse(s + "T00:00:00Z")), "Ngày không hợp lệ");
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải có dạng YYYY-MM");
const count = (min, label) => z.coerce.number({ invalid_type_error: `${label} phải là số` }).int().min(min, `${label} tối thiểu ${min}`).max(10, `${label} tối đa 10`);
const voucherCode = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{3,20}$/, "Mã giảm giá không hợp lệ");

const login = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

const register = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z.string().trim().regex(/^\+?\d{9,15}$/, "Số điện thoại không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
  idType: z.enum(["CCCD", "Passport"], { errorMap: () => ({ message: "Loại giấy tờ là CCCD hoặc Passport" }) }),
  idNumber: z.string().trim().min(6, "Số giấy tờ không hợp lệ").max(20),
}).superRefine((v, ctx) => {
  if (v.idType === "CCCD" && !/^\d{12}$/.test(v.idNumber)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["idNumber"], message: "CCCD phải gồm 12 chữ số" });
  }
});

const stay = {
  checkIn: date,
  checkOut: date,
  adults: count(1, "Số người lớn"),
  childrenOver1m: count(0, "Số trẻ trên 1m").default(0),
  childrenUnder1m: count(0, "Số trẻ dưới 1m").default(0),
};

const emptyToUndef = (s) => z.preprocess((v) => (v === "" || v == null ? undefined : v), s);
const roomTypeId = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{2,10}$/).optional().or(z.literal("").transform(() => undefined));

const search = z.object({
  ...stay,
  roomTypeId,
  maxPrice: emptyToUndef(z.coerce.number().int().positive("Giá tối đa phải lớn hơn 0").optional()),
  sort: emptyToUndef(z.enum(["price_asc", "price_desc", "floor"]).default("price_asc")),
});

// Chi tiết phòng: ngày lưu trú không bắt buộc (chưa chọn ngày thì chỉ xem thông tin + lịch trống)
const roomDetail = z.object({
  checkIn: emptyToUndef(date.optional()),
  checkOut: emptyToUndef(date.optional()),
  adults: emptyToUndef(count(1, "Số người lớn").default(1)),
  childrenOver1m: emptyToUndef(count(0, "Số trẻ trên 1m").default(0)),
});

const quote = z.object({
  ...stay,
  roomId: z.string().trim().regex(/^\w{1,10}$/, "Mã phòng không hợp lệ"),
  voucherCode: voucherCode.optional().or(z.literal("").transform(() => undefined)),
});

const createBooking = quote.extend({
  notes: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự").optional().transform((s) => s || undefined),
});

const cancelBooking = z.object({
  reason: z.string().trim().min(3, "Vui lòng nhập lý do hủy").max(300),
});

const stringList = z.array(z.string().trim().min(1).max(200)).max(20).default([]);

const roomCreate = z.object({
  RoomNumber: z.string().trim().regex(/^\d{3,4}$/, "Số phòng gồm 3-4 chữ số"),
  Floor: z.coerce.number().int().min(1, "Tầng tối thiểu 1").max(99),
  RoomTypeID: z.string().trim().min(1, "Chọn loại phòng"),
  View: z.string().trim().min(1, "Nhập hướng nhìn").max(100),
  Amenities: stringList,
  Images: stringList,
});

const roomUpdate = z.object({
  Version: z.coerce.number().int().min(1),
  View: z.string().trim().min(1, "Nhập hướng nhìn").max(100),
  Amenities: stringList,
  Images: stringList,
  Status: z.enum(["Available", "Maintenance", "OutOfOrder"], { errorMap: () => ({ message: "Trạng thái chỉ được là Available, Maintenance hoặc OutOfOrder" }) }).optional(),
  MaintenanceNote: z.string().trim().max(300).optional(),
  Reason: z.string().trim().max(300).optional(),
});

const roomFilter = z.object({
  floor: z.coerce.number().int().optional(),
  roomTypeId: z.string().trim().optional().transform((s) => s || undefined),
  status: z.string().trim().optional().transform((s) => s || undefined),
  page: emptyToUndef(z.coerce.number().int().min(1, "Trang tối thiểu là 1").default(1)),
  pageSize: emptyToUndef(z.coerce.number().int().min(5, "Mỗi trang tối thiểu 5 phòng").max(100, "Mỗi trang tối đa 100 phòng").default(10)),
});

module.exports = { date, month, login, register, search, roomDetail, quote, createBooking, cancelBooking, roomCreate, roomUpdate, roomFilter };
