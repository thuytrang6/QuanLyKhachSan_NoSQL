import { Link, Navigate, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { useCountdown } from "../hooks/useCountdown";
import { formatDate, formatMoney } from "../utils/format";
import { PageSkeleton } from "../components/Skeleton";
import { ErrorState } from "../components/EmptyState";

export default function PaymentPage() {
  const { id } = useParams();
  const detail = useQuery({ queryKey: ["bookings", id], queryFn: () => bookingsApi.detail(id) });
  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError) return <div className="mx-auto max-w-xl px-4 py-10"><ErrorState error={detail.error} onRetry={detail.refetch} /></div>;
  const { booking, serverTime } = detail.data;
  if (booking.Status !== "Pending") return <Navigate to={`/my-bookings/${id}`} replace />;
  return <PaymentView booking={booking} serverTime={serverTime} />;
}

function PaymentView({ booking, serverTime }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { seconds, mm, ss } = useCountdown(booking.ExpiresAt, serverTime);
  const expired = seconds <= 0;

  const pay = useMutation({
    mutationFn: () => bookingsApi.pay(booking.BookingID),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["rooms", "search"] });
      toast.success(`Thanh toán cọc ${formatMoney(r.Amount)} thành công (${r.TransactionRef})`);
      navigate(`/my-bookings/${booking.BookingID}`, { replace: true });
    },
    onError: (e) => {
      toast.error(e.message);
      qc.invalidateQueries({ queryKey: ["bookings", booking.BookingID] });
    },
  });

  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <div className="card overflow-hidden">
        <div className={`px-6 py-5 text-center ${expired ? "bg-slate-100" : "bg-brand-50"}`}>
          <div className="text-sm text-slate-600">{expired ? "Đã hết thời gian giữ phòng" : "Thời gian giữ phòng còn lại"}</div>
          <div className={`tabular mt-1 text-5xl font-bold ${expired ? "text-slate-400" : seconds < 120 ? "text-red-600" : "text-brand-600"}`}>
            {mm}:{ss}
          </div>
        </div>
        <div className="space-y-3 p-6 text-sm">
          <div className="flex justify-between"><span className="text-slate-500">Mã đơn</span><b>{booking.BookingID}</b></div>
          <div className="flex justify-between"><span className="text-slate-500">Phòng</span><span>{booking.RoomID} — {booking.RoomTypeName}</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Lưu trú</span><span>{formatDate(booking.CheckInDate)} → {formatDate(booking.CheckOutDate)} ({booking.Nights} đêm)</span></div>
          <div className="flex justify-between"><span className="text-slate-500">Tổng tiền</span><span className="tabular">{formatMoney(booking.TotalPrice)}</span></div>
          <div className="flex justify-between border-t border-slate-100 pt-3 text-base">
            <span className="font-medium">Tiền cọc {booking.DepositPercent}%</span>
            <span className="tabular font-semibold text-brand-700">{formatMoney(booking.DepositAmount)}</span>
          </div>
          {expired ? (
            <div className="space-y-3 pt-2">
              <p className="rounded-lg bg-slate-50 p-3 text-slate-600">Đơn đã quá hạn thanh toán cọc, phòng đã được mở bán lại. Vui lòng tìm và đặt lại.</p>
              <Link to="/rooms" className="btn-primary w-full">Tìm phòng khác</Link>
            </div>
          ) : (
            <button className="btn w-full bg-[#005baa] py-3 text-base text-white hover:bg-[#004a8c]" onClick={() => pay.mutate()} disabled={pay.isPending}>
              {pay.isPending ? "Đang xử lý giao dịch..." : `Thanh toán VNPay (demo) — ${formatMoney(booking.DepositAmount)}`}
            </button>
          )}
          <p className="text-center text-xs text-slate-400">Cổng thanh toán giả lập: bấm nút là giao dịch thành công.</p>
        </div>
      </div>
    </div>
  );
}
