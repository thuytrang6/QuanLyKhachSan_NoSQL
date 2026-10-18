import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { bookingsApi } from "../api/bookings";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { bookingFormSchema } from "../validation/schemas";
import { formatDate, formatMoney, todayVN, addDays } from "../utils/format";
import Field from "./Field";
import { Skeleton } from "./Skeleton";

// Khung đặt phòng bên phải trang chi tiết. Mọi con số (giá đêm, giảm giá, cọc) do server tính.
export default function BookingPanel({ room, stay, filters, onChange, hotel }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const today = todayVN();

  const setDate = (k) => (e) => {
    const v = e.target.value;
    if (!v) return;
    if (k === "checkIn") {
      if (v >= filters.checkOut) {
        onChange({ checkIn: v, checkOut: addDays(v, 1) });
      } else {
        onChange({ checkIn: v });
      }
    } else if (k === "checkOut") {
      if (v <= filters.checkIn) {
        toast.error("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm");
        onChange({ checkOut: addDays(filters.checkIn, 1) });
      } else {
        onChange({ checkOut: v });
      }
    }
  };
  const setNum = (k) => (e) => onChange({ [k]: e.target.value });

  return (
    <div className="card p-5">
      <div className="text-sm text-slate-500">Giá gốc</div>
      <div className="text-2xl font-bold text-slate-900">{formatMoney(room.BasePrice)}<span className="text-sm font-normal text-slate-500"> / đêm</span></div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Field label="Nhận phòng"><input type="date" className="input" min={today} value={filters.checkIn} onChange={setDate("checkIn")} /></Field>
        <Field label="Trả phòng"><input type="date" className="input" min={addDays(filters.checkIn || today, 1)} value={filters.checkOut} onChange={setDate("checkOut")} /></Field>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 items-end">
        <div className="flex flex-col justify-end">
          <label className="label h-9 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Người lớn</label>
          <input type="number" min={1} max={10} className="input text-center px-1" value={filters.adults} onChange={setNum("adults")} />
        </div>
        <div className="flex flex-col justify-end">
          <label className="label h-9 flex items-end pb-1 text-xs font-medium text-slate-700 leading-tight">
            <span>Trẻ &gt; 1m <span className="text-[11px] font-semibold text-amber-600 whitespace-nowrap">(+100k)</span></span>
          </label>
          <input type="number" min={0} max={10} className="input text-center px-1" value={filters.childrenOver1m} onChange={setNum("childrenOver1m")} />
        </div>
        <div className="flex flex-col justify-end">
          <label className="label h-9 flex items-end pb-1 text-xs font-medium text-slate-700 leading-tight">
            <span>Trẻ &lt; 1m <span className="text-[11px] font-semibold text-emerald-600 whitespace-nowrap">(0đ)</span></span>
          </label>
          <input type="number" min={0} max={10} className="input text-center px-1" value={filters.childrenUnder1m} onChange={setNum("childrenUnder1m")} />
        </div>
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
          <GuestSummary stay={stay} hotel={hotel} filters={filters} loginState={{ from: location.pathname + location.search }} />
        ) : user.role !== "customer" ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900 space-y-2.5">
            <div className="font-semibold text-amber-950">
              Tài khoản Quản trị ({user.FullName})
            </div>
            <p className="text-xs text-amber-800 leading-relaxed">
              Bạn đang đăng nhập quyền {user.Role}. Hệ thống chỉ cho phép tài khoản <strong>Khách hàng</strong> đặt phòng trực tuyến.
            </p>
            <button
              type="button"
              className="btn-secondary w-full text-xs py-2 bg-white hover:bg-amber-100 border-amber-300"
              onClick={async () => {
                await logout();
                toast.success("Đã đăng xuất tài khoản quản trị");
              }}
            >
              Đổi sang tài khoản Khách hàng
            </button>
          </div>
        ) : (
          <CustomerBooking room={room} filters={filters} hotel={hotel} />
        )}
      </div>
    </div>
  );
}

function NightList({ nightlyRates }) {
  return (
    <ul className="space-y-1.5 text-sm">
      {nightlyRates.map((n) => (
        <li key={n.Date} className="flex items-center justify-between text-slate-600">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span>Đêm {formatDate(n.Date)}</span>
            {n.IsHoliday && (
              <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700 border border-rose-200" title={n.RateName}>
                🎉 {n.RateName}
              </span>
            )}
          </div>
          <span className="tabular font-medium text-slate-800">{formatMoney(n.Price)}</span>
        </li>
      ))}
    </ul>
  );
}

