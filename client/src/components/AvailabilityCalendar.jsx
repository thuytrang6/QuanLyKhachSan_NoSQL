import { useState, useEffect } from "react";
import { formatDateShort } from "../utils/format";
import { getHoliday, VIETNAM_HOLIDAYS_2026 } from "../utils/holidays";

const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const pad = (n) => String(n).padStart(2, "0");

// Tạo danh sách 2 tháng liên tiếp bắt đầu từ y-m
function getTwoMonths(yearMonthStr) {
  const [y, m] = (yearMonthStr || "2026-10").split("-").map(Number);
  const m1 = [y, m];
  let nextY = y;
  let nextM = m + 1;
  if (nextM > 12) {
    nextM = 1;
    nextY += 1;
  }
  const m2 = [nextY, nextM];
  return [m1, m2];
}

export default function AvailabilityCalendar({ calendar, checkIn, checkOut, onPick }) {
  const taken = new Set(calendar.takenDates || []);
  const holidayMap = calendar.holidayMap || {};

  // Tháng bắt đầu hiển thị trên lịch (mặc định ưu tiên theo checkIn, hoặc theo calendar.from)
  const initialMonth = (checkIn && checkIn.slice(0, 7)) || (calendar.from && calendar.from.slice(0, 7)) || "2026-10";
  const [currentMonth, setCurrentMonth] = useState(initialMonth);

  // Khi checkIn từ bên ngoài thay đổi (ví dụ người dùng chọn ngày ở trang chủ hay form bên phải), đồng bộ lại tháng hiển thị
  useEffect(() => {
    if (checkIn) {
      setCurrentMonth(checkIn.slice(0, 7));
    }
  }, [checkIn]);

  const prevMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    let prevM = m - 1;
    let prevY = y;
    if (prevM < 1) {
      prevM = 12;
      prevY -= 1;
    }
    setCurrentMonth(`${prevY}-${pad(prevM)}`);
  };

  const nextMonth = () => {
    const [y, m] = currentMonth.split("-").map(Number);
    let nextM = m + 1;
    let nextY = y;
    if (nextM > 12) {
      nextM = 1;
      nextY += 1;
    }
    setCurrentMonth(`${nextY}-${pad(nextM)}`);
  };

  const jumpToHoliday = (holiday) => {
    setCurrentMonth(holiday.start.slice(0, 7));
    if (onPick) {
      // Tự động chọn khoảng ngày của dịp lễ này
      onPick(holiday.start, holiday.end);
    }
  };

  const displayedMonths = getTwoMonths(currentMonth);

  return (
    <div className="space-y-4">
      {/* Thanh chọn nhanh các dịp lễ lớn năm 2026 */}
      <div className="rounded-xl border border-rose-200 bg-rose-50/80 p-3.5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-rose-900">
            <span className="text-base">🎉</span>
            <span>Các ngày lễ lớn năm 2026 (Phụ thu thêm 10% của giá phòng):</span>
          </div>
          <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-800">
            Bấm để xem lịch & chọn
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {VIETNAM_HOLIDAYS_2026.map((h) => {
            const isViewing = displayedMonths.some(([y, m]) => {
              const ym = `${y}-${pad(m)}`;
              return h.start.startsWith(ym) || h.end.startsWith(ym);
            });
            const isSelected = checkIn && checkOut && h.start <= checkOut && checkIn <= h.end;

            return (
              <button
                key={h.name}
                type="button"
                onClick={() => jumpToHoliday(h)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
                  isSelected
                    ? "border-brand-500 bg-brand-500 text-white shadow-xs"
                    : isViewing
                    ? "border-rose-400 bg-white text-rose-900 ring-2 ring-rose-200 shadow-xs"
                    : "border-rose-200 bg-white text-rose-800 hover:border-rose-300 hover:bg-rose-100/60 shadow-2xs"
                }`}
                title={`Bấm để chuyển tới ${h.name} (${h.start} – ${h.end})`}
              >
                <span>{h.name}</span>
                <span className={`text-[11px] font-normal ${isSelected ? "text-white/90" : "text-slate-500"}`}>
                  ({formatDateShort(h.start)} – {formatDateShort(h.end)})
                </span>
                <span className={`rounded px-1.5 py-0.2 text-[10px] font-bold ${isSelected ? "bg-white/20 text-white" : "bg-rose-100 text-rose-800"}`}>
                  +10%
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Điều khiển chuyển tháng trên lịch */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-2">
        <div className="flex items-center gap-1 text-xs text-slate-500">
          <span>Đang xem lịch 2 tháng</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={prevMonth}
            className="btn-secondary h-8 px-2.5 text-xs font-medium flex items-center gap-1"
            title="Xem tháng trước"
          >
            <span>◀</span>
            <span className="hidden sm:inline">Tháng trước</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentMonth(calendar.today ? calendar.today.slice(0, 7) : "2026-10")}
            className="btn-ghost h-8 px-2 text-xs text-slate-600 hover:text-slate-900"
            title="Về tháng hiện tại"
          >
            Hôm nay
          </button>
          <button
            type="button"
            onClick={nextMonth}
            className="btn-secondary h-8 px-2.5 text-xs font-medium flex items-center gap-1"
            title="Xem tháng sau"
          >
            <span className="hidden sm:inline">Tháng sau</span>
            <span>▶</span>
          </button>
        </div>
      </div>

      {/* Lưới lịch 2 tháng */}
      <div className="grid gap-6 sm:grid-cols-2">
        {displayedMonths.map(([y, m]) => {
          const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // thứ Hai đầu tuần
          return (
            <div key={`${y}-${m}`} className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-3.5 shadow-2xs">
              <div className="mb-3 text-center text-sm font-bold text-slate-800">
                Tháng {m} / {y}
              </div>
              <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1 font-semibold text-slate-400 text-[11px]">
                    {w}
                  </div>
                ))}
                {Array.from({ length: lead }, (_, i) => (
                  <div key={"lead-" + i} />
                ))}
                {Array.from({ length: days }, (_, i) => {
                  const date = `${y}-${pad(m)}-${pad(i + 1)}`;
                  const past = date < (calendar.today || "2026-01-01");
                  const isTaken = taken.has(date);
                  const inStay = checkIn && checkOut && date >= checkIn && date < checkOut;
                  const isEdge = date === checkIn || date === checkOut;
                  const holiday = holidayMap[date] || getHoliday(date);

                  let cls = "bg-white text-slate-700 hover:bg-brand-50 border border-slate-200";
                  let title = past ? "" : isTaken ? "Đêm này đã có khách" : "Còn trống";

                  if (holiday) {
                    title = isTaken
                      ? `Đêm này đã có khách (${holiday.name} — Phụ thu 10% giá phòng)`
                      : `🎉 ${holiday.name} — Phụ thu thêm 10% của giá phòng`;
                  }

                  if (past) {
                    cls = "text-slate-300 border-transparent bg-transparent cursor-not-allowed";
                  } else if (isTaken && inStay) {
                    cls = "bg-red-600 text-white border-red-600 font-bold";
                  } else if (isTaken) {
                    cls = "bg-red-50 text-red-400 line-through border-red-100 cursor-not-allowed";
                  } else if (inStay || isEdge) {
                    cls = "bg-brand-500 text-white border-brand-500 font-bold shadow-xs";
                  } else if (holiday) {
                    // Ô ngày lễ: làm nổi bật với viền và nền hồng đỏ
                    cls = "bg-rose-50 text-rose-900 border-rose-300 ring-1 ring-rose-200/60 font-bold hover:bg-rose-100 shadow-xs";
                  }

                  return (
                    <button
                      key={date}
                      type="button"
                      disabled={past}
                      onClick={() => onPick(date)}
                      title={title}
                      className={`relative flex min-h-[44px] flex-col items-center justify-center rounded-lg py-1 transition disabled:cursor-default ${cls}`}
                    >
                      <span className="text-xs leading-none tabular font-semibold">{i + 1}</span>
                      {holiday && !past && (
                        <span
                          className={`mt-0.5 block text-[8px] sm:text-[9px] font-extrabold leading-none ${
                            inStay || isEdge ? "text-amber-200" : "text-rose-600"
                          }`}
                        >
                          Lễ +10%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Chú thích màu sắc (Legend) */}
      <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 pt-1">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded border border-slate-200 bg-white" />
          Còn trống
        </span>
        <span className="inline-flex items-center gap-1.5 font-bold text-rose-700">
          <span className="relative flex h-3.5 w-3.5 items-center justify-center rounded border border-rose-300 bg-rose-100">
            <span className="h-1.5 w-1.5 rounded-full bg-rose-600" />
          </span>
          🎉 Ngày lễ (Phụ thu +10% giá phòng)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded bg-red-50 ring-1 ring-red-100" />
          <s>Đã có khách</s>
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded bg-brand-500" />
          Ngày bạn chọn
        </span>
      </div>
      <p className="text-xs text-slate-400">
        Bấm 1 ngày để chọn ngày nhận phòng, bấm ngày kế tiếp để chọn ngày trả phòng (hoặc chọn nhanh các dịp lễ ở trên).
      </p>
    </div>
  );
}
