// Danh mục ngày lễ Việt Nam năm 2026: Phụ thu thêm 10% của giá phòng
export const HOLIDAY_SURCHARGE_PERCENT = 10;
export const HOLIDAY_MULTIPLIER = 1.1;

export const VIETNAM_HOLIDAYS_2026 = [
  { name: "Tết Dương Lịch", start: "2026-01-01", end: "2026-01-03", surchargePercent: 10 },
  { name: "Tết Nguyên Đán (Bính Ngọ)", start: "2026-02-14", end: "2026-02-22", surchargePercent: 10 },
  { name: "Giỗ Tổ Hùng Vương", start: "2026-04-25", end: "2026-04-26", surchargePercent: 10 },
  { name: "Lễ 30/4 - 1/5", start: "2026-04-29", end: "2026-05-03", surchargePercent: 10 },
  { name: "Lễ Quốc Khánh 2/9", start: "2026-08-29", end: "2026-09-02", surchargePercent: 10 },
  { name: "Giáng Sinh & Năm Mới", start: "2026-12-24", end: "2027-01-02", surchargePercent: 10 },
];

export function getHoliday(date) {
  if (!date) return null;
  return VIETNAM_HOLIDAYS_2026.find((h) => h.start <= date && date <= h.end) || null;
}

export function isHoliday(date) {
  return !!getHoliday(date);
}

export function getHolidaysInRange(from, to) {
  if (!from || !to) return [];
  return VIETNAM_HOLIDAYS_2026.filter((h) => h.start <= to && h.end >= from);
}