function GuestSummary({ stay, hotel, filters, loginState }) {
  const childTotal = stay.ChildSurchargeTotal || 0;
  const estimatedTotal = stay.EstimatedTotal || (stay.SubTotal + childTotal);

  return (
    <div className="space-y-3">
      <NightList nightlyRates={stay.NightlyRates} />
      <div className="divide-y divide-slate-100 border-t border-slate-100 text-sm">
        <div className="flex justify-between py-1.5 text-slate-600">
          <span>Tiền phòng ({stay.Nights} đêm)</span>
          <span className="tabular font-medium">{formatMoney(stay.SubTotal)}</span>
        </div>
        {childTotal > 0 && (
          <div className="flex justify-between py-1.5 text-amber-700 font-medium">
            <span>Phụ thu trẻ em ({filters.childrenOver1m} trẻ &gt; 1m × 100.000đ × {stay.Nights} đêm)</span>
            <span className="tabular">+{formatMoney(childTotal)}</span>
          </div>
        )}
        {Number(filters.childrenUnder1m) > 0 && (
          <div className="py-1 text-xs text-emerald-700">
            {filters.childrenUnder1m} trẻ em dưới 1m: Miễn phí lưu trú
          </div>
        )}
        <div className="flex justify-between py-1.5 font-bold text-slate-900 text-base">
          <span>Tổng tiền dự kiến</span>
          <span className="tabular text-brand-700">{formatMoney(estimatedTotal)}</span>
        </div>
      </div>
      <div className="space-y-1">
        <p className="text-xs text-green-700">Phòng còn trống trong khoảng ngày bạn chọn</p>
        {stay.CheckInDate && (
          new Date(`${stay.CheckInDate}T${hotel?.CheckInTime || "14:00"}:00+07:00`).getTime() - Date.now() < (hotel?.Policies?.FreeCancelBeforeHours || 48) * 3600e3 ? (
            <p className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 leading-relaxed">
              <strong>Lưu ý:</strong> Ngày nhận phòng dưới 48 giờ. Đơn đặt cận ngày không áp dụng hoàn cọc khi hủy.
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Miễn phí hủy trước 14:00 ngày {formatDate(addDays(stay.CheckInDate, -2))} (hoàn 100% cọc)
            </p>
          )
        )}
      </div>

      <Link
        to="/login"
        state={loginState}
        className="btn-primary w-full py-2.5 text-center font-medium block shadow-sm hover:shadow"
      >
        Đăng nhập để đặt phòng
      </Link>
      <p className="text-center text-xs text-slate-500">
        Chưa có tài khoản?{" "}
        <Link to="/register" state={loginState} className="font-semibold text-brand-600 hover:underline">
          Đăng ký ngay
        </Link>
      </p>
    </div>
  );
}

