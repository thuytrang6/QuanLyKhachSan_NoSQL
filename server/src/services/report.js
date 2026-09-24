// Báo cáo cho dashboard admin — mọi số liệu query trực tiếp từ DynamoDB (docx 12.3, 13.6)
const reportRepo = require("../repositories/reportRepo");
const bookingRepo = require("../repositories/bookingRepo");
const roomRepo = require("../repositories/roomRepo");
const hotelRepo = require("../repositories/hotelRepo");
const { daysInMonth } = require("../utils/time");
const { clean } = require("../utils/clean");

const BOOKING_STATUSES = ["Pending", "Confirmed", "CheckedIn", "CheckedOut", "Cancelled", "NoShow"];

// Doanh thu 12 tháng: AP23 cho từng tháng, cộng TotalAmount
async function revenueByYear(year) {
  const months = Array.from({ length: 12 }, (_, i) => `${year}-${String(i + 1).padStart(2, "0")}`);
  const lists = await Promise.all(months.map((ym) => reportRepo.invoicesByMonth(ym, ["TotalAmount"])));
  return months.map((month, i) => ({
    month,
    total: lists[i].reduce((s, inv) => s + inv.TotalAmount, 0),
    count: lists[i].length,
  }));
}

// Hóa đơn trong tháng: AP23, sắp xếp theo TotalAmount giảm dần
async function invoicesOfMonth(month, limit) {
  const items = await reportRepo.invoicesByMonth(month);
  const sorted = items.sort((a, b) => b.TotalAmount - a.TotalAmount);
  return {
    month,
    total: items.reduce((s, i) => s + i.TotalAmount, 0),
    count: items.length,
    top: sorted.slice(0, limit).map((i) => {
      const { Items, ...rest } = clean(i);
      return rest;
    }),
  };
}

// Số booking theo 6 trạng thái: GSI3 BKSTATUS#<status> Select=COUNT
async function bookingStatusCounts() {
  const counts = await Promise.all(BOOKING_STATUSES.map((s) => bookingRepo.countByStatus(s)));
  return BOOKING_STATUSES.map((status, i) => ({ status, count: counts[i] }));
}

// Công suất phòng theo ngày: số RoomNight Booked (AP5, COUNT) / tổng số phòng (AP3, COUNT)
async function occupancy(month) {
  const days = daysInMonth(month);
  const [totalRooms, ...booked] = await Promise.all([roomRepo.countRooms(), ...days.map((d) => reportRepo.countBookedNights(d))]);
  return {
    month,
    totalRooms,
    days: days.map((date, i) => ({
      date,
      booked: booked[i],
      rate: totalRooms ? Math.round((booked[i] / totalRooms) * 1000) / 10 : 0,
    })),
  };
}

// Tổng quan ngày: khách đến (AP14), khách đang ở (AP15), điểm đánh giá (AP1), 10 review mới nhất (AP28)
async function overview(date) {
  const [arrivals, inHouse, hotel, reviews] = await Promise.all([
    bookingRepo.listByStatus("Confirmed", date),
    bookingRepo.listByStatus("CheckedIn"),
    hotelRepo.getHotel(),
    reportRepo.latestReviews(10),
  ]);
  return {
    date,
    arrivals: arrivals.map(clean),
    inHouse: inHouse.map(clean).sort((a, b) => a.CheckOutDate.localeCompare(b.CheckOutDate)),
    hotel: hotel ? { HotelName: hotel.HotelName, RatingAvg: hotel.RatingAvg, ReviewCount: hotel.ReviewCount, TotalRooms: hotel.TotalRooms, StarRating: hotel.StarRating } : null,
    reviews: reviews.map(clean),
  };
}

module.exports = { BOOKING_STATUSES, revenueByYear, invoicesOfMonth, bookingStatusCounts, occupancy, overview };
