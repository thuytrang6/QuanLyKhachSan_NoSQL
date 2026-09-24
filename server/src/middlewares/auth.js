const jwt = require("jsonwebtoken");
const { unauthorized, forbidden } = require("../utils/errors");

const COOKIE = "token";
const cookieOptions = { httpOnly: true, sameSite: "lax", secure: false, maxAge: 8 * 3600 * 1000, path: "/" };

function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return next(unauthorized());
  try {
    const p = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: p.sub, role: p.role, email: p.email };
    next();
  } catch {
    next(unauthorized("Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"));
  }
}

const requireRole = (role) => (req, res, next) => {
  if (!req.user) return next(unauthorized());
  if (req.user.role !== role) return next(forbidden());
  next();
};

module.exports = { COOKIE, cookieOptions, requireAuth, requireRole };
