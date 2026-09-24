const router = require("express").Router();
const authService = require("../services/auth");
const S = require("../validation/schemas");
const { validate } = require("../middlewares/validate");
const { COOKIE, cookieOptions, requireAuth } = require("../middlewares/auth");
const { asyncHandler } = require("../utils/errors");

router.post("/login", validate(S.login), asyncHandler(async (req, res) => {
  const { user, token } = await authService.login(req.valid.email, req.valid.password);
  res.cookie(COOKIE, token, cookieOptions).json({ data: user });
}));

router.post("/register", validate(S.register), asyncHandler(async (req, res) => {
  const { user, token } = await authService.register(req.valid);
  res.status(201).cookie(COOKIE, token, cookieOptions).json({ data: user });
}));

router.post("/logout", (req, res) => {
  const { maxAge, ...opts } = cookieOptions;
  res.clearCookie(COOKIE, opts).json({ data: { ok: true } });
});

router.get("/me", requireAuth, asyncHandler(async (req, res) => {
  res.json({ data: await authService.me(req.user) });
}));

module.exports = router;
