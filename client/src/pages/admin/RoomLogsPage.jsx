import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "../../api/admin";
import { formatDateTime, formatMoney } from "../../utils/format";
import { RoomStatusBadge } from "../../components/Badges";
import { TableSkeleton } from "../../components/Skeleton";
import EmptyState, { ErrorState } from "../../components/EmptyState";

export default function RoomLogsPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ["admin", "room-logs", id], queryFn: () => adminApi.roomLogs(id) });

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/admin/rooms" className="text-sm text-brand-600 hover:underline">← Quản lý phòng</Link>
      <h1 className="mt-2 text-2xl font-semibold">Nhật ký trạng thái phòng {id}</h1>
      <p className="text-sm text-slate-500">Query PK=ROOM#{id}, begins_with(SK, LOG#), mới nhất trước.</p>

      {q.isLoading && <div className="card mt-5"><TableSkeleton cols={5} rows={8} /></div>}
      {q.isError && <div className="mt-5"><ErrorState error={q.error} onRetry={q.refetch} /></div>}
      {q.data && (
        <>
          <div className="card mt-5 flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-sm">
            <div><span className="text-slate-500">Loại:</span> {q.data.room.RoomTypeName}</div>
            <div><span className="text-slate-500">Tầng:</span> {q.data.room.Floor}</div>
            <div><span className="text-slate-500">Giá gốc:</span> {formatMoney(q.data.room.BasePrice)}</div>
            <div className="flex items-center gap-2"><span className="text-slate-500">Hiện tại:</span> <RoomStatusBadge status={q.data.room.Status} /></div>
            <div><span className="text-slate-500">Version:</span> {q.data.room.Version}</div>
          </div>
          {q.data.logs.length === 0 ? (
            <div className="mt-5"><EmptyState icon="📋" title="Chưa có lần đổi trạng thái nào" /></div>
          ) : (
            <div className="card mt-5 overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr><th className="th">Thời điểm</th><th className="th">Từ</th><th className="th">Sang</th><th className="th">Lý do</th><th className="th">Nhân viên</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data.logs.map((l) => (
                    <tr key={l.LogID}>
                      <td className="td whitespace-nowrap">{formatDateTime(l.ChangedAt)}<div className="text-xs text-slate-400">{l.LogID}</div></td>
                      <td className="td"><RoomStatusBadge status={l.FromStatus} /></td>
                      <td className="td"><RoomStatusBadge status={l.ToStatus} /></td>
                      <td className="td">{l.Reason}</td>
                      <td className="td">{l.ChangedByStaffID}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
