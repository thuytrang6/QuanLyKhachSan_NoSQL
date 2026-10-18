import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { cancelSchema, bookingNotesSchema } from "../validation/schemas";
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
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [editNotesOpen, setEditNotesOpen] = useState(false);
  const detail = useQuery({ queryKey: ["bookings", id], queryFn: () => bookingsApi.detail(id) });

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorState error={detail.error} onRetry={detail.refetch} /></div>;
  const { booking: b, payments, services, surcharges, invoices, cancelPolicy } = detail.data;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link to="/my-bookings" className="text-sm text-brand-600 hover:underline">Lịch sử đặt phòng</Link>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-semibold">Đơn {b.BookingID}</h1>
        <BookingStatusBadge status={b.Status} expired={b.IsExpired} />
        <div className="ml-auto flex flex-wrap gap-2">
          {["Pending", "Confirmed"].includes(b.Status) && (
            <button className="btn-secondary text-sm" onClick={() => setEditNotesOpen(true)}>
              Sửa ghi chú
            </button>
          )}
          {b.Status === "Pending" && !b.IsExpired && <Link to={`/booking/${b.BookingID}/pay`} className="btn-primary">Thanh toán cọc</Link>}
          {cancelPolicy.canCancel && <button className="btn-danger" onClick={() => setCancelOpen(true)}>Hủy đặt phòng</button>}
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <section className="card p-5 lg:col-span-2">
          <h2 className="font-semibold text-slate-900">Thông tin lưu trú</h2>
          <div className="mt-3 grid gap-x-8 text-sm sm:grid-cols-2">
            <Row label="Phòng">{b.RoomID} — {b.RoomTypeName}</Row>
            <Row label="Kênh đặt">{b.BookingChannel}</Row>
            <Row label="Nhận phòng">{formatDate(b.CheckInDate)}</Row>
            <Row label="Trả phòng">{formatDate(b.CheckOutDate)}</Row>
            <Row label="Số đêm">{b.Nights}</Row>
            <Row label="Khách">{b.NumAdults} người lớn · {b.NumChildrenOver1m || 0} trẻ &gt;1m · {b.NumChildrenUnder1m || 0} trẻ &lt;1m</Row>
            <Row label="Ngày đặt">{formatDateTime(b.CreatedAt)}</Row>
            <Row label="Ghi chú">{b.Notes || <span className="text-slate-400 italic">Không có</span>}</Row>
            {b.Status === "Cancelled" && (
              <>
                <Row label="Hủy lúc">{formatDateTime(b.CancelledAt)}</Row>
                <Row label="Lý do hủy">{b.CancelReason}</Row>
              </>
            )}
            {b.Status === "Confirmed" && (
              <Row label="Chính sách hủy">
                {cancelPolicy.isLastMinute ? (
                  <span className="text-amber-700 font-medium">Đặt cận ngày (không hoàn cọc)</span>
                ) : cancelPolicy.refundable ? (
                  <span className="text-green-700 font-medium">Hủy miễn phí trước {formatDateTime(cancelPolicy.freeCancelDeadline)}</span>
                ) : (
                  <span className="text-amber-700 font-medium">Đã quá hạn hủy miễn phí</span>
                )}
              </Row>
            )}
          </div>
          <h3 className="mt-5 text-sm font-semibold text-slate-700">Giá từng đêm</h3>
          <div className="mt-2 grid gap-x-8 text-sm sm:grid-cols-2">
            {(b.NightlyRates || []).map((n) => (
              <Row
                key={n.Date}
                label={
                  <span className="inline-flex items-center gap-1">
                    <span>Đêm {formatDate(n.Date)}</span>
                    {n.IsHoliday && (
                      <span className="inline-flex items-center rounded-full bg-rose-50 px-1.5 py-0.2 text-[10px] font-semibold text-rose-700 border border-rose-200">
                        🎉 {n.RateName || "Lễ (+10%)"}
                      </span>
                    )}
                  </span>
                }
              >
                {formatMoney(n.Price)}
              </Row>
            ))}
          </div>
        </section>

        <section className="card p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Chi tiết thanh toán</h2>
          <div className="mt-3 divide-y divide-slate-100">
            <Row label="Tiền phòng">{formatMoney(b.SubTotal)}</Row>
            {b.ChildSurchargeTotal > 0 && (
              <Row
                label={`Phụ thu trẻ em (${b.NumChildrenOver1m || 0} trẻ > 1m × 100.000đ × ${b.Nights} đêm)`}
                strong
              >
                <span className="text-amber-700">+{formatMoney(b.ChildSurchargeTotal)}</span>
              </Row>
            )}
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
        <h2 className="px-5 pt-4 font-semibold text-slate-900">Lịch sử giao dịch</h2>
        {payments.length === 0 ? (
          <p className="px-5 py-4 text-sm text-slate-500">Chưa có giao dịch thanh toán nào.</p>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="th">Mã</th><th className="th">Loại</th><th className="th">Phương thức</th>
                <th className="th">Mã GD</th><th className="th">Thời điểm</th><th className="th text-right">Số tiền</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payments.map((p) => (
                <tr key={p.PaymentID}>
                  <td className="td font-mono">{p.PaymentID}</td>
                  <td className="td">{PAYMENT_TYPE[p.PaymentType] || p.PaymentType}</td>
                  <td className="td">{PAYMENT_METHOD[p.PaymentMethod] || p.PaymentMethod}</td>
                  <td className="td font-mono text-xs">{p.TransactionRef || "—"}</td>
                  <td className="td">{formatDateTime(p.PaidAt)}</td>
                  <td className={`td text-right font-medium ${p.PaymentType === "Refund" ? "text-green-700" : ""}`}>
                    {p.PaymentType === "Refund" ? "−" : ""}{formatMoney(p.Amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {invoices.length > 0 && (
        <section className="card mt-5 p-5 text-sm">
          <h2 className="font-semibold text-slate-900">Hóa đơn thanh toán</h2>
          {invoices.map((inv) => (
            <div key={inv.InvoiceID} className="mt-3 rounded-lg border border-slate-200 p-4">
              <div className="flex justify-between font-medium">
                <span>Số HD: {inv.InvoiceNo || inv.InvoiceID}</span>
                <span>{formatDateTime(inv.IssuedAt)}</span>
              </div>
              <div className="mt-2 text-xs text-slate-500">
                Tổng thanh toán: <strong className="text-slate-800 text-sm">{formatMoney(inv.TotalAmount)}</strong>
              </div>
            </div>
          ))}
        </section>
      )}

      <CancelModal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        booking={b}
        policy={cancelPolicy}
        onSuccess={() => detail.refetch()}
      />

      <EditNotesModal
        open={editNotesOpen}
        onClose={() => setEditNotesOpen(false)}
        booking={b}
        onSuccess={() => detail.refetch()}
      />
    </div>
  );
}

function EditNotesModal({ open, onClose, booking, onSuccess }) {
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(bookingNotesSchema),
    defaultValues: { notes: booking.Notes || "" },
  });

  const update = useMutation({
    mutationFn: (values) => bookingsApi.updateNotes(booking.BookingID, values.notes),
    onSuccess: () => {
      toast.success("Đã cập nhật ghi chú đơn thành công");
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message || "Cập nhật ghi chú thất bại"),
  });

  return (
    <Modal open={open} onClose={onClose} title={`Sửa ghi chú đơn ${booking.BookingID}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Hủy</button>
          <button type="button" className="btn-primary" onClick={handleSubmit((v) => update.mutate(v))} disabled={update.isPending}>
            {update.isPending ? "Đang lưu..." : "Lưu thay đổi"}
          </button>
        </div>
      }>
      <Field label="Ghi chú cho khách sạn" error={errors.notes}>
        <textarea rows={4} className="input" placeholder="Ví dụ: Giờ đến dự kiến, yêu cầu phòng tầng cao..." {...register("notes")} />
      </Field>
    </Modal>
  );
}

function CancelModal({ open, onClose, booking, policy, onSuccess }) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm({ resolver: zodResolver(cancelSchema) });
  const cancel = useMutation({
    mutationFn: (v) => bookingsApi.cancel(booking.BookingID, v.reason),
    onSuccess: (r) => {
      toast.success(r.RefundAmount > 0 ? `Đã hủy đơn, hoàn lại ${formatMoney(r.RefundAmount)} tiền cọc` : "Đã hủy đơn đặt phòng");
      reset();
      onSuccess();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Modal open={open} onClose={onClose} title={`Hủy đặt phòng ${booking.BookingID}`}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={onClose}>Giữ phòng</button>
          <button type="button" className="btn-danger" onClick={handleSubmit((v) => cancel.mutate(v))} disabled={cancel.isPending}>
            {cancel.isPending ? "Đang hủy..." : "Xác nhận hủy"}
          </button>
        </div>
      }>
      <div className="space-y-3 text-sm">
        <div className={`rounded-lg border p-3 ${
          policy.isLastMinute
            ? "border-amber-200 bg-amber-50 text-amber-900"
            : policy.refundable
              ? "border-green-200 bg-green-50 text-green-900"
              : "border-amber-200 bg-amber-50 text-amber-900"
        }`}>
          {policy.isLastMinute ? (
            <div className="space-y-1.5">
              <div className="font-semibold text-amber-950">
                Đơn đặt cận ngày nhận phòng (không hoàn cọc)
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Đơn được đặt khi thời gian đến lúc nhận phòng (<strong>{formatDateTime(policy.checkInDateTime)}</strong>) còn dưới {policy.freeCancelBeforeHours} giờ.
                Theo quy định của khách sạn, đơn đặt cận ngày không áp dụng chính sách hủy hoàn cọc.
              </p>
              <p className="text-xs font-semibold text-amber-950">
                Nếu hủy lúc này, bạn sẽ không được hoàn lại tiền cọc {formatMoney(booking.DepositAmount)}.
              </p>
            </div>
          ) : policy.refundable ? (
            <div className="space-y-1.5">
              <div className="font-semibold text-green-950">
                Đủ điều kiện hoàn cọc 100%
              </div>
              <p className="text-xs text-green-800 leading-relaxed">
                Hủy trước <strong>{formatDateTime(policy.freeCancelDeadline)}</strong> (ít nhất {policy.freeCancelBeforeHours} giờ trước giờ nhận phòng):
                Bạn sẽ được hoàn 100% tiền cọc <strong>{formatMoney(booking.DepositAmount)}</strong> qua chuyển khoản.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="font-semibold text-amber-950">
                Đã quá hạn hủy miễn phí
              </div>
              <p className="text-xs text-amber-800 leading-relaxed">
                Thời hạn hủy miễn phí cho đơn này đã kết thúc lúc <strong>{formatDateTime(policy.freeCancelDeadline)}</strong> ({policy.freeCancelBeforeHours} giờ trước giờ nhận phòng).
              </p>
              <p className="text-xs font-semibold text-amber-950">
                Hủy lúc này bạn sẽ mất tiền cọc {formatMoney(booking.DepositAmount)}.
              </p>
            </div>
          )}
        </div>
        <Field label="Lý do hủy" error={errors.reason}>
          <textarea rows={3} className="input" placeholder="Vui lòng cho biết lý do hủy phòng..." {...register("reason")} />
        </Field>
      </div>
    </Modal>
  );
}
