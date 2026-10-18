// Quy tắc tính giá — docx mục 7.1. Mọi con số lấy từ DynamoDB (RoomType, Rate, Voucher, Hotel.Policies).
const hotelRepo = require("../repositories/hotelRepo");
const { badRequest, notFound } = require("../utils/errors");

const roundK = (x) => Math.round(x / 1000) * 1000;

// Danh mục ngày lễ Việt Nam năm 2026: Phụ thu thêm 10% của giá phòng (multiplier = 1.10)
const HOLIDAY_SURCHARGE_PERCENT = 10;
const HOLIDAY_MULTIPLIER = 1.1;

const VIETNAM_HOLIDAYS_2026 = [
  { name: "Tết Dương Lịch", start: "2026-01-01", end: "2026-01-03", multiplier: HOLIDAY_MULTIPLIER },
  { name: "Tết Nguyên Đán (Bính Ngọ)", start: "2026-02-14", end: "2026-02-22", multiplier: HOLIDAY_MULTIPLIER },
  { name: "Giỗ Tổ Hùng Vương", start: "2026-04-25", end: "2026-04-26", multiplier: HOLIDAY_MULTIPLIER },
  { name: "Lễ 30/4 - 1/5", start: "2026-04-29", end: "2026-05-03", multiplier: HOLIDAY_MULTIPLIER },
  { name: "Lễ Quốc Khánh 2/9", start: "2026-08-29", end: "2026-09-02", multiplier: HOLIDAY_MULTIPLIER },
  { name: "Giáng Sinh & Năm Mới", start: "2026-12-24", end: "2027-01-02", multiplier: HOLIDAY_MULTIPLIER },
];

function findHoliday(date) {
  return VIETNAM_HOLIDAYS_2026.find((h) => h.start <= date && date <= h.end);
}

function getHolidaysBetween(from, to) {
  return VIETNAM_HOLIDAYS_2026.filter((h) => h.start <= to && h.end >= from);
}

function getHolidayMap(from, to) {
  const map = {};
  for (const h of VIETNAM_HOLIDAYS_2026) {
    if (h.start <= to && h.end >= from) {
      let cur = new Date(h.start > from ? h.start : from);
      const end = new Date(h.end < to ? h.end : to);
      while (cur <= end) {
        const dStr = cur.toISOString().slice(0, 10);
        map[dStr] = {
          name: h.name,
          surchargePercent: HOLIDAY_SURCHARGE_PERCENT,
          multiplier: HOLIDAY_MULTIPLIER,
        };
        cur.setDate(cur.getDate() + 1);
      }
    }
  }
  return map;
}

const CHILD_SURCHARGE_PER_NIGHT = 100000; // 100.000đ / trẻ trên 1m / đêm (trẻ dưới 1m miễn phí)

// Giá từng đêm: Nếu là ngày lễ thì phụ thu thêm 10% của giá phòng (Multiplier = 1.10).
// Mùa cao điểm khác (nếu có trong Rate DB) áp dụng Multiplier của Rate đó.
function priceNights(roomType, rates = [], nights = []) {
  return nights.map((date) => {
    // 1. Kiểm tra ngày lễ Việt Nam trước (đảm bảo phụ thu đúng 10% của giá phòng)
    const holiday = findHoliday(date);

    // 2. Kiểm tra Rate từ DynamoDB (AP25)
    const bestRate = (rates || [])
      .filter((r) => r.StartDate <= date && date <= r.EndDate)
      .sort((a, b) => (b.Priority || 0) - (a.Priority || 0))[0];

    let multiplier = 1;
    let rateName = "Giá tiêu chuẩn";
    let isHoliday = false;

    if (holiday) {
      multiplier = HOLIDAY_MULTIPLIER;
      rateName = `${holiday.name} (+10%)`;
      isHoliday = true;
    } else if (bestRate) {
      const isRateHoliday = /lễ|tết|noel|giáng sinh|quốc khánh/i.test(bestRate.Name || "");
      if (isRateHoliday) {
        multiplier = HOLIDAY_MULTIPLIER;
        rateName = `${bestRate.Name} (+10%)`;
        isHoliday = true;
      } else {
        multiplier = bestRate.Multiplier || 1;
        rateName = bestRate.Name || "Mùa cao điểm";
        isHoliday = multiplier > 1;
      }
    }

    const price = roundK(roomType.BasePrice * multiplier);

    return {
      Date: date,
      BasePrice: roomType.BasePrice,
      Price: price,
      Multiplier: multiplier,
      RateName: rateName,
      IsHoliday: isHoliday,
    };
  });
}

