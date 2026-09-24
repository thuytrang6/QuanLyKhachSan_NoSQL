import { Link } from "react-router-dom";
import { ROOM_STATUS } from "../utils/constants";

// Sơ đồ phòng theo tầng: màu trạng thái luôn đi kèm nhãn chữ
export default function RoomBoard({ board, linkToLogs = true }) {
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-3 text-xs">
        {Object.entries(ROOM_STATUS).map(([k, s]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-slate-600">
            <span className="h-3 w-3 rounded" style={{ background: s.color }} aria-hidden />
            {s.label} <b className="tabular text-slate-800">{board.counts[k] || 0}</b>
          </span>
        ))}
        <span className="text-slate-500">· Tổng <b className="text-slate-800">{board.total}</b> phòng</span>
      </div>
      <div className="space-y-2">
        {board.floors.map((f) => (
          <div key={f.floor} className="flex items-start gap-3">
            <div className="w-14 shrink-0 pt-2 text-xs font-medium text-slate-500">Tầng {f.floor}</div>
            <div className="flex flex-wrap gap-2">
              {f.rooms.map((r) => {
                const s = ROOM_STATUS[r.Status] || {};
                const tile = (
                  <div className={`w-24 rounded-lg px-2 py-1.5 ${s.tile}`} title={`${r.RoomID} · ${r.RoomTypeName} · ${s.label}${r.CurrentBookingID ? " · " + r.CurrentBookingID : ""}${r.MaintenanceNote ? " · " + r.MaintenanceNote : ""}`}>
                    <div className="text-sm font-bold">{r.RoomID}</div>
                    <div className="truncate text-[11px] opacity-90">{s.label}</div>
                    <div className="truncate text-[10px] opacity-80">{r.RoomTypeID}{r.CurrentBookingID ? ` · ${r.CurrentBookingID}` : ""}</div>
                  </div>
                );
                return linkToLogs
                  ? <Link key={r.RoomID} to={`/admin/rooms/${r.RoomID}/logs`} className="transition hover:scale-105">{tile}</Link>
                  : <div key={r.RoomID}>{tile}</div>;
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
