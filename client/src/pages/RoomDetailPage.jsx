import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { roomsApi } from "../api/rooms";
import { useHotel } from "../hooks/useRoomTypes";
import { addDays } from "../utils/format";
import { compact, readFilters, stayOf } from "../utils/stay";
import RoomImage from "../components/RoomImage";
import AvailabilityCalendar from "../components/AvailabilityCalendar";
import BookingPanel from "../components/BookingPanel";
import { ErrorState } from "../components/EmptyState";
import { PageSkeleton, Skeleton } from "../components/Skeleton";

export default function RoomDetailPage() {
  const { id } = useParams();
  const [sp, setSp] = useSearchParams();
  const filters = readFilters(sp);
  const stay = stayOf(filters);
  const hotel = useHotel();
  const [picking, setPicking] = useState(false); // đang chờ chọn ngày trả trên lịch
  const [imgIndex, setImgIndex] = useState(0);

  const detail = useQuery({
    queryKey: ["rooms", "detail", id, stay],
    queryFn: () => roomsApi.detail(id, compact(stay)),
    placeholderData: keepPreviousData,
  });

  const change = (patch) => setSp(compact({ ...filters, ...patch }), { replace: true });

  // Bấm lịch: lần 1 chọn ngày nhận, lần 2 (ngày sau đó) chọn ngày trả
  const onPick = (date) => {
    if (picking && date > filters.checkIn) {
      change({ checkOut: date });
      setPicking(false);
    } else {
      change({ checkIn: date, checkOut: addDays(date, 1) });
      setPicking(true);
    }
  };

  if (detail.isLoading) return <PageSkeleton />;
  if (detail.isError) return <div className="mx-auto max-w-3xl px-4 py-10"><ErrorState error={detail.error} onRetry={detail.refetch} /></div>;
  const { room, calendar, stay: stayInfo } = detail.data;
  const images = room.Images && room.Images.length ? room.Images : room.RoomTypeImages || [];
  const facts = [
    ["Tầng", room.Floor],
    ["Hướng nhìn", room.View],
    ["Giường", room.BedType],
    ["Diện tích", `${room.AreaM2} m²`],
    ["Sức chứa", `${room.Capacity} khách`],
    ...(room.MaxExtraBed ? [["Giường phụ", `tối đa ${room.MaxExtraBed}`]] : []),
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Link to={`/?${sp.toString()}`} className="text-sm text-brand-600 hover:underline">← Quay lại danh sách phòng</Link>

      <div className="mt-3 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {/* Ảnh */}
          <div className="card overflow-hidden">
            <RoomImage images={images} index={imgIndex} alt={`Phòng ${room.RoomNumber}`} label={room.RoomTypeName} typeId={room.RoomTypeID} className="h-72 sm:h-96" />
            {images.length > 1 && (
              <div className="flex gap-2 p-3">
                {images.map((_, i) => (
                  <button key={i} type="button" onClick={() => setImgIndex(i)} aria-label={`Ảnh ${i + 1}`}
                    className={`w-24 overflow-hidden rounded-lg ring-2 ${i === imgIndex ? "ring-brand-500" : "ring-transparent opacity-70 hover:opacity-100"}`}>
                    <RoomImage images={images} index={i} alt="" typeId={room.RoomTypeID} className="h-14" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Thông tin */}
          <section className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h1 className="text-2xl font-semibold">{room.RoomTypeName} — Phòng {room.RoomNumber}</h1>
                <p className="mt-1 text-slate-600">{room.RoomTypeDescription}</p>
              </div>
              {["Maintenance", "OutOfOrder"].includes(room.Status) && (
                <span className="rounded-full bg-orange-100 px-3 py-1 text-xs font-medium text-orange-800">Tạm ngừng nhận khách</span>
              )}
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {facts.map(([k, v]) => (
                <div key={k} className="rounded-lg bg-slate-50 px-3 py-2">
                  <dt className="text-xs text-slate-500">{k}</dt>
                  <dd className="font-medium text-slate-800">{v}</dd>
                </div>
              ))}
            </dl>
            {room.Amenities && room.Amenities.length > 0 && (
              <>
                <h2 className="mt-5 font-semibold">Tiện nghi trong phòng</h2>
                <ul className="mt-2 grid grid-cols-2 gap-2 text-sm text-slate-700 sm:grid-cols-3">
                  {room.Amenities.map((a) => <li key={a} className="flex items-center gap-2"><span className="text-brand-500">✓</span>{a}</li>)}
                </ul>
              </>
            )}
            {hotel.data && (
              <>
                <h2 className="mt-5 font-semibold">Tiện ích khách sạn</h2>
                <div className="mt-2 flex flex-wrap gap-2">
                  {hotel.data.Amenities.map((a) => <span key={a} className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-700">{a}</span>)}
                </div>
              </>
            )}
          </section>

          {/* Lịch trống */}
          <section className="card p-5">
            <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold">Lịch còn trống</h2>
              {detail.isFetching && <span className="text-xs text-slate-400">Đang cập nhật...</span>}
            </div>
            <AvailabilityCalendar calendar={calendar} checkIn={filters.checkIn} checkOut={filters.checkOut} onPick={onPick} />
          </section>

          {/* Chính sách */}
          {hotel.data && (
            <section className="card p-5 text-sm text-slate-700">
              <h2 className="font-semibold text-slate-900">Chính sách đặt phòng</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                <li>Nhận phòng từ {hotel.data.CheckInTime}, trả phòng trước {hotel.data.CheckOutTime}.</li>
                <li>Đặt cọc {hotel.data.Policies.DepositPercent}% tổng tiền; phòng được giữ {hotel.data.Policies.PendingHoldMinutes} phút để thanh toán cọc.</li>
                <li>Hủy trước {hotel.data.CheckInTime} ngày nhận phòng ít nhất {hotel.data.Policies.FreeCancelBeforeHours} giờ được hoàn 100% cọc; hủy muộn hơn mất cọc.</li>
                <li>Trẻ dưới {hotel.data.Policies.ChildFreeHeightCm / 100}m miễn phí và không tính vào sức chứa phòng.</li>
                {hotel.data.Policies.VATIncluded && <li>Giá đã bao gồm VAT.</li>}
              </ul>
            </section>
          )}
        </div>

        {/* Đặt phòng */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          {detail.isFetching && !stayInfo ? <Skeleton className="h-96" /> : (
            <BookingPanel room={room} stay={stayInfo} filters={filters} onChange={change} hotel={hotel.data} />
          )}
        </aside>
      </div>
    </div>
  );
}
