import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { bookingsApi } from "../api/bookings";
import { formatDate, formatMoney } from "../utils/format";
import { BookingStatusBadge } from "../components/Badges";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { TableSkeleton } from "../components/Skeleton";

export default function MyBookingsPage() {
  const list = useQuery({ queryKey: ["bookings", "mine"], queryFn: bookingsApi.mine });

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Lịch sử đặt phòng</h1>
      <p className="mt-1 text-sm text-slate-500">Sắp xếp theo ngày nhận phòng, mới nhất trước.</p>
      <div className="mt-5">
        {list.isLoading && <div className="card"><TableSkeleton cols={6} /></div>}
        {list.isError && <ErrorState error={list.error} onRetry={list.refetch} />}
        {list.data && list.data.length === 0 && (
          <EmptyState icon="🧳" title="Bạn chưa có đơn đặt phòng nào" action={<Link to="/rooms" className="btn-primary">Tìm phòng</Link>} />
        )}
        {list.data && list.data.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Mã đơn</th><th className="th">Phòng</th><th className="th">Nhận → Trả</th>
                  <th className="th text-right">Tổng tiền</th><th className="th">Trạng thái</th><th className="th" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data.map((b) => (
                  <tr key={b.BookingID} className="hover:bg-slate-50">
                    <td className="td font-medium">{b.BookingID}</td>
                    <td className="td">{b.RoomID} · {b.RoomTypeName}</td>
                    <td className="td whitespace-nowrap">{formatDate(b.CheckInDate)} → {formatDate(b.CheckOutDate)}</td>
                    <td className="td tabular text-right">{formatMoney(b.TotalPrice)}</td>
                    <td className="td"><BookingStatusBadge status={b.Status} expired={b.IsExpired} /></td>
                    <td className="td whitespace-nowrap text-right">
                      {b.Status === "Pending" && !b.IsExpired && (
                        <Link to={`/booking/${b.BookingID}/pay`} className="btn-primary mr-2 px-3 py-1">Thanh toán cọc</Link>
                      )}
                      <Link to={`/my-bookings/${b.BookingID}`} className="btn-secondary px-3 py-1">Chi tiết</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
