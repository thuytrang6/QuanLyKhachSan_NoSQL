const router = require("express").Router();
const { z } = require("zod");
const reportService = require("../services/report");
const roomService = require("../services/room");
const S = require("../validation/schemas");
const { validate } = require("../middlewares/validate");
const { requireAuth, requireRole } = require("../middlewares/auth");
const { asyncHandler, badRequest } = require("../utils/errors");

router.use(requireAuth, requireRole("admin"));

const roomIdParam = (req, res, next) =>
  (/^\w{1,10}$/.test(req.params.id) ? next() : next(badRequest("Mã phòng không hợp lệ")));

// ---------- Báo cáo ----------
router.get("/reports/revenue", validate(z.object({ year: z.coerce.number().int().min(2000).max(2100) }), "query"),
  asyncHandler(async (req, res) => res.json({ data: await reportService.revenueByYear(req.valid.year) })));

router.get("/reports/invoices", validate(z.object({ month: S.month }), "query"),
  asyncHandler(async (req, res) => res.json({ data: await reportService.invoicesOfMonth(req.valid.month, 10) })));

router.get("/reports/booking-status",
  asyncHandler(async (req, res) => res.json({ data: await reportService.bookingStatusCounts() })));

router.get("/reports/occupancy", validate(z.object({ month: S.month }), "query"),
  asyncHandler(async (req, res) => res.json({ data: await reportService.occupancy(req.valid.month) })));

router.get("/reports/overview", validate(z.object({ date: S.date }), "query"),
  asyncHandler(async (req, res) => res.json({ data: await reportService.overview(req.valid.date) })));

router.get("/room-board",
  asyncHandler(async (req, res) => res.json({ data: await roomService.statusBoard() })));

// ---------- CRUD phòng ----------
router.get("/rooms", validate(S.roomFilter, "query"),
  asyncHandler(async (req, res) => res.json({ data: await roomService.listRooms(req.valid) })));

router.post("/rooms", validate(S.roomCreate),
  asyncHandler(async (req, res) => res.status(201).json({ data: await roomService.createRoom(req.valid) })));

router.get("/rooms/:id", roomIdParam,
  asyncHandler(async (req, res) => res.json({ data: await roomService.getRoom(req.params.id) })));

router.put("/rooms/:id", roomIdParam, validate(S.roomUpdate),
  asyncHandler(async (req, res) => res.json({ data: await roomService.updateRoom(req.params.id, req.valid, req.user) })));

router.delete("/rooms/:id", roomIdParam,
  asyncHandler(async (req, res) => res.json({ data: await roomService.deleteRoom(req.params.id) })));

router.get("/rooms/:id/logs", roomIdParam,
  asyncHandler(async (req, res) => res.json({ data: await roomService.listLogs(req.params.id) })));

module.exports = router;
