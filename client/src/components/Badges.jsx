import { BOOKING_STATUS, ROOM_STATUS } from "../utils/constants";

const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap";

export function BookingStatusBadge({ status, expired }) {
  const s = BOOKING_STATUS[expired ? "Expired" : status] || { label: status, cls: "bg-slate-100 text-slate-700 ring-slate-300" };
  return <span className={`${base} ${s.cls}`}>{s.label}</span>;
}

export function RoomStatusBadge({ status }) {
  const s = ROOM_STATUS[status] || { label: status, badge: "bg-slate-100 text-slate-700 ring-slate-300", color: "#94a3b8" };
  return (
    <span className={`${base} ${s.badge}`}>
      <span className="h-2 w-2 rounded-full" style={{ background: s.color }} aria-hidden />
      {s.label}
    </span>
  );
}
