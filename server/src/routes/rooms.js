const router = require("express").Router();
const bookingService = require("../services/booking");
const roomService = require("../services/room");
const S = require("../validation/schemas");
const { validate } = require("../middlewares/validate");
const { asyncHandler, badRequest } = require("../utils/errors");

// Trang chủ công khai: khách chưa đăng nhập vẫn xem và tìm phòng được; đặt phòng (routes/bookings) mới cần đăng nhập

// Danh sách loại phòng (AP2) — dải loại phòng trang chủ, dropdown lọc/tạo phòng
router.get("/types", asyncHandler(async (req, res) => {
  res.json({ data: await roomService.listRoomTypes() });
}));

// Tìm phòng trống (AP3 + AP5 + AP25), lọc giá và sắp xếp ở server
router.get("/search", validate(S.search, "query"), asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.searchRooms(req.valid) });
}));

// Chi tiết 1 phòng + lịch còn trống 2 tháng (AP3 + AP2 + AP6 + AP25)
router.get("/:id", (req, res, next) => (/^\w{1,10}$/.test(req.params.id) ? next() : next(badRequest("Mã phòng không hợp lệ"))),
  validate(S.roomDetail, "query"), asyncHandler(async (req, res) => {
    res.json({ data: await bookingService.roomDetail(req.params.id, req.valid) });
  }));

module.exports = router;
