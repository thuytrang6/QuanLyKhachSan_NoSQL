import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { roomsApi } from "../api/rooms";
import { useHotel, useRoomTypes } from "../hooks/useRoomTypes";
import { searchSchema } from "../validation/schemas";
import toast from "react-hot-toast";
import { addDays, formatDate, formatMoney, formatNumber, todayVN } from "../utils/format";
import { compact, readFilters, stayOf, toQuery } from "../utils/stay";
import Field from "../components/Field";
import RoomImage from "../components/RoomImage";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { CardGridSkeleton, Skeleton } from "../components/Skeleton";

const SORT_OPTIONS = [
  { value: "price_asc", label: "Giá thấp đến cao" },
  { value: "price_desc", label: "Giá cao đến thấp" },
  { value: "floor", label: "Theo tầng" },
];

export default function HomePage() {
  const [sp, setSp] = useSearchParams();
  const filters = readFilters(sp);
  const types = useRoomTypes();
  const hotel = useHotel();
  const today = todayVN();

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: filters,
  });
  const checkInVal = watch("checkIn");
  const checkOutVal = watch("checkOut");

  const onCheckInChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    setValue("checkIn", v);
    if (v >= checkOutVal) setValue("checkOut", addDays(v, 1));
  };

  const onCheckOutChange = (e) => {
    const v = e.target.value;
    if (!v) return;
    if (v <= checkInVal) {
      toast.error("Ngày trả phòng phải sau ngày nhận phòng ít nhất 1 đêm");
      setValue("checkOut", addDays(checkInVal, 1));
    } else {
      setValue("checkOut", v);
    }
  };
  // Bộ lọc đổi từ bên ngoài form (bấm chip loại phòng, nút Back) -> đồng bộ lại form
  const key = sp.toString();
  useEffect(() => { reset(readFilters(sp)); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  // Phòng trống, giá, lọc giá và sắp xếp đều do server tính từ DynamoDB
  const search = useQuery({
    queryKey: ["rooms", "search", filters],
    queryFn: () => roomsApi.search(compact(filters)),
    placeholderData: keepPreviousData,
  });

  const apply = (patch) => setSp(compact({ ...filters, ...patch }));
  const onSubmit = (v) => apply({ ...v, maxPrice: v.maxPrice || "", roomTypeId: v.roomTypeId || "", floor: v.floor || "" });
  const detailQuery = toQuery(stayOf(filters));

  // Mức giá tối đa gợi ý lấy từ giá gốc của các loại phòng trong DB
  const priceOptions = [...new Set((types.data || []).map((t) => t.BasePrice))].sort((a, b) => a - b);
  const floorOptions = (search.data?.floors || [1, 2, 3, 4, 5])
    .filter((f) => f != null && f !== "" && !isNaN(Number(f)))
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div>
      {/* ---------- Hero ---------- */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-amber-400 text-white">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-white/10" aria-hidden />
        <div className="absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-white/10" aria-hidden />
        <div className="relative mx-auto max-w-7xl px-4 pb-24 pt-10 sm:pt-14">
          {hotel.isLoading ? (
            <div className="space-y-3"><Skeleton className="h-10 w-72 bg-white/30" /><Skeleton className="h-5 w-96 bg-white/30" /></div>
          ) : hotel.data && (
            <>
              <div className="text-sm font-medium text-white/80">{hotel.data.StarRating} sao · {hotel.data.City}</div>
              <h1 className="mt-1 text-3xl font-bold sm:text-4xl">{hotel.data.HotelName}</h1>
              <p className="mt-2 max-w-2xl text-white/90">{hotel.data.Address}, {hotel.data.City}</p>
              <div className="mt-5 flex flex-wrap gap-3 text-sm">
                <HeroStat label="Đánh giá" value={`${hotel.data.RatingAvg} / 5`} sub={`${formatNumber(hotel.data.ReviewCount)} lượt`} />
                <HeroStat label="Số phòng" value={hotel.data.TotalRooms} sub={types.data ? `${types.data.length} hạng phòng` : ""} />
                <HeroStat label="Nhận / trả phòng" value={`${hotel.data.CheckInTime} / ${hotel.data.CheckOutTime}`} sub="giờ Việt Nam" />
                <HeroStat label="Hủy miễn phí" value={`trước ${hotel.data.Policies.FreeCancelBeforeHours} giờ`} sub={`cọc ${hotel.data.Policies.DepositPercent}% khi đặt`} />
              </div>
            </>
          )}
        </div>
      </section>

      <div className="mx-auto -mt-16 max-w-7xl px-4 pb-12">
        {/* ---------- Bộ lọc ---------- */}
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="card relative grid gap-2.5 p-4 sm:p-5 shadow-lg grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-[1.5fr_1.5fr_0.9fr_1.1fr_1.1fr_1fr_1.4fr_1.4fr_1.2fr] items-end">
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Nhận phòng</span>} error={errors.checkIn} className="min-w-0">
            <input type="date" className="input" min={today} {...register("checkIn", { onChange: onCheckInChange })} />
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Trả phòng</span>} error={errors.checkOut} className="min-w-0">
            <input type="date" className="input" min={addDays(checkInVal || today, 1)} {...register("checkOut", { onChange: onCheckOutChange })} />
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Người lớn</span>} error={errors.adults} className="min-w-0">
            <input type="number" min={1} max={10} className="input text-center px-1" {...register("adults")} />
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs font-medium text-slate-700 leading-tight whitespace-nowrap">Trẻ &gt; 1m <span className="ml-1 text-[11px] font-semibold text-amber-600">(+100k)</span></span>} error={errors.childrenOver1m} className="min-w-0">
            <input type="number" min={0} max={10} className="input text-center px-1" {...register("childrenOver1m")} />
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs font-medium text-slate-700 leading-tight whitespace-nowrap">Trẻ &lt; 1m <span className="ml-1 text-[11px] font-semibold text-emerald-600">(0đ)</span></span>} error={errors.childrenUnder1m} className="min-w-0">
            <input type="number" min={0} max={10} className="input text-center px-1" {...register("childrenUnder1m")} />
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Tầng</span>} className="min-w-0">
            <select className="input truncate" {...register("floor")}>
              <option value="">Tất cả tầng</option>
              {floorOptions.map((f) => <option key={f} value={f}>Tầng {f}</option>)}
            </select>
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Giá tối đa / đêm</span>} className="min-w-0">
            <select className="input truncate" {...register("maxPrice")}>
              <option value="">Không giới hạn</option>
              {priceOptions.map((p) => <option key={p} value={p}>Tối đa {formatMoney(p)}</option>)}
            </select>
          </Field>
          <Field label={<span className="h-8 flex items-end pb-1 text-xs sm:text-sm font-medium text-slate-700">Sắp xếp</span>} className="min-w-0">
            <select className="input truncate" {...register("sort")}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div className="flex flex-col justify-end min-w-0 col-span-2 sm:col-span-1">
            <button
              type="submit"
              className="btn-primary w-full h-[38px] whitespace-nowrap px-3 text-sm font-semibold shadow-sm hover:shadow active:scale-[0.99] transition flex items-center justify-center gap-1.5"
              disabled={search.isFetching}
            >
              <span>{search.isFetching ? "Đang tìm..." : "Tìm phòng"}</span>
            </button>
          </div>
          <input type="hidden" {...register("roomTypeId")} />
        </form>

        {/* ---------- Loại phòng ---------- */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Hạng phòng</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <TypeChip active={!filters.roomTypeId} onClick={() => apply({ roomTypeId: "" })} title="Tất cả hạng phòng" sub="Xem mọi phòng còn trống" />
            {types.isLoading && [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20" />)}
            {(types.data || []).map((t) => (
              <TypeChip key={t.RoomTypeID} active={filters.roomTypeId === t.RoomTypeID} onClick={() => apply({ roomTypeId: t.RoomTypeID })}
                title={t.Name} sub={`từ ${formatMoney(t.BasePrice)}/đêm · Tối đa ${t.Capacity} khách`} />
            ))}
          </div>
        </section>

        {/* ---------- Kết quả ---------- */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Phòng còn trống</h2>
            {search.data && (
              <span className="text-sm text-slate-600">
                <b>{search.data.rooms.length}</b> phòng · {formatDate(filters.checkIn)} đến {formatDate(filters.checkOut)} ({search.data.nights} đêm)
                {search.isFetching && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
              </span>
            )}
          </div>
          {search.isLoading && <CardGridSkeleton count={8} />}
          {search.isError && <ErrorState error={search.error} onRetry={search.refetch} />}
          {search.data && search.data.rooms.length === 0 && (
            <EmptyState title="Không còn phòng phù hợp" description="Thử đổi ngày, hạng phòng, mức giá hoặc giảm số khách."
              action={<button className="btn-secondary" onClick={() => setSp({})}>Xóa bộ lọc</button>} />
          )}
          {search.data && search.data.rooms.length > 0 && (
            <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 ${search.isFetching ? "opacity-60" : ""}`}>
              {search.data.rooms.map((r) => <RoomCard key={r.RoomID} room={r} to={`/rooms/${r.RoomID}?${detailQuery}`} />)}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function HeroStat({ label, value, sub }) {
  return (
    <div className="rounded-xl bg-white/15 px-4 py-2 backdrop-blur">
      <div className="text-xs text-white/75">{label}</div>
      <div className="font-semibold">{value}</div>
      <div className="text-xs text-white/75">{sub}</div>
    </div>
  );
}

function TypeChip({ active, onClick, title, sub }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`card px-4 py-3 text-left transition hover:border-brand-300 hover:shadow ${active ? "border-brand-500 bg-brand-50 ring-2 ring-brand-200" : ""}`}>
      <div className={`font-semibold ${active ? "text-brand-700" : "text-slate-800"}`}>{title}</div>
      <div className="mt-0.5 text-xs text-slate-500">{sub}</div>
    </button>
  );
}

// Cả thẻ là link sang trang chi tiết phòng
function RoomCard({ room, to }) {
  const shown = (room.Amenities || []).slice(0, 4);
  const more = (room.Amenities || []).length - shown.length;
  const images = room.Images && room.Images.length ? room.Images : room.RoomTypeImages || [];
  return (
    <Link to={to} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
      <div className="relative">
        <RoomImage images={images} alt={`Phòng ${room.RoomNumber}`} label={room.RoomTypeName} typeId={room.RoomTypeID} className="h-44" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow">Phòng {room.RoomNumber}</span>
        <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-white">Tối đa {room.Capacity} khách</span>
        {room.HasHoliday && (
          <span className="absolute bottom-3 left-3 rounded-full bg-rose-600/95 px-2.5 py-0.5 text-[11px] font-semibold text-white shadow backdrop-blur flex items-center gap-1">
            <span>🎉</span> Dịp Lễ (+10% giá phòng)
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold text-slate-900 group-hover:text-brand-700">{room.RoomTypeName}</h3>
        <p className="text-sm text-slate-500">Tầng {room.Floor} · {room.View}</p>
        <p className="mt-0.5 text-xs text-slate-500">{room.BedType} · {room.AreaM2} m²</p>
        {shown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {shown.map((a) => <span key={a} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">{a}</span>)}
            {more > 0 && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">+{more}</span>}
          </div>
        )}
        <div className="mt-auto flex items-end justify-between gap-2 border-t border-slate-100 pt-3">
          <div>
            <div className="text-xs text-slate-500">{room.MinNightPrice === room.MaxNightPrice ? "Giá mỗi đêm" : "Từ"}</div>
            <div className="text-lg font-bold text-brand-700">{formatMoney(room.MinNightPrice)}</div>
            <div className="text-xs text-slate-500">
              Tổng {room.Nights} đêm: <span className="tabular font-medium text-slate-700">{formatMoney(room.EstimatedTotal || room.SubTotal)}</span>
              {room.ChildSurchargeTotal > 0 && (
                <span className="text-amber-700 block text-[11px] font-medium">
                  (Gồm phụ thu trẻ em: +{formatMoney(room.ChildSurchargeTotal)})
                </span>
              )}
            </div>
          </div>
          <span className="text-sm font-medium text-brand-600 group-hover:underline">Xem chi tiết</span>
        </div>
      </div>
    </Link>
  );
}
