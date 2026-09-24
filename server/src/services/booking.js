// Nghiệp vụ tìm phòng, đặt phòng, thanh toán cọc, hủy — docx mục 7, 8.2, 13.3, 13.4
const crypto = require("crypto");
const roomRepo = require("../repositories/roomRepo");
const bookingRepo = require("../repositories/bookingRepo");
const hotelRepo = require("../repositories/hotelRepo");
const userRepo = require("../repositories/userRepo");
const counters = require("../repositories/counterRepo");
const pricing = require("./pricing");
const { isoNow, epochSec, vnDate, nightsBetween, vnDateTime } = require("../utils/time");
const { badRequest, notFound, forbidden, conflict, isTxCanceled, failedIndexes } = require("../utils/errors");
const { clean } = require("../utils/clean");

const UNAVAILABLE_ROOM_STATUSES = ["Maintenance", "OutOfOrder"];
const MAX_NIGHTS = 30;

// Đêm bị chiếm khi Status = Booked, hoặc Held mà ExpiresAt còn hạn (docx 7.6: không chờ TTL)
const isTaken = (n, nowSec) => n.Status === "Booked" || (n.Status === "Held" && n.ExpiresAt > nowSec);

async function getHotelPolicies() {
  const hotel = await hotelRepo.getHotel();
  if (!hotel) throw notFound("Chưa có dữ liệu khách sạn, hãy chạy npm run seed");
  return hotel;
}

function validateStay({ checkIn, checkOut }) {
  const today = vnDate();
  if (checkIn < today) throw badRequest("Ngày nhận phòng không được ở quá khứ");
  if (checkOut <= checkIn) throw badRequest("Ngày trả phòng phải sau ngày nhận phòng");
  const nights = nightsBetween(checkIn, checkOut);
  if (nights.length > MAX_NIGHTS) throw badRequest(`Mỗi lần đặt tối đa ${MAX_NIGHTS} đêm`);
  return nights;
}

// Tìm phòng trống: AP3 (danh sách phòng) + AP5 (đêm đã bị chiếm, mỗi đêm 1 Query) + AP2/AP25 (giá)
async function searchRooms(q) {
  const nights = validateStay(q);
  const nowSec = epochSec();
  const [rooms, ...nightLists] = await Promise.all([
    roomRepo.listRooms(),
    ...nights.map((d) => roomRepo.nightsOn(d, q.roomTypeId)),
  ]);
  const taken = new Set();
  nightLists.flat().filter((n) => isTaken(n, nowSec)).forEach((n) => taken.add(n.RoomID));

  const guests = q.adults + q.childrenOver1m;
  const candidates = rooms.filter((r) =>
    (!q.roomTypeId || r.RoomTypeID === q.roomTypeId)
    && !UNAVAILABLE_ROOM_STATUSES.includes(r.Status)
    && !taken.has(r.RoomID)
    && guests <= r.Capacity);

  const typeIds = [...new Set(candidates.map((r) => r.RoomTypeID))];
  const priceData = await pricing.loadPricingData(typeIds);
  const result = candidates
    .filter((r) => priceData[r.RoomTypeID])
    .map((r) => {
      const { roomType, rates } = priceData[r.RoomTypeID];
      const nightlyRates = pricing.priceNights(roomType, rates, nights);
      return {
        ...clean(r),
        RoomTypeDescription: roomType.Description,
        NightlyRates: nightlyRates,
        Nights: nights.length,
        SubTotal: nightlyRates.reduce((s, n) => s + n.Price, 0),
      };
    })
    .sort((a, b) => a.SubTotal - b.SubTotal || a.RoomID.localeCompare(b.RoomID));
  return { rooms: result, nights: nights.length, checkedAt: isoNow() };
}

// Tính giá đầy đủ cho 1 phòng (dùng cho báo giá và khi tạo booking) — docx 7.1 + 7.2
async function buildQuote(input) {
  const nights = validateStay(input);
  const room = await roomRepo.getRoom(input.roomId);
  if (!room) throw notFound(`Không tìm thấy phòng ${input.roomId}`);
  if (UNAVAILABLE_ROOM_STATUSES.includes(room.Status)) throw conflict(`Phòng ${room.RoomID} đang ngừng khai thác`, "ROOM_UNAVAILABLE");
  if (input.adults + input.childrenOver1m > room.Capacity) {
    throw badRequest(`Phòng ${room.RoomID} chỉ chứa tối đa ${room.Capacity} khách (người lớn + trẻ trên 1m)`);
  }
  const [hotel, priceData] = await Promise.all([getHotelPolicies(), pricing.loadPricingData([room.RoomTypeID])]);
  const { roomType, rates } = priceData[room.RoomTypeID] || {};
  if (!roomType) throw notFound(`Không tìm thấy loại phòng ${room.RoomTypeID}`);

  const nightlyRates = pricing.priceNights(roomType, rates, nights);
  const subTotal = nightlyRates.reduce((s, n) => s + n.Price, 0);
  let voucher = null;
  if (input.voucherCode) voucher = await pricing.applyVoucher(input.voucherCode, subTotal, nights.length, vnDate());
  const money = pricing.totals(subTotal, voucher ? voucher.DiscountAmount : 0, hotel.Policies.DepositPercent);
  return {
    room, roomType, hotel, nights, nightlyRates, voucher,
    quote: {
      RoomID: room.RoomID, RoomTypeID: room.RoomTypeID, RoomTypeName: room.RoomTypeName,
      CheckInDate: input.checkIn, CheckOutDate: input.checkOut, Nights: nights.length,
      NightlyRates: nightlyRates, ...money,
      VoucherCode: voucher ? voucher.VoucherCode : undefined,
      VoucherDescription: voucher ? voucher.VoucherDescription : undefined,
      PendingHoldMinutes: hotel.Policies.PendingHoldMinutes,
    },
  };
}

