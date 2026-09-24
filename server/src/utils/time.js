// Quy ước docx mục 14: thời điểm ISO UTC có Z (không phần nghìn giây); ngày lưu trú YYYY-MM-DD theo giờ Việt Nam.
const VN_OFFSET_MS = 7 * 3600 * 1000;

const isoNow = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, "Z");
const epochSec = (d = new Date()) => Math.floor(d.getTime() / 1000);
const vnDate = (d = new Date()) => new Date(d.getTime() + VN_OFFSET_MS).toISOString().slice(0, 10);

// ["2026-09-25", "2026-09-26"] cho check-in 25/09, check-out 27/09
function nightsBetween(checkIn, checkOut) {
  const out = [];
  const d = new Date(checkIn + "T00:00:00Z"), end = new Date(checkOut + "T00:00:00Z");
  for (; d < end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
  return out;
}

function daysInMonth(ym) {
  const [y, m] = ym.split("-").map(Number);
  const n = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: n }, (_, i) => `${ym}-${String(i + 1).padStart(2, "0")}`);
}

// Thời điểm "HH:mm ngày YYYY-MM-DD" giờ Việt Nam -> Date
const vnDateTime = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`);

module.exports = { isoNow, epochSec, vnDate, nightsBetween, daysInMonth, vnDateTime };
