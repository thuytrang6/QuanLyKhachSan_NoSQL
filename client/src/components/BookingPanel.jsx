import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { useAuth } from "../context/AuthContext";
import { bookingFormSchema } from "../validation/schemas";
import { formatDate, formatMoney, todayVN, addDays } from "../utils/format";
import Field from "./Field";
import { Skeleton } from "./Skeleton";

// Khung đặt phòng bên phải trang chi tiết. Mọi con số (giá đêm, giảm giá, cọc) do server tính.
export default function BookingPanel({ room, stay, filters, onChange, hotel }) {
  const { user } = useAuth();
  const location = useLocation();
  const today = todayVN();

  const setDate = (k) => (e) => {
    const v = e.target.value;
    if (!v) return;
    if (k === "checkIn" && v >= filters.checkOut) onChange({ checkIn: v, checkOut: addDays(v, 1) });
    else onChange({ [k]: v });
  };
  const setNum = (k) => (e) => onChange({ [k]: e.target.value });

  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">Giá gốc</div>
      <div className="text-2xl font-bold text-slate-900">{formatMoney(room.BasePrice)}<span className="text-sm font-normal text-slate-500"> / đêm</span></div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Nhận phòng"><input type="date" className="input" min={today} value={filters.checkIn} onChange={setDate("checkIn")} /></Field>
        <Field label="Trả phòng"><input type="date" className="input" min={addDays(filters.checkIn, 1)} value={filters.checkOut} onChange={setDate("checkOut")} /></Field>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Field label="Người lớn"><input type="number" min={1} max={10} className="input" value={filters.adults} onChange={setNum("adults")} /></Field>
        <Field label="Trẻ > 1m"><input type="number" min={0} max={10} className="input" value={filters.childrenOver1m} onChange={setNum("childrenOver1m")} /></Field>
        <Field label="Trẻ < 1m"><input type="number" min={0} max={10} className="input" value={filters.childrenUnder1m} onChange={setNum("childrenUnder1m")} /></Field>
      </div>

      <div className="mt-4 border-t border-slate-100 pt-4">
        {!stay ? (
          <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-5" />)}</div>
        ) : stay.error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{stay.error}</p>
        ) : !stay.Available ? (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg bg-red-50 p-3 text-red-700">
              <div className="font-semibold">Không đặt được với lựa chọn này</div>
              <ul className="mt-1 list-disc pl-5">{stay.Reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              {stay.ConflictDates.length > 0 && <div className="mt-1 text-xs">Đêm đã có khách: {stay.ConflictDates.map(formatDate).join(", ")}</div>}
            </div>
            <Link to={`/?${new URLSearchParams({ checkIn: filters.checkIn, checkOut: filters.checkOut, adults: filters.adults })}`} className="btn-secondary w-full">
              Xem phòng khác còn trống
            </Link>
          </div>
        ) : !user ? (
          <GuestSummary stay={stay} hotel={hotel} loginState={{ from: location.pathname + location.search }} />
        ) : user.role !== "customer" ? (
          <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Tài khoản quản trị không đặt phòng online. Đăng nhập bằng tài khoản khách hàng để đặt.</p>
        ) : (
          <CustomerBooking room={room} filters={filters} />
        )}
      </div>
    </div>
  );
}

function NightList({ nightlyRates }) {
  return (
    <ul className="space-y-1 text-sm">
      {nightlyRates.map((n) => (
        <li key={n.Date} className="flex justify-between text-slate-600"><span>Đêm {formatDate(n.Date)}</span><span className="tabular">{formatMoney(n.Price)}</span></li>
      ))}
    </ul>
  );
}

function GuestSummary({ stay, hotel, loginState }) {
  return (
    <div className="space-y-3">
      <NightList nightlyRates={stay.NightlyRates} />
      <div className="flex justify-between border-t border-slate-100 pt-2 font-semibold">
        <span>Tổng {stay.Nights} đêm</span><span className="tabular">{formatMoney(stay.SubTotal)}</span>
      </div>
      <p className="text-xs text-green-700">✓ Phòng còn trống trong khoảng ngày bạn chọn</p>
      <Link to="/login" state={loginState} className="btn-primary w-full">Đăng nhập để đặt phòng</Link>
      <p className="text-center text-xs text-slate-500">
        Chưa có tài khoản? <Link to="/register" state={loginState} className="text-brand-600 hover:underline">Đăng ký</Link>
        {hotel && ` · Cọc ${hotel.Policies.DepositPercent}% khi đặt, có thể dùng mã giảm giá`}
      </p>
    </div>
  );
}

