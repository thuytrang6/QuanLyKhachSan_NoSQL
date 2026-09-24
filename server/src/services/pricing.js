// Quy tắc tính giá — docx mục 7.1. Mọi con số lấy từ DynamoDB (RoomType, Rate, Voucher, Hotel.Policies).
const hotelRepo = require("../repositories/hotelRepo");
const { badRequest, notFound } = require("../utils/errors");

const roundK = (x) => Math.round(x / 1000) * 1000;

// Giá từng đêm = BasePrice × Multiplier của Rate có Priority cao nhất bao phủ đêm đó (không có Rate thì × 1)
function priceNights(roomType, rates, nights) {
  return nights.map((date) => {
    const best = rates
      .filter((r) => r.StartDate <= date && date <= r.EndDate)
      .sort((a, b) => b.Priority - a.Priority)[0];
    return { Date: date, Price: roundK(roomType.BasePrice * (best ? best.Multiplier : 1)) };
  });
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

// TotalPrice = SubTotal − Discount; Deposit = TotalPrice × DepositPercent% (làm tròn nghìn); Remaining = TotalPrice − Deposit
function totals(subTotal, discount, depositPercent) {
  const total = subTotal - discount;
  const deposit = roundK((total * depositPercent) / 100);
  return { SubTotal: subTotal, DiscountAmount: discount, TotalPrice: total, DepositPercent: depositPercent, DepositAmount: deposit, RemainingAmount: total - deposit };
}

module.exports = { roundK, priceNights, loadPricingData, applyVoucher, totals };
