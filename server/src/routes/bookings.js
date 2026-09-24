const router = require("express").Router();
const bookingService = require("../services/booking");
const S = require("../validation/schemas");
const { validate } = require("../middlewares/validate");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { asyncHandler, badRequest } = require("../utils/errors");

router.use(requireAuth, requireRole("customer"));

const bookingIdParam = (req, res, next) =>
  (/^BK\d{6,}$/.test(req.params.id) ? next() : next(badRequest("Mã đặt phòng không hợp lệ")));

router.post("/quote", validate(S.quote), asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.quote(req.valid) });
}));

router.post("/", validate(S.createBooking), asyncHandler(async (req, res) => {
  res.status(201).json({ data: await bookingService.createBooking(req.user, req.valid) });
}));

router.get("/", asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.listMyBookings(req.user) });
}));

router.get("/:id", bookingIdParam, asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.getBookingDetail(req.user, req.params.id) });
}));

router.post("/:id/pay", bookingIdParam, asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.payDeposit(req.user, req.params.id) });
}));

router.post("/:id/cancel", bookingIdParam, validate(S.cancelBooking), asyncHandler(async (req, res) => {
  res.json({ data: await bookingService.cancelBooking(req.user, req.params.id, req.valid.reason) });
}));

module.exports = router;