function CustomerBooking({ room, filters }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState("");
  const { register, handleSubmit, getValues, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { voucherCode: "", notes: "" },
  });

  const base = {
    roomId: room.RoomID, checkIn: filters.checkIn, checkOut: filters.checkOut,
    adults: filters.adults, childrenOver1m: filters.childrenOver1m, childrenUnder1m: filters.childrenUnder1m,
  };
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
  const clearVoucher = () => { setVoucher(""); setValue("voucherCode", ""); };

  const create = useMutation({
    mutationFn: (body) => bookingsApi.create(body),
    onSuccess: (b) => {
      qc.invalidateQueries({ queryKey: ["rooms"] });
      qc.invalidateQueries({ queryKey: ["bookings"] });
      toast.success(`Đã giữ phòng ${room.RoomNumber} — mã đơn ${b.BookingID}`);
      navigate(`/booking/${b.BookingID}/pay`);
    },
    onError: (e) => {
      toast.error(e.message, { duration: 6000 });
      if (e.status === 409 && e.code !== "VOUCHER_EXHAUSTED") qc.invalidateQueries({ queryKey: ["rooms"] }); // phòng vừa bị đặt -> tải lại lịch & danh sách
    },
  });

  const onSubmit = (v) => create.mutate({
    ...base,
    voucherCode: voucher && voucherQuote.isSuccess ? voucher : undefined,
    notes: v.notes || undefined,
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2">
        <Field error={errors.voucherCode} className="flex-1">
          <input className="input uppercase" placeholder="Mã giảm giá" {...register("voucherCode")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }} />
        </Field>
        <button type="button" className="btn-secondary" onClick={applyVoucher} disabled={voucherQuote.isFetching}>Áp dụng</button>
        {voucher && <button type="button" className="btn-ghost px-2" onClick={clearVoucher} aria-label="Bỏ mã">✕</button>}
      </div>
      {voucher && voucherQuote.isError && <p className="field-error -mt-1">{voucherQuote.error.message}</p>}
      {voucher && voucherQuote.data && voucherQuote.data.VoucherDescription && (
        <p className="-mt-1 text-xs text-green-700">✓ {voucherQuote.data.VoucherDescription}</p>
      )}

      {baseQuote.isError ? (
        <p className="field-error">{baseQuote.error.message}</p>
      ) : !q ? (
        <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-5" />)}</div>
      ) : (
        <>
          <NightList nightlyRates={q.NightlyRates} />
          <div className="divide-y divide-slate-100 border-t border-slate-100">
            <Row label={`Tiền phòng (${q.Nights} đêm)`} value={formatMoney(q.SubTotal)} />
            {q.DiscountAmount > 0 && <Row label={`Giảm giá ${q.VoucherCode}`} value={`−${formatMoney(q.DiscountAmount)}`} cls="text-green-700" />}
            <Row label="Tổng tiền" value={formatMoney(q.TotalPrice)} cls="font-semibold" />
            <Row label={`Đặt cọc ${q.DepositPercent}% (trả ngay)`} value={formatMoney(q.DepositAmount)} cls="font-semibold text-brand-700" />
            <Row label="Trả khi trả phòng" value={formatMoney(q.RemainingAmount)} cls="text-slate-500" />
          </div>
        </>
      )}

      <Field error={errors.notes}>
        <textarea rows={2} className="input" placeholder="Ghi chú cho khách sạn (không bắt buộc)" {...register("notes")} />
      </Field>
      <button className="btn-primary w-full py-2.5" onClick={handleSubmit(onSubmit)} disabled={!q || create.isPending || voucherQuote.isFetching}>
        {create.isPending ? "Đang giữ phòng..." : "Đặt phòng ngay"}
      </button>
      {q && <p className="text-center text-xs text-slate-500">Phòng được giữ {q.PendingHoldMinutes} phút để bạn thanh toán cọc.</p>}
    </div>
  );
}

const Row = ({ label, value, cls = "" }) => (
  <div className={`flex justify-between py-1.5 ${cls}`}><span>{label}</span><span className="tabular">{value}</span></div>
);