function CustomerBooking({ room, filters, hotel }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [voucher, setVoucher] = useState("");
  const [paymentMode, setPaymentMode] = useState("pay_at_hotel"); // "pay_at_hotel" (K làm thanh toán) | "deposit_online"
  const { register, handleSubmit, getValues, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(bookingFormSchema),
    defaultValues: { voucherCode: "", notes: "", paymentMode: "pay_at_hotel" },
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
      if (b.isDirectConfirm) {
        toast.success(`Đặt phòng thành công! Mã đơn ${b.BookingID} đã được xác nhận.`);
        navigate(`/my-bookings/${b.BookingID}`);
      } else {
        toast.success(`Đã giữ phòng ${room.RoomNumber} — mã đơn ${b.BookingID}`);
        navigate(`/booking/${b.BookingID}/pay`);
      }
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
    paymentMode,
  });

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-start gap-2">
        <Field error={errors.voucherCode} className="flex-1">
          <input className="input uppercase" placeholder="Mã giảm giá" {...register("voucherCode")}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); applyVoucher(); } }} />
        </Field>
        <button type="button" className="btn-secondary" onClick={applyVoucher} disabled={voucherQuote.isFetching}>Áp dụng</button>
        {voucher && <button type="button" className="btn-ghost px-2 text-xs text-slate-500 hover:text-slate-800" onClick={clearVoucher}>Bỏ mã</button>}
      </div>
      {voucher && voucherQuote.isError && <p className="field-error -mt-1">{voucherQuote.error.message}</p>}
      {voucher && voucherQuote.data && voucherQuote.data.VoucherDescription && (
        <p className="-mt-1 text-xs text-green-700">{voucherQuote.data.VoucherDescription}</p>
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
            {q.ChildSurchargeTotal > 0 && (
              <Row
                label={`Phụ thu trẻ em (${filters.childrenOver1m} trẻ > 1m × 100.000đ × ${q.Nights} đêm)`}
                value={`+${formatMoney(q.ChildSurchargeTotal)}`}
                cls="text-amber-700 font-medium"
              />
            )}
            {filters.childrenUnder1m > 0 && (
              <div className="py-1 text-xs text-emerald-700">
                {filters.childrenUnder1m} trẻ em dưới 1m: Miễn phí lưu trú
              </div>
            )}
            {q.DiscountAmount > 0 && <Row label={`Giảm giá ${q.VoucherCode}`} value={`−${formatMoney(q.DiscountAmount)}`} cls="text-green-700" />}
            <Row label="Tổng tiền" value={formatMoney(q.TotalPrice)} cls="font-semibold text-base" />
            {paymentMode === "deposit_online" ? (
              <>
                <Row label={`Đặt cọc ${q.DepositPercent}% (trả ngay)`} value={formatMoney(q.DepositAmount)} cls="font-semibold text-brand-700" />
                <Row label="Trả khi nhận phòng" value={formatMoney(q.RemainingAmount)} cls="text-slate-500" />
              </>
            ) : (
              <Row label="Thanh toán khi nhận phòng" value={formatMoney(q.TotalPrice)} cls="font-semibold text-brand-700" />
            )}
          </div>

          {/* Chọn phương thức đặt phòng */}
          <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-2.5">
            <div className="text-xs font-semibold uppercase text-slate-600 tracking-wide">Phương thức đặt phòng</div>
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="radio"
                name="paymentMode"
                value="pay_at_hotel"
                checked={paymentMode === "pay_at_hotel"}
                onChange={() => setPaymentMode("pay_at_hotel")}
                className="mt-1 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">Xác nhận đặt phòng ngay (Thanh toán tại khách sạn)</div>
                <div className="text-xs text-slate-500 leading-relaxed">Không cần thanh toán trước. Đơn được xác nhận ngay lập tức, thanh toán khi nhận phòng.</div>
              </div>
            </label>
            <label className="flex items-start gap-2.5 cursor-pointer pt-1 border-t border-slate-200/60">
              <input
                type="radio"
                name="paymentMode"
                value="deposit_online"
                checked={paymentMode === "deposit_online"}
                onChange={() => setPaymentMode("deposit_online")}
                className="mt-1 text-brand-600 focus:ring-brand-500"
              />
              <div>
                <div className="text-sm font-semibold text-slate-900">Thanh toán cọc 20% online (VNPay Demo)</div>
                <div className="text-xs text-slate-500 leading-relaxed">Giữ chỗ 15 phút để thanh toán cọc qua cổng giả lập.</div>
              </div>
            </label>
          </div>

          {filters.checkIn && (
            new Date(`${filters.checkIn}T${hotel?.CheckInTime || "14:00"}:00+07:00`).getTime() - Date.now() < (hotel?.Policies?.FreeCancelBeforeHours || 48) * 3600e3 ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-xs text-amber-900 leading-relaxed">
                <strong>Đặt cận ngày:</strong> Nhận phòng trong vòng 48h ({formatDate(filters.checkIn)}), không áp dụng hủy hoàn cọc theo chính sách khách sạn.
              </div>
            ) : (
              <div className="text-xs text-green-700">
                Miễn phí hủy phòng trước 14:00 ngày {formatDate(addDays(filters.checkIn, -2))} (hoàn 100% cọc)
              </div>
            )
          )}
        </>
      )}

      <Field error={errors.notes}>
        <textarea rows={2} className="input" placeholder="Ghi chú cho khách sạn (không bắt buộc)" {...register("notes")} />
      </Field>
      <button className="btn-primary w-full py-2.5 font-semibold text-base shadow hover:shadow-md" onClick={handleSubmit(onSubmit)} disabled={!q || create.isPending || voucherQuote.isFetching}>
        {create.isPending ? "Đang xử lý..." : paymentMode === "pay_at_hotel" ? "Xác nhận đặt phòng (Không cần thanh toán)" : "Đặt phòng & Thanh toán cọc"}
      </button>
      {q && paymentMode === "deposit_online" && (
        <p className="text-center text-xs text-slate-500">Phòng được giữ {q.PendingHoldMinutes} phút để bạn thanh toán cọc.</p>
      )}
    </div>
  );
}

const Row = ({ label, value, cls = "" }) => (
  <div className={`flex justify-between py-1.5 ${cls}`}><span>{label}</span><span className="tabular">{value}</span></div>
);
