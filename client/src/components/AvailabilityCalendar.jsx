// Lịch còn trống của 1 phòng (dữ liệu từ AP6: PK=ROOM#<id>, SK BETWEEN NIGHT#d1 AND NIGHT#d2)
const WEEKDAYS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];

function monthsBetween(from, to) {
  const out = [];
  let [y, m] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  while (y < ty || (y === ty && m <= tm)) {
    out.push([y, m]);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const pad = (n) => String(n).padStart(2, "0");

export default function AvailabilityCalendar({ calendar, checkIn, checkOut, onPick }) {
  const taken = new Set(calendar.takenDates);
  return (
    <div>
      <div className="grid gap-6 sm:grid-cols-2">
        {monthsBetween(calendar.from, calendar.to).map(([y, m]) => {
          const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
          const lead = (new Date(Date.UTC(y, m - 1, 1)).getUTCDay() + 6) % 7; // thứ Hai đầu tuần
          return (
            <div key={`${y}-${m}`}>
              <div className="mb-2 text-center text-sm font-semibold text-slate-700">Tháng {m}/{y}</div>
              <div className="grid grid-cols-7 gap-1 text-center text-xs">
                {WEEKDAYS.map((w) => <div key={w} className="py-1 font-medium text-slate-400">{w}</div>)}
                {Array.from({ length: lead }, (_, i) => <div key={"e" + i} />)}
                {Array.from({ length: days }, (_, i) => {
                  const date = `${y}-${pad(m)}-${pad(i + 1)}`;
                  const past = date < calendar.today;
                  const isTaken = taken.has(date);
                  const inStay = checkIn && checkOut && date >= checkIn && date < checkOut;
                  const isEdge = date === checkIn || date === checkOut;
                  let cls = "bg-white text-slate-700 hover:bg-brand-50 border border-slate-200";
                  if (past) cls = "text-slate-300 border border-transparent";
                  else if (isTaken && inStay) cls = "bg-red-600 text-white border border-red-600";
                  else if (isTaken) cls = "bg-red-50 text-red-400 line-through border border-red-100";
                  else if (inStay || isEdge) cls = "bg-brand-500 text-white border border-brand-500";
                  return (
                    <button key={date} type="button" disabled={past} onClick={() => onPick(date)}
                      title={isTaken ? "Đêm này đã có khách" : past ? "" : "Còn trống"}
                      className={`tabular rounded-md py-1.5 transition disabled:cursor-default ${cls}`}>
                      {i + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded border border-slate-200 bg-white" />Còn trống</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-red-50 ring-1 ring-red-100" /><s>Đã có khách</s></span>
        <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-brand-500" />Ngày bạn chọn</span>
        <span className="text-slate-400">Bấm 1 ngày để chọn ngày nhận, bấm tiếp ngày sau để chọn ngày trả.</span>
      </div>
    </div>
  );
}
