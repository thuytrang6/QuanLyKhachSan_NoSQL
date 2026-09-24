// Nhãn hiển thị cho các giá trị enum trong docx (không phải dữ liệu nghiệp vụ)
export const BOOKING_STATUS = {
  Pending: { label: "Chờ thanh toán cọc", cls: "bg-amber-100 text-amber-800 ring-amber-300" },
  Confirmed: { label: "Đã xác nhận", cls: "bg-blue-100 text-blue-800 ring-blue-300" },
  CheckedIn: { label: "Đang lưu trú", cls: "bg-emerald-100 text-emerald-800 ring-emerald-300" },
  CheckedOut: { label: "Đã trả phòng", cls: "bg-slate-100 text-slate-700 ring-slate-300" },
  Cancelled: { label: "Đã hủy", cls: "bg-red-100 text-red-700 ring-red-300" },
  NoShow: { label: "Không đến", cls: "bg-zinc-200 text-zinc-700 ring-zinc-300" },
  Expired: { label: "Hết hạn giữ chỗ", cls: "bg-zinc-100 text-zinc-500 ring-zinc-300" },
};

// Màu trạng thái phòng theo bảng status của dataviz (luôn đi kèm nhãn chữ)
export const ROOM_STATUS = {
  Available: { label: "Trống", color: "#0ca30c", tile: "bg-[#0ca30c] text-white", badge: "bg-green-100 text-green-800 ring-green-300" },
  Occupied: { label: "Có khách", color: "#2a78d6", tile: "bg-[#2a78d6] text-white", badge: "bg-blue-100 text-blue-800 ring-blue-300" },
  Cleaning: { label: "Đang dọn", color: "#fab219", tile: "bg-[#fab219] text-slate-900", badge: "bg-amber-100 text-amber-800 ring-amber-300" },
  Maintenance: { label: "Bảo trì", color: "#ec835a", tile: "bg-[#ec835a] text-slate-900", badge: "bg-orange-100 text-orange-800 ring-orange-300" },
  OutOfOrder: { label: "Ngừng khai thác", color: "#d03b3b", tile: "bg-[#d03b3b] text-white", badge: "bg-red-100 text-red-700 ring-red-300" },
};

export const EDITABLE_ROOM_STATUSES = ["Available", "Maintenance", "OutOfOrder"];

export const PAYMENT_TYPE = { Deposit: "Tiền cọc", Remaining: "Thanh toán còn lại", Refund: "Hoàn cọc" };
export const PAYMENT_METHOD = { Cash: "Tiền mặt", Transfer: "Chuyển khoản", Card: "Thẻ", EWallet: "Ví điện tử" };

// Mốc "hiện tại" của bộ dữ liệu mẫu (docx mục 9.1) — chỉ dùng cho nút chọn ngày trên dashboard
export const SAMPLE_DATA_DATE = "2026-09-24";
