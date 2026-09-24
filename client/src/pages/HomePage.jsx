import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { roomsApi } from "../api/rooms";
import { useHotel, useRoomTypes } from "../hooks/useRoomTypes";
import { searchSchema } from "../validation/schemas";
import { formatDate, formatMoney, formatNumber, todayVN } from "../utils/format";
import { compact, readFilters, stayOf, toQuery } from "../utils/stay";
import Field from "../components/Field";
import RoomImage from "../components/RoomImage";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { CardGridSkeleton, Skeleton } from "../components/Skeleton";

const SORT_OPTIONS = [
  { value: "price_asc", label: "Giá thấp → cao" },
  { value: "price_desc", label: "Giá cao → thấp" },
  { value: "floor", label: "Theo tầng" },
];

export default function HomePage() {
  const [sp, setSp] = useSearchParams();
  const filters = readFilters(sp);
  const types = useRoomTypes();
  const hotel = useHotel();
  const today = todayVN();

  const { register, handleSubmit, reset, formState: { errors } } = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: filters,
  });
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
  const onSubmit = (v) => apply({ ...v, maxPrice: v.maxPrice || "", roomTypeId: v.roomTypeId || "" });
  const detailQuery = toQuery(stayOf(filters));

  // Mức giá tối đa gợi ý lấy từ giá gốc của các loại phòng trong DB
  const priceOptions = [...new Set((types.data || []).map((t) => t.BasePrice))].sort((a, b) => a - b);

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
              <div className="text-sm font-medium text-white/80">{"★".repeat(hotel.data.StarRating)} · {hotel.data.City}</div>
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
        <form onSubmit={handleSubmit(onSubmit)} noValidate className="card relative grid gap-3 p-4 shadow-lg sm:grid-cols-2 lg:grid-cols-8">
          <Field label="Nhận phòng" error={errors.checkIn} className="lg:col-span-1">
            <input type="date" className="input" min={today} {...register("checkIn")} />
          </Field>
          <Field label="Trả phòng" error={errors.checkOut} className="lg:col-span-1">
            <input type="date" className="input" min={today} {...register("checkOut")} />
          </Field>
          <Field label="Người lớn" error={errors.adults}>
            <input type="number" min={1} max={10} className="input" {...register("adults")} />
          </Field>
          <Field label="Trẻ > 1m" error={errors.childrenOver1m}>
            <input type="number" min={0} max={10} className="input" {...register("childrenOver1m")} />
          </Field>
          <Field label="Trẻ < 1m" error={errors.childrenUnder1m} hint="miễn phí">
            <input type="number" min={0} max={10} className="input" {...register("childrenUnder1m")} />
          </Field>
          <Field label="Giá tối đa / đêm">
            <select className="input" {...register("maxPrice")}>
              <option value="">Không giới hạn</option>
              {priceOptions.map((p) => <option key={p} value={p}>≤ {formatMoney(p)}</option>)}
            </select>
          </Field>
          <Field label="Sắp xếp">
            <select className="input" {...register("sort")}>
              {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
          <div className="flex items-end">
            <button className="btn-primary w-full" disabled={search.isFetching}>{search.isFetching ? "Đang tìm..." : "Tìm phòng"}</button>
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
                title={t.Name} sub={`từ ${formatMoney(t.BasePrice)}/đêm · ≤ ${t.Capacity} khách`} />
            ))}
          </div>
        </section>

        {/* ---------- Kết quả ---------- */}
        <section className="mt-8">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">Phòng còn trống</h2>
            {search.data && (
              <span className="text-sm text-slate-600">
                <b>{search.data.rooms.length}</b> phòng · {formatDate(filters.checkIn)} → {formatDate(filters.checkOut)} ({search.data.nights} đêm)
                {search.isFetching && <span className="ml-2 text-xs text-slate-400">Đang cập nhật...</span>}
              </span>
            )}
          </div>
          {search.isLoading && <CardGridSkeleton count={8} />}
          {search.isError && <ErrorState error={search.error} onRetry={search.refetch} />}
          {search.data && search.data.rooms.length === 0 && (
            <EmptyState icon="🛏️" title="Không còn phòng phù hợp" description="Thử đổi ngày, hạng phòng, mức giá hoặc giảm số khách."
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
  return (
    <Link to={to} className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400">
      <div className="relative">
        <RoomImage images={room.Images} alt={`Phòng ${room.RoomNumber}`} label={room.RoomTypeName} typeId={room.RoomTypeID} className="h-44" />
        <span className="absolute left-3 top-3 rounded-full bg-white/90 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow">Phòng {room.RoomNumber}</span>
        <span className="absolute right-3 top-3 rounded-full bg-slate-900/70 px-2 py-0.5 text-xs text-white">≤ {room.Capacity} khách</span>
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
            <div className="text-xs text-slate-500">Tổng {room.Nights} đêm: <span className="tabular font-medium text-slate-700">{formatMoney(room.SubTotal)}</span></div>
          </div>
          <span className="text-sm font-medium text-brand-600 group-hover:underline">Xem chi tiết →</span>
        </div>
      </div>
    </Link>
  );
}