async function quote(input) {
  return (await buildQuote(input)).quote;
}

// Đặt phòng online (docx 13.4): Put Booking Pending + RoomNight Held + Update Voucher trong 1 TransactWrite
async function createBooking(user, input) {
  const { room, nights, nightlyRates, voucher, hotel, quote: q } = await buildQuote(input);
  const nowSec = epochSec();

  // Kiểm tra trước bằng AP6 để báo lỗi sớm; điều kiện trong transaction mới là chốt chặn cuối cùng
  const existing = await roomRepo.roomNightsBetween(room.RoomID, nights[0], nights[nights.length - 1]);
  if (existing.some((n) => isTaken(n, nowSec))) {
    throw conflict("Phòng vừa được người khác đặt, vui lòng chọn phòng khác", "ROOM_TAKEN");
  }

  const customer = await userRepo.findByEmail(user.email);
  if (!customer || customer.EntityType !== "Customer") throw forbidden("Chỉ khách hàng mới được đặt phòng online");

  const bookingId = await counters.nextBookingId();
  const now = isoNow();
  const expiresAt = nowSec + hotel.Policies.PendingHoldMinutes * 60;
  const booking = {
    BookingID: bookingId,
    CustomerID: customer.CustomerID, CustomerName: customer.FullName, CustomerPhone: customer.Phone,
    RoomID: room.RoomID, RoomTypeID: room.RoomTypeID, RoomTypeName: room.RoomTypeName,
    CheckInDate: input.checkIn, CheckOutDate: input.checkOut, Nights: nights.length,
    NumAdults: input.adults, NumChildrenOver1m: input.childrenOver1m, NumChildrenUnder1m: input.childrenUnder1m,
    NightlyRates: nightlyRates,
    SubTotal: q.SubTotal, DiscountAmount: q.DiscountAmount, TotalPrice: q.TotalPrice,
    DepositPercent: q.DepositPercent, DepositAmount: q.DepositAmount, RemainingAmount: q.RemainingAmount,
    ServiceTotal: 0, SurchargeTotal: 0,
    ...(voucher ? { VoucherCode: voucher.VoucherCode } : {}),
    ...(input.notes ? { Notes: input.notes } : {}),
  };

  try {
    await bookingRepo.createOnlineBooking(booking, { now, nowSec, expiresAt });
  } catch (e) {
    if (!isTxCanceled(e)) throw e;
    const failed = failedIndexes(e);
    const voucherIndex = bookingRepo.CREATE_TX.FIRST_NIGHT + nightlyRates.length;
    if (voucher && failed.includes(voucherIndex) && failed.length === 1) {
      throw conflict(`Mã ${voucher.VoucherCode} vừa hết lượt sử dụng, vui lòng bỏ mã và đặt lại`, "VOUCHER_EXHAUSTED");
    }
    if (failed.includes(bookingRepo.CREATE_TX.ROOM)) throw conflict(`Phòng ${room.RoomID} vừa ngừng khai thác, vui lòng chọn phòng khác`, "ROOM_TAKEN");
    throw conflict("Phòng vừa được người khác đặt, vui lòng chọn phòng khác", "ROOM_TAKEN");
  }
  return { BookingID: bookingId, ExpiresAt: expiresAt, Status: "Pending" };
}

// Đọc hồ sơ booking (AP8) và tách theo EntityType
async function loadBooking(bookingId) {
  const items = await bookingRepo.getBookingCollection(bookingId);
  const booking = items.find((i) => i.EntityType === "Booking");
  if (!booking) throw notFound(`Không tìm thấy đơn ${bookingId}`);
  const byType = (t) => items.filter((i) => i.EntityType === t).map(clean);
  return {
    booking,
    payments: byType("Payment").sort((a, b) => a.PaidAt.localeCompare(b.PaidAt)),
    services: byType("BookingService"),
    surcharges: byType("Surcharge"),
    invoices: byType("Invoice"),
  };
}

function assertOwner(user, booking) {
  if (booking.CustomerID !== user.id) throw forbidden("Bạn không có quyền xem đơn đặt phòng này");
}

