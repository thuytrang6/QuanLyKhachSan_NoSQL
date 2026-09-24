import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { roomsApi } from "../api/rooms";
import { useRoomTypes } from "../hooks/useRoomTypes";
import { searchSchema } from "../validation/schemas";
import { formatDate, formatMoney, todayVN, addDays } from "../utils/format";
import Field from "../components/Field";
import RoomImage from "../components/RoomImage";
import EmptyState, { ErrorState } from "../components/EmptyState";
import { CardGridSkeleton } from "../components/Skeleton";
import BookingModal from "../components/BookingModal";

export default function RoomsPage() {
  const types = useRoomTypes();
  const [params, setParams] = useState(null);
  const [selected, setSelected] = useState(null);
  const today = todayVN();
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(searchSchema),
    defaultValues: { checkIn: today, checkOut: addDays(today, 1), adults: 2, childrenOver1m: 0, childrenUnder1m: 0, roomTypeId: "" },
  });

  // Danh sách phòng trống do server tính từ DynamoDB (AP3 + AP5), frontend không tự lọc
  const search = useQuery({
    queryKey: ["rooms", "search", params],
    queryFn: () => roomsApi.search(params),
    enabled: !!params,
  });

  const onSubmit = (v) => setParams({ ...v, roomTypeId: v.roomTypeId || undefined });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-semibold">Tìm phòng trống</h1>
      <p className="mt-1 text-sm text-slate-500">Chọn ngày lưu trú và số khách. Trẻ dưới 1m miễn phí, không tính vào sức chứa.</p>

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="card mt-5 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-7">
        <Field label="Nhận phòng" error={errors.checkIn}>
          <input type="date" className="input" min={today} {...register("checkIn")} />
        </Field>
        <Field label="Trả phòng" error={errors.checkOut}>
          <input type="date" className="input" min={today} {...register("checkOut")} />
        </Field>
        <Field label="Người lớn" error={errors.adults}>
          <input type="number" min={1} max={10} className="input" {...register("adults")} />
        </Field>
        <Field label="Trẻ trên 1m" error={errors.childrenOver1m}>
          <input type="number" min={0} max={10} className="input" {...register("childrenOver1m")} />
        </Field>
        <Field label="Trẻ dưới 1m" error={errors.childrenUnder1m}>
          <input type="number" min={0} max={10} className="input" {...register("childrenUnder1m")} />
        </Field>
        <Field label="Loại phòng">
          <select className="input" {...register("roomTypeId")} disabled={types.isLoading}>
            <option value="">Tất cả</option>
            {(types.data || []).map((t) => <option key={t.RoomTypeID} value={t.RoomTypeID}>{t.Name}</option>)}
          </select>
        </Field>
        <div className="flex items-end">
          <button className="btn-primary w-full" disabled={search.isFetching}>{search.isFetching ? "Đang tìm..." : "Tìm phòng"}</button>
        </div>
      </form>

      <section className="mt-6">
        {!params && <EmptyState icon="🔎" title="Bắt đầu tìm phòng" description="Nhập ngày nhận/trả phòng và bấm Tìm phòng để xem phòng còn trống cùng giá từng đêm." />}
        {params && search.isLoading && <CardGridSkeleton />}
        {params && search.isError && <ErrorState error={search.error} onRetry={search.refetch} />}
        {search.data && (
          <>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 text-sm text-slate-600">
              <span>
                <b>{search.data.rooms.length}</b> phòng trống · {formatDate(params.checkIn)} → {formatDate(params.checkOut)} ({search.data.nights} đêm)
              </span>
              {search.isFetching && <span className="text-xs text-slate-400">Đang cập nhật...</span>}
            </div>
            {search.data.rooms.length === 0 ? (
              <EmptyState icon="🛏️" title="Không còn phòng phù hợp" description="Thử đổi ngày, loại phòng hoặc giảm số khách." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {search.data.rooms.map((r) => <RoomCard key={r.RoomID} room={r} onBook={() => setSelected(r)} />)}
              </div>
            )}
          </>
        )}
      </section>

      {selected && <BookingModal room={selected} params={params} onClose={() => setSelected(null)} />}
    </div>
  );
}

function RoomCard({ room, onBook }) {
  return (
    <article className="card flex flex-col overflow-hidden">
      <RoomImage images={room.Images} alt={`Phòng ${room.RoomNumber}`} label={room.RoomTypeName} />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="font-semibold text-slate-900">{room.RoomTypeName}</h3>
            <p className="text-sm text-slate-500">Phòng {room.RoomNumber} · Tầng {room.Floor} · {room.View}</p>
          </div>
          <span className="whitespace-nowrap rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">≤ {room.Capacity} khách</span>
        </div>
        <p className="mt-1 text-xs text-slate-500">{room.BedType} · {room.AreaM2} m²</p>
        {room.Amenities && room.Amenities.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {room.Amenities.map((a) => <span key={a} className="rounded-full bg-brand-50 px-2 py-0.5 text-xs text-brand-700">{a}</span>)}
          </div>
        )}
        <ul className="mt-3 space-y-0.5 text-sm">
          {room.NightlyRates.map((n) => (
            <li key={n.Date} className="flex justify-between text-slate-600">
              <span>Đêm {formatDate(n.Date)}</span>
              <span className="tabular">{formatMoney(n.Price)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-auto flex items-end justify-between border-t border-slate-100 pt-3">
          <div>
            <div className="text-xs text-slate-500">Tổng {room.Nights} đêm</div>
            <div className="text-lg font-semibold text-slate-900">{formatMoney(room.SubTotal)}</div>
          </div>
          <button className="btn-primary" onClick={onBook}>Đặt phòng</button>
        </div>
      </div>
    </article>
  );
}
