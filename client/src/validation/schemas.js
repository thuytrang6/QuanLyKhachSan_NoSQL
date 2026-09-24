// Zod schema phía client — cùng quy tắc với server/src/validation/schemas.js (server quyết định cuối cùng)
import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Chọn ngày");
const count = (min, label) => z.coerce.number({ invalid_type_error: `${label} phải là số` }).int().min(min, `${label} tối thiểu ${min}`).max(10, `${label} tối đa 10`);

export const loginSchema = z.object({
  email: z.string().trim().email("Email không hợp lệ"),
  password: z.string().min(1, "Vui lòng nhập mật khẩu"),
});

export const registerSchema = z.object({
  fullName: z.string().trim().min(2, "Họ tên tối thiểu 2 ký tự").max(100),
  email: z.string().trim().email("Email không hợp lệ"),
  phone: z.string().trim().regex(/^\+?\d{9,15}$/, "Số điện thoại không hợp lệ"),
  password: z.string().min(6, "Mật khẩu tối thiểu 6 ký tự").max(100),
  confirmPassword: z.string(),
  idType: z.enum(["CCCD", "Passport"]),
  idNumber: z.string().trim().min(6, "Số giấy tờ không hợp lệ").max(20),
}).superRefine((v, ctx) => {
  if (v.password !== v.confirmPassword) ctx.addIssue({ code: "custom", path: ["confirmPassword"], message: "Mật khẩu nhập lại không khớp" });
  if (v.idType === "CCCD" && !/^\d{12}$/.test(v.idNumber)) ctx.addIssue({ code: "custom", path: ["idNumber"], message: "CCCD phải gồm 12 chữ số" });
});

export const searchSchema = z.object({
  checkIn: date,
  checkOut: date,
  adults: count(1, "Người lớn"),
  childrenOver1m: count(0, "Trẻ trên 1m"),
  childrenUnder1m: count(0, "Trẻ dưới 1m"),
  roomTypeId: z.string().optional(),
  maxPrice: z.string().optional(),
  sort: z.string().optional(),
}).refine((v) => v.checkOut > v.checkIn, { path: ["checkOut"], message: "Ngày trả phòng phải sau ngày nhận phòng" });

export const bookingFormSchema = z.object({
  voucherCode: z.string().trim().toUpperCase().regex(/^([A-Z0-9]{3,20})?$/, "Mã giảm giá không hợp lệ"),
  notes: z.string().trim().max(500, "Ghi chú tối đa 500 ký tự"),
});

export const cancelSchema = z.object({
  reason: z.string().trim().min(3, "Vui lòng nhập lý do hủy").max(300),
});

const listText = z.string().max(2000);
export const roomCreateSchema = z.object({
  RoomNumber: z.string().trim().regex(/^\d{3,4}$/, "Số phòng gồm 3-4 chữ số"),
  Floor: z.coerce.number({ invalid_type_error: "Nhập tầng" }).int().min(1, "Tầng tối thiểu 1").max(99),
  RoomTypeID: z.string().min(1, "Chọn loại phòng"),
  View: z.string().trim().min(1, "Nhập hướng nhìn").max(100),
  Amenities: listText,
  Images: listText,
});

export const roomUpdateSchema = z.object({
  View: z.string().trim().min(1, "Nhập hướng nhìn").max(100),
  Amenities: listText,
  Images: listText,
  Status: z.string().optional(),
  MaintenanceNote: z.string().trim().max(300),
  Reason: z.string().trim().max(300),
});

// "Điều hòa, TV, Wifi" -> ["Điều hòa", "TV", "Wifi"]
export const splitList = (s) => (s || "").split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
