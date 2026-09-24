import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { cancelSchema } from "../validation/schemas";
import { formatDate, formatDateTime, formatMoney } from "../utils/format";
import { PAYMENT_METHOD, PAYMENT_TYPE } from "../utils/constants";
import { BookingStatusBadge } from "../components/Badges";
import { PageSkeleton } from "../components/Skeleton";
import { ErrorState } from "../components/EmptyState";
import Modal from "../components/Modal";
import Field from "../components/Field";

const Row = ({ label, children, strong }) => (
  <div className={`flex justify-between gap-4 py-1.5 ${strong ? "font-semibold" : ""}`}>
    <span className="text-slate-500">{label}</span><span className="tabular text-right">{children}</span>
  </div>
);

export default function BookingDetailPage() {
  const { id } = useParams();
  const [cancelOpen, setCancelOpen] = useState(false);
  const detail = useQuery({ queryKey: ["bookings", id], queryFn: () => bookingsApi.detail(id) });

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorState error={detail.error} onRetry={detail.refetch} /></div>;
  const { booking: b, payments, services, surcharges, invoices, cancelPolicy } = detail.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/my-bookings" className="text-sm text-brand-600 hover:underline">← Lịch sử đặt phòng</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Đơn {b.BookingID}</h1>
        <BookingStatusBadge status={b.Status} expired={b.IsExpired} />
        <div className="ml-auto flex gap-2">
          {b.Status === "Pending" && !b.IsExpired && <Link to={`/booking/${b.BookingID}/pay`} className="btn-primary">Thanh toán cọc</Link>}
          {cancelPolicy.canCancel && <button className="btn-danger" onClick={() => setCancelOpen(true)}>Hủy đặt phòng</button>}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold">Thông tin lưu trú</h2>
          <div className="mt-3 grid gap-x-8 text-sm sm:grid-cols-2">
            <Row label="Phòng">{b.RoomID} — {b.RoomTypeName}</Row>
            <Row label="Kênh đặt">{b.BookingChannel}</Row>
            <Row label="Nhận phòng">{formatDate(b.CheckInDate)}</Row>
            <Row label="Trả phòng">{formatDate(b.CheckOutDate)}</Row>
            <Row label="Số đêm">{b.Nights}</Row>
            <Row label="Khách">{b.NumAdults} NL · {b.NumChildrenOver1m} trẻ &gt;1m · {b.NumChildrenUnder1m} trẻ &lt;1m</Row>
            <Row label="Ngày đặt">{formatDateTime(b.CreatedAt)}</Row>
            {b.Notes && <Row label="Ghi chú">{b.Notes}</Row>}
            {b.Status === "Cancelled" && (
              <>
                <Row label="Hủy lúc">{formatDateTime(b.CancelledAt)}</Row>
                <Row label="Lý do hủy">{b.CancelReason}</Row>
              </>
            )}
          </div>
          <h3 className="mt-5 text-sm font-semibold text-slate-700">Giá từng đêm</h3>
          <div className="mt-2 grid gap-x-8 text-sm sm:grid-cols-2">
            {(b.NightlyRates || []).map((n) => <Row key={n.Date} label={`Đêm ${formatDate(n.Date)}`}>{formatMoney(n.Price)}</Row>)}
          </div>
        </section>

        <section className="card p-5 text-sm">
          <h2 className="font-semibold">Thanh toán</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <Row label="Tiền phòng">{formatMoney(b.SubTotal)}</Row>
            {b.DiscountAmount > 0 && <Row label={`Giảm giá ${b.VoucherCode || ""}`}>−{formatMoney(b.DiscountAmount)}</Row>}
            <Row label="Tổng tiền" strong>{formatMoney(b.TotalPrice)}</Row>
            <Row label={`Cọc ${b.DepositPercent}%`}>{formatMoney(b.DepositAmount)}</Row>
            <Row label="Còn lại khi trả phòng">{formatMoney(b.RemainingAmount)}</Row>
            {b.ServiceTotal > 0 && <Row label="Dịch vụ">{formatMoney(b.ServiceTotal)}</Row>}
            {b.SurchargeTotal > 0 && <Row label="Phụ phí">{formatMoney(b.SurchargeTotal)}</Row>}
            <Row label="Đã thanh toán" strong>{formatMoney(b.PaidAmount)}</Row>
            <Row label="Còn phải thu">{formatMoney(b.BalanceDue)}</Row>
            {b.Status === "Cancelled" && <Row label="Tiền cọc được hoàn">{formatMoney(b.RefundAmount)}</Row>}
          </div>
        </section>
      </div>

      <section className="card mt-5 overflow-x-auto">
        <h2 className="px-5 pt-4 font-semibold">Giao dịch</h2>
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Chưa có giao dịch nào.</p>
        ) : (
          <table className="mt-2 min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50"><tr><th className="th">Mã</th><th className="th">Loại</th><th className="th">Phương thức</th><th className="th">Thời điểm</th><th className="th">Mã GD</th><th className="th text-right">Số tiền</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.PaymentID}>
                  <td className="td">{p.PaymentID}</td>
                  <td className="td">{PAYMENT_TYPE[p.PaymentType] || p.PaymentType}</td>
                  <td className="td">{PAYMENT_METHOD[p.PaymentMethod] || p.PaymentMethod}</td>
                  <td className="td">{formatDateTime(p.PaidAt)}</td>
                  <td className="td font-mono text-xs">{p.TransactionRef || "—"}</td>
                  <td className={`td tabular text-right ${p.PaymentType === "Refund" ? "text-green-700" : ""}`}>{p.PaymentType === "Refund" ? "−" : ""}{formatMoney(p.Amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(services.length > 0 || surcharges.length > 0 || invoices.length > 0) && (
        <section className="mt-5 grid gap-5 md:grid-cols-2">
          {services.length > 0 && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold">Dịch vụ đã dùng</h2>
              {services.map((s) => <Row key={s.BookingServiceID} label={`${s.ServiceName} × ${s.Quantity} ${s.Unit}`}>{formatMoney(s.Amount)}</Row>)}
            </div>
          )}
          {surcharges.length > 0 && (
            <div className="card p-5 text-sm">
              <h2 className="font-semibold">Phụ phí</h2>
              {surcharges.map((s) => <Row key={s.SurchargeID} label={s.Description}>{formatMoney(s.Amount)}</Row>)}
            </div>
          )}
          {invoices.map((inv) => (
            <div key={inv.InvoiceID} className="card p-5 text-sm">
              <h2 className="font-semibold">Hóa đơn {inv.InvoiceNo}</h2>
              <p className="text-xs text-slate-500">Xuất lúc {formatDateTime(inv.IssuedAt)}</p>
              {(inv.Items || []).map((it, i) => <Row key={i} label={it.Description}>{formatMoney(it.Amount)}</Row>)}
              <Row label="Tổng hóa đơn" strong>{formatMoney(inv.TotalAmount)}</Row>
            </div>
          ))}
        </section>
      )}

      {cancelOpen && <CancelModal booking={b} policy={cancelPolicy} onClose={() => setCancelOpen(false)} />}
    </div>
  );
}

