const { AppError } = require("../utils/errors");

function notFoundRoute(req, res) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: `Không tìm thấy API ${req.method} ${req.originalUrl}` } });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) } });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Dữ liệu gửi lên không phải JSON hợp lệ" } });
  }
  if (err.name === "ResourceNotFoundException") {
    return res.status(503).json({ error: { code: "TABLE_MISSING", message: "Chưa có bảng DynamoDB, hãy chạy npm run seed" } });
  }
  if (err.name === "TimeoutError" || err.code === "ECONNREFUSED" || (err.cause && err.cause.code === "ECONNREFUSED")) {
    return res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Không kết nối được DynamoDB" } });
  }
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL", message: "Lỗi hệ thống, vui lòng thử lại" } });
}

module.exports = { notFoundRoute, errorHandler };
