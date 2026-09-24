const router = require("express").Router();
const bookingService = require("../services/booking");
const roomService = require("../services/room");
const S = require("../validation/schemas");
const { validate } = require("../middlewares/validate");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { asyncHandler } = require("../utils/errors");

router.use(requireAuth);

// Danh sách loại phòng (AP2) — dùng cho dropdown lọc/tạo phòng
router.get("/types", asyncHandler(async (req, res) => {
  res.json({ data: await roomService.listRoomTypes() });
}));

// Tìm phòng trống (AP3 + AP5 + AP25)
router.get("/search", requireRole("customer"), validate(S.search, "query"), asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.searchRooms(req.valid) });
}));

module.exports = router;