// Tính phụ thu trẻ em: Trẻ em dưới 1m miễn phí (0đ), trẻ trên 1m phụ thu 100.000đ/đêm
function calculateChildSurcharge(childrenOver1m, nightCount) {
  const numChildren = Math.max(0, parseInt(childrenOver1m, 10) || 0);
  return numChildren * CHILD_SURCHARGE_PER_NIGHT * Math.max(0, nightCount);
}

// Tải RoomType + Rate của các loại phòng cần tính (AP2 + AP25), dùng lại trong 1 request
async function loadPricingData(roomTypeIds) {
  const [types, ...ratesList] = await Promise.all([
    hotelRepo.listRoomTypes(),
    ...roomTypeIds.map((id) => hotelRepo.listRates(id)),
  ]);
  const byId = Object.fromEntries(types.map((t) => [t.RoomTypeID, t]));
  const data = {};
  roomTypeIds.forEach((id, i) => { if (byId[id]) data[id] = { roomType: byId[id], rates: ratesList[i] }; });
  return data;
}

// Voucher hợp lệ khi: IsActive, ngày tạo đơn trong StartDate–EndDate, SubTotal ≥ MinOrder, Nights ≥ MinNights, UsedCount < UsageLimit
async function applyVoucher(code, subTotal, nightCount, today) {
  const v = await hotelRepo.getVoucher(code);
  if (!v) throw notFound(`Mã giảm giá ${code} không tồn tại`, "VOUCHER_NOT_FOUND");
  if (!v.IsActive) throw badRequest(`Mã ${code} đã ngừng áp dụng`, "VOUCHER_INVALID");
  if (today < v.StartDate || today > v.EndDate) throw badRequest(`Mã ${code} chỉ áp dụng cho đơn tạo từ ${v.StartDate} đến ${v.EndDate}`, "VOUCHER_INVALID");
  if (subTotal < v.MinOrder) throw badRequest(`Mã ${code} yêu cầu tổng tiền phòng tối thiểu ${v.MinOrder.toLocaleString("vi-VN")}đ`, "VOUCHER_INVALID");
  if (nightCount < v.MinNights) throw badRequest(`Mã ${code} yêu cầu lưu trú tối thiểu ${v.MinNights} đêm`, "VOUCHER_INVALID");
  if (v.UsedCount >= v.UsageLimit) throw badRequest(`Mã ${code} đã hết lượt sử dụng`, "VOUCHER_INVALID");
  const discount = v.DiscountType === "Percent"
    ? roundK(Math.min((subTotal * v.Value) / 100, v.MaxDiscount))
    : Math.min(v.Value, subTotal);
  return { VoucherCode: v.VoucherCode, DiscountAmount: discount, VoucherDescription: v.Description };
}

// TotalPrice = SubTotal + ChildSurchargeTotal − Discount; Deposit = TotalPrice × DepositPercent% (làm tròn nghìn); Remaining = TotalPrice − Deposit
function totals(subTotal, discount, depositPercent, childSurchargeAmount = 0) {
  const childTotal = Math.max(0, childSurchargeAmount || 0);
  const total = subTotal + childTotal - discount;
  const deposit = roundK((total * depositPercent) / 100);
  return {
    SubTotal: subTotal,
    ChildSurchargeTotal: childTotal,
    ChildSurchargePerNight: CHILD_SURCHARGE_PER_NIGHT,
    DiscountAmount: discount,
    TotalPrice: total,
    DepositPercent: depositPercent,
    DepositAmount: deposit,
    RemainingAmount: total - deposit,
  };
}

module.exports = {
  roundK,
  priceNights,
  calculateChildSurcharge,
  CHILD_SURCHARGE_PER_NIGHT,
  HOLIDAY_SURCHARGE_PERCENT,
  HOLIDAY_MULTIPLIER,
  VIETNAM_HOLIDAYS_2026,
  getHolidaysBetween,
  getHolidayMap,
  loadPricingData,
  applyVoucher,
  totals,
};
