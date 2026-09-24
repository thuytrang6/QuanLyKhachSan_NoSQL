// Hàm định dạng dùng chung: tiền 1.500.000đ, ngày dd/MM/yyyy (giờ Việt Nam)
const vnd = new Intl.NumberFormat("vi-VN");
const TZ = "Asia/Ho_Chi_Minh";

export const formatMoney = (n) => (n == null || Number.isNaN(Number(n)) ? "—" : `${vnd.format(Math.round(Number(n)))}đ`);

// Rút gọn cho trục biểu đồ: 753.007.000 -> 753 tr
export function formatMoneyShort(n) {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} tỷ`;
  if (n >= 1e6) return `${(n / 1e6).toLocaleString("vi-VN", { maximumFractionDigits: 1 })} tr`;
  if (n >= 1e3) return `${(n / 1e3).toLocaleString("vi-VN", { maximumFractionDigits: 0 })}k`;
  return String(n);
}

// "2026-09-25" -> "25/09/2026"
export function formatDate(ymd) {
  if (!ymd) return "—";
  const [y, m, d] = ymd.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

// ISO UTC -> "25/09/2026 14:20" giờ Việt Nam
export function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

// Ngày hôm nay theo giờ Việt Nam, dạng YYYY-MM-DD
export function todayVN(offsetDays = 0) {
  const d = new Date(Date.now() + 7 * 3600e3 + offsetDays * 86400e3);
  return d.toISOString().slice(0, 10);
}

export function addDays(ymd, n) {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export const formatMonth = (ym) => {
  const [y, m] = ym.split("-");
  return `${m}/${y}`;
};

export const formatNumber = (n) => vnd.format(n);
