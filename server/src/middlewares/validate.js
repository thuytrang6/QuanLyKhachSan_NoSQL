const { badRequest } = require("../utils/errors");

// Validate req[source] bằng zod schema; kết quả đã chuẩn hóa ghi vào req.valid
const validate = (schema, source = "body") => (req, res, next) => {
  const r = schema.safeParse(req[source] || {});
  if (!r.success) {
    const issue = r.error.issues[0];
    const err = badRequest(issue.message, "VALIDATION_ERROR");
    err.details = r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return next(err);
  }
  req.valid = r.data;
  next();
};

module.exports = { validate };
