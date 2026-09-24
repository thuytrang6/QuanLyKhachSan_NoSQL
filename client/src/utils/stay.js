// Bộ lọc tìm phòng lưu trên URL (?checkIn=...&adults=...) để trang chủ và trang chi tiết dùng chung, và F5 không mất
import { addDays, todayVN } from "./format";

const num = (v, d) => (v == null || v === "" || Number.isNaN(Number(v)) ? d : Number(v));

export function readFilters(sp) {
  const today = todayVN();
  const checkIn = sp.get("checkIn") || today;
  return {
    checkIn,
    checkOut: sp.get("checkOut") || addDays(checkIn, 1),
    adults: num(sp.get("adults"), 2),
    childrenOver1m: num(sp.get("childrenOver1m"), 0),
    childrenUnder1m: num(sp.get("childrenUnder1m"), 0),
    roomTypeId: sp.get("roomTypeId") || "",
    maxPrice: sp.get("maxPrice") || "",
    sort: sp.get("sort") || "price_asc",
  };
}

// Bỏ các giá trị rỗng trước khi đưa lên URL / API
export function compact(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== "" && v != null));
}

export const toQuery = (obj) => new URLSearchParams(compact(obj)).toString();

// Chỉ phần ngày + số khách (dùng cho link sang trang chi tiết / đặt phòng)
export const stayOf = (f) => ({
  checkIn: f.checkIn, checkOut: f.checkOut, adults: f.adults,
  childrenOver1m: f.childrenOver1m, childrenUnder1m: f.childrenUnder1m,
});