function decorate(booking, nowSec) {
  const b = clean(booking);
  if (b.Status === "Pending") b.IsExpired = !(b.ExpiresAt > nowSec);
  return b;
}

// Chính sách hủy (docx 7.5): hủy trước CheckInTime ngày nhận phòng ≥ FreeCancelBeforeHours giờ thì hoàn 100% cọc
function cancelPolicy(booking, hotel, now = new Date()) {
  const deadline = new Date(vnDateTime(booking.CheckInDate, hotel.CheckInTime).getTime() - hotel.Policies.FreeCancelBeforeHours * 3600e3);
  return {
    canCancel: booking.Status === "Confirmed",
    refundable: now <= deadline,
    freeCancelDeadline: isoNow(deadline),
    freeCancelBeforeHours: hotel.Policies.FreeCancelBeforeHours,
  };
}

async function getBookingDetail(user, bookingId) {
  const [detail, hotel] = await Promise.all([loadBooking(bookingId), getHotelPolicies()]);
  assertOwner(user, detail.booking);
  return {
    ...detail,
    booking: decorate(detail.booking, epochSec()),
    cancelPolicy: cancelPolicy(detail.booking, hotel),
    serverTime: epochSec(),
  };
}

// Lịch sử đặt phòng: AP10, mới nhất trước
async function listMyBookings(user) {
  const nowSec = epochSec();
  const items = await bookingRepo.listByCustomer(user.id);
  return items.map((b) => decorate(b, nowSec));
}

const randomDigits = (n) => String(crypto.randomInt(0, 10 ** n)).padStart(n, "0");

// Thanh toán cọc (giả lập VNPay, docx 8.2): Put Payment Deposit + Booking → Confirmed + RoomNight → Booked
async function payDeposit(user, bookingId) {
  const { booking } = await loadBooking(bookingId);
  assertOwner(user, booking);
  const nowSec = epochSec();
  if (booking.Status !== "Pending") throw conflict(`Đơn ${bookingId} đang ở trạng thái ${booking.Status}, không thể thanh toán cọc`, "INVALID_STATUS");
  if (!(booking.ExpiresAt > nowSec)) throw conflict("Đơn đã hết thời gian giữ chỗ, vui lòng đặt lại", "BOOKING_EXPIRED");

  const paymentId = await counters.nextPaymentId();
  const paidAt = isoNow();
  const payment = {
    PaymentID: paymentId, BookingID: bookingId, PaymentType: "Deposit", Amount: booking.DepositAmount,
    PaymentMethod: "EWallet", PaymentStatus: "Paid", PaidAt: paidAt, PayDate: vnDate(),
    TransactionRef: "VNPAY" + paidAt.slice(2, 10).replace(/-/g, "") + randomDigits(6),
  };
  try {
    await bookingRepo.confirmDeposit(booking, payment, { now: paidAt, nowSec });
  } catch (e) {
    if (isTxCanceled(e)) throw conflict("Đơn đã hết thời gian giữ chỗ hoặc vừa thay đổi, vui lòng tải lại", "BOOKING_CHANGED");
    throw e;
  }
  return { BookingID: bookingId, Status: "Confirmed", PaymentID: paymentId, Amount: payment.Amount, TransactionRef: payment.TransactionRef };
}

// Hủy booking Confirmed (docx 7.5): Booking → Cancelled, xóa RoomNight, trả lượt voucher, hoàn cọc nếu đủ điều kiện
async function cancelBooking(user, bookingId, reason) {
  const [{ booking, payments }, hotel] = await Promise.all([loadBooking(bookingId), getHotelPolicies()]);
  assertOwner(user, booking);
  if (booking.Status !== "Confirmed") throw conflict(`Chỉ hủy được đơn đã xác nhận (hiện tại: ${booking.Status})`, "INVALID_STATUS");

  const policy = cancelPolicy(booking, hotel);
  const deposited = payments.filter((p) => p.PaymentType === "Deposit" && p.PaymentStatus === "Paid").reduce((s, p) => s + p.Amount, 0);
  const now = isoNow();
  let refund = null;
  if (policy.refundable && deposited > 0) {
    const paymentId = await counters.nextPaymentId();
    refund = {
      PaymentID: paymentId, BookingID: bookingId, PaymentType: "Refund", Amount: deposited,
      PaymentMethod: "Transfer", PaymentStatus: "Refunded", PaidAt: now, PayDate: vnDate(),
      TransactionRef: "FT" + now.slice(2, 10).replace(/-/g, "") + randomDigits(6),
    };
  }
  try {
    await bookingRepo.cancelConfirmed(booking, { reason, refund, now });
  } catch (e) {
    if (isTxCanceled(e)) throw conflict("Dữ liệu đã bị người khác sửa, tải lại", "VERSION_CONFLICT");
    throw e;
  }
  return { BookingID: bookingId, Status: "Cancelled", RefundAmount: refund ? refund.Amount : 0 };
}

module.exports = { searchRooms, quote, createBooking, getBookingDetail, listMyBookings, payDeposit, cancelBooking };
