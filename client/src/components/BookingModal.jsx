import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { bookingFormSchema } from "../validation/schemas";
import { formatDate, formatMoney } from "../utils/format";
import Modal from "./Modal";
import Field from "./Field";
import { Skeleton } from "./Skeleton";

// Báo giá do server tính (docx 7.1) — client chỉ hiển thị
export default function BookingModal({ room, params, onClose }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState("");
  const { register, handleSubmit, getValues, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { voucherCode: "", notes: "" },
  });

  const base = { ...params, roomId: room.RoomID };
  const baseQuote = useQuery({ queryKey: ["quote", base], queryFn: () => bookingsApi.quote(base) });
  const voucherQuote = useQuery({
    queryKey: ["quote", base, voucher],
    queryFn: () => bookingsApi.quote({ ...base, voucherCode: voucher }),
    enabled: !!voucher,
    retry: false,
  });
  const q = (voucher && voucherQuote.data) || baseQuote.data;

  const applyVoucher = () => {
    const r = bookingFormSchema.shape.voucherCode.safeParse(getValues("voucherCode"));
    if (!r.success) return toast.error(r.error.issues[0].message);
    setValue("voucherCode", r.data);
    setVoucher(r.data);
  };

  const create = useMutation({
    mutationFn: (body) => bookingsApi.create(body),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["rooms", "search"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(`Đã giữ phòng ${room.RoomNumber} — mã đơn ${b.BookingID}`);
      navigate(`/booking/${b.BookingID}/pay`);
    },
    onError: (e) => {
      toast.error(e.message, { duration: 6000 });
      if (e.status === 409 && e.code !== "VOUCHER_EXHAUSTED") {
        qc.invalidateQueries({ queryKey: ["rooms", "search"] }); // phòng vừa bị đặt -> tải lại danh sách phòng trống
        onClose();
      }
    },
  });

  const onSubmit = (v) => create.mutate({
    ...base,
    voucherCode: voucher && voucherQuote.isSuccess ? voucher : undefined,
    notes: v.notes || undefined,
  });

  return (
    <Modal open onClose={onClose} title={`Đặt phòng ${room.RoomNumber} — ${room.RoomTypeName}`} size="max-w-xl"
      footer={(
        <>
          <button className="btn-secondary" onClick={onClose}>Đóng</button>
          <button className="btn-primary" onClick={handleSubmit(onSubmit)} disabled={!q || create.isPending || voucherQuote.isFetching}>
            {create.isPending ? "Đang giữ phòng..." : "Xác nhận đặt phòng"}
          </button>
        </>
      )}>
      <div className="space-y-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 text-slate-600">
          {formatDate(params.checkIn)} → {formatDate(params.checkOut)} · {params.adults} người lớn
          {Number(params.childrenOver1m) > 0 && `, ${params.childrenOver1m} trẻ trên 1m`}
          {Number(params.childrenUnder1m) > 0 && `, ${params.childrenUnder1m} trẻ dưới 1m`}
        </div>

        <div className="flex items-start gap-2">
          <Field label="Mã giảm giá" error={errors.voucherCode} className="flex-1">
            <input className="input uppercase" placeholder="Nhập mã nếu có" {...register("voucherCode")}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }} />
          </Field>
          <div className="flex gap-1 pt-6">
            <button type="button" className="btn-secondary" onClick={applyVoucher} disabled={voucherQuote.isFetching}>Áp dụng</button>
            {voucher && <button type="button" className="btn-ghost" onClick={() => { setVoucher(""); setValue("voucherCode", ""); }}>Bỏ mã</button>}
          </div>
        </div>
        {voucher && voucherQuote.isError && <p className="field-error -mt-2">{voucherQuote.error.message}</p>}
        {voucher && voucherQuote.data && voucherQuote.data.VoucherDescription && (
          <p className="-mt-2 text-xs text-green-700">✓ {voucherQuote.data.VoucherDescription}</p>
        )}

        {baseQuote.isError ? (
          <p className="field-error">{baseQuote.error.message}</p>
        ) : !q ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div>
        ) : (
          <table className="w-full">
            <tbody className="divide-y divide-slate-100">
              {q.NightlyRates.map((n) => (
                <tr key={n.Date}><td className="py-1 text-slate-500">Đêm {formatDate(n.Date)}</td><td className="tabular py-1 text-right">{formatMoney(n.Price)}</td></tr>
              ))}
              <tr><td className="py-1.5">Tiền phòng ({q.Nights} đêm)</td><td className="tabular py-1.5 text-right">{formatMoney(q.SubTotal)}</td></tr>
              {q.DiscountAmount > 0 && (
                <tr className="text-green-700"><td className="py-1.5">Giảm giá {q.VoucherCode}</td><td className="tabular py-1.5 text-right">−{formatMoney(q.DiscountAmount)}</td></tr>
              )}
              <tr className="font-semibold"><td className="py-1.5">Tổng tiền</td><td className="tabular py-1.5 text-right">{formatMoney(q.TotalPrice)}</td></tr>
              <tr className="text-brand-700"><td className="py-1.5">Đặt cọc {q.DepositPercent}% (thanh toán ngay)</td><td className="tabular py-1.5 text-right font-semibold">{formatMoney(q.DepositAmount)}</td></tr>
              <tr className="text-slate-500"><td className="py-1.5">Thanh toán khi trả phòng</td><td className="tabular py-1.5 text-right">{formatMoney(q.RemainingAmount)}</td></tr>
            </tbody>
          </table>
        )}

        <Field label="Ghi chú cho khách sạn" error={errors.notes}>
          <textarea rows={2} className="input" placeholder="Ví dụ: phòng yên tĩnh, tầng cao..." {...register("notes")} />
        </Field>
        {q && (
          <p className="text-xs text-slate-500">
            Sau khi xác nhận, phòng được giữ trong {q.PendingHoldMinutes} phút. Bạn cần thanh toán cọc trong thời gian này, nếu không đơn sẽ tự hủy.
          </p>
        )}
      </div>
    </Modal>
  );
}
