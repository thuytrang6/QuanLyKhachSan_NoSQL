class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const badRequest = (msg, code = "BAD_REQUEST") => new AppError(400, code, msg);
const unauthorized = (msg = "Vui lòng đăng nhập", code = "UNAUTHORIZED") => new AppError(401, code, msg);
const forbidden = (msg = "Bạn không có quyền thực hiện thao tác này", code = "FORBIDDEN") => new AppError(403, code, msg);
const notFound = (msg = "Không tìm thấy dữ liệu", code = "NOT_FOUND") => new AppError(404, code, msg);
const conflict = (msg, code = "CONFLICT") => new AppError(409, code, msg);

const isTxCanceled = (e) => e && e.name === "TransactionCanceledException";
// Chỉ số các thao tác trong TransactWrite bị ConditionalCheckFailed
const failedIndexes = (e) =>
  (e.CancellationReasons || []).map((r, i) => (r && r.Code === "ConditionalCheckFailed" ? i : -1)).filter((i) => i >= 0);

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { AppError, badRequest, unauthorized, forbidden, notFound, conflict, isTxCanceled, failedIndexes, asyncHandler };
