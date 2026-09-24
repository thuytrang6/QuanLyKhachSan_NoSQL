const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const { notFoundRoute, errorHandler } = require("./middlewares/error");

if (!process.env.JWT_SECRET) {
  console.error("Thiếu JWT_SECRET trong server/.env");
  process.exit(1);
}

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "http://localhost:5173", credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

app.get("/api/health", (req, res) => res.json({ data: { ok: true } }));
app.get("/api/hotel", (req, res, next) => require("./services/room").hotelInfo().then((data) => res.json({ data }), next));
app.use("/api/auth", require("./routes/auth"));
app.use("/api/rooms", require("./routes/rooms"));
app.use("/api/bookings", require("./routes/bookings"));
app.use("/api/admin", require("./routes/admin"));
app.use("/api", notFoundRoute);
app.use(errorHandler);

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`API chạy tại http://localhost:${port} — bảng ${process.env.TABLE} @ ${process.env.DDB_ENDPOINT || "AWS " + process.env.AWS_REGION}`);
});