function CancelModal({ booking, policy, onClose }) {
  const qc = useQueryClient();
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(cancelSchema), defaultValues: { reason: "" } });
  const cancel = useMutation({
    mutationFn: ({ reason }) => bookingsApi.cancel(booking.BookingID, reason),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["bookings"] });
      qc.invalidateQueries({ queryKey: ["rooms", "search"] });
      toast.success(r.RefundAmount > 0 ? `Đã hủy đơn, hoàn cọc ${formatMoney(r.RefundAmount)}` : "Đã hủy đơn (không hoàn cọc)");
      onClose();
    },
    onError: (e) => {
      toast.error(e.message);
      if (e.status === 409) qc.invalidateQueries({ queryKey: ["bookings", booking.BookingID] });
    },
  });

  return (
    <Modal open onClose={onClose} title={`Hủy đơn ${booking.BookingID}`}
      footer={(
        <>
          <button className="btn-secondary" onClick={onClose}>Giữ đơn</button>
          <button className="btn-danger" onClick={handleSubmit((v) => cancel.mutate(v))} disabled={cancel.isPending}>
            {cancel.isPending ? "Đang hủy..." : "Xác nhận hủy"}
          </button>
        </>
      )}>
      <div className="space-y-4 text-sm">
        <div className={`rounded-lg p-3 ${policy.refundable ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"}`}>
          {policy.refundable
            ? `Hủy trước ${formatDateTime(policy.freeCancelDeadline)} (≥ ${policy.freeCancelBeforeHours} giờ trước giờ nhận phòng): được hoàn 100% tiền cọc ${formatMoney(booking.DepositAmount)} qua chuyển khoản.`
            : `Đã quá hạn hủy miễn phí (${formatDateTime(policy.freeCancelDeadline)}). Hủy lúc này sẽ mất tiền cọc ${formatMoney(booking.DepositAmount)}.`}
        </div>
        <Field label="Lý do hủy" error={errors.reason}>
          <textarea rows={3} className="input" {...register("reason")} />
        </Field>
      </div>
    </Modal>
  );
}
