import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "../../api/admin";
import { useRoomTypes } from "../../hooks/useRoomTypes";
import { roomCreateSchema, roomUpdateSchema, splitList } from "../../validation/schemas";
import { EDITABLE_ROOM_STATUSES, ROOM_STATUS } from "../../utils/constants";
import { formatDateTime, formatMoney } from "../../utils/format";
import { RoomStatusBadge } from "../../components/Badges";
import { TableSkeleton } from "../../components/Skeleton";
import EmptyState, { ErrorState } from "../../components/EmptyState";
import Modal from "../../components/Modal";
import Field from "../../components/Field";
import Pagination from "../../components/Pagination";

// Sau mọi thao tác ghi: làm mới danh sách phòng, sơ đồ trạng thái và kết quả tìm phòng
function useInvalidateRooms() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["admin", "rooms"] });
    qc.invalidateQueries({ queryKey: ["admin", "room-board"] });
    qc.invalidateQueries({ queryKey: ["admin", "occupancy"] });
    qc.invalidateQueries({ queryKey: ["admin", "room-logs"] });
    qc.invalidateQueries({ queryKey: ["rooms", "search"] });
  };
}

export default function RoomsAdminPage() {
  const types = useRoomTypes();
  const [filters, setFilters] = useState({ floor: "", roomTypeId: "", status: "" });
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const params = useMemo(() => ({
    ...Object.fromEntries(Object.entries(filters).filter(([, v]) => v !== "")), page, pageSize,
  }), [filters, page, pageSize]);
  // Server lọc + chia trang, trả { items, total, page, pageSize, totalPages, floors }
  const rooms = useQuery({ queryKey: ["admin", "rooms", params], queryFn: () => adminApi.rooms(params), placeholderData: keepPreviousData });
  const data = rooms.data;
  const floors = data ? data.floors : [];
  // Server lùi về trang cuối khi trang đang xem không còn phòng (vd. vừa xóa phòng cuối) -> đồng bộ lại
  useEffect(() => { if (data && !rooms.isPlaceholderData && data.page !== page) setPage(data.page); }, [data, page, rooms.isPlaceholderData]);

  // Đổi bộ lọc hoặc số dòng/trang -> quay về trang 1
  const set = (k) => (e) => { setFilters((f) => ({ ...f, [k]: e.target.value })); setPage(1); };
  const clearFilters = () => { setFilters({ floor: "", roomTypeId: "", status: "" }); setPage(1); };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Quản lý phòng</h1>
          <p className="text-sm text-slate-500">Query PK=HOTEL#MAIN, begins_with(SK, ROOM#).</p>
        </div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ Thêm phòng</button>
      </div>

      <div className="card mt-5 grid gap-3 p-4 sm:grid-cols-4">
        <Field label="Tầng">
          <select className="input" value={filters.floor} onChange={set("floor")}>
            <option value="">Tất cả</option>
            {floors.map((f) => <option key={f} value={f}>Tầng {f}</option>)}
          </select>
        </Field>
        <Field label="Loại phòng">
          <select className="input" value={filters.roomTypeId} onChange={set("roomTypeId")}>
            <option value="">Tất cả</option>
            {(types.data || []).map((t) => <option key={t.RoomTypeID} value={t.RoomTypeID}>{t.Name}</option>)}
          </select>
        </Field>
        <Field label="Trạng thái">
          <select className="input" value={filters.status} onChange={set("status")}>
            <option value="">Tất cả</option>
            {Object.entries(ROOM_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </Field>
        <div className="flex items-end">
          <button className="btn-ghost" onClick={clearFilters}>Xóa bộ lọc</button>
        </div>
      </div>

      <div className="card mt-5 overflow-x-auto">
        {rooms.isLoading ? <TableSkeleton cols={7} rows={10} /> : rooms.isError ? <div className="p-4"><ErrorState error={rooms.error} onRetry={rooms.refetch} /></div> :
          data.total === 0 ? <div className="p-4"><EmptyState icon="🏨" title="Không có phòng phù hợp bộ lọc" /></div> : (
            <>
            <table className={`min-w-full divide-y divide-slate-100 ${rooms.isPlaceholderData ? "opacity-60" : ""}`}>
              <thead className="bg-slate-50">
                <tr>
                  <th className="th">Phòng</th><th className="th">Loại</th><th className="th">View</th><th className="th text-right">Giá gốc</th>
                  <th className="th">Trạng thái</th><th className="th">Cập nhật</th><th className="th text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.items.map((r) => (
                  <tr key={r.RoomID} className="hover:bg-slate-50">
                    <td className="td"><div className="font-semibold">{r.RoomNumber}</div><div className="text-xs text-slate-500">Tầng {r.Floor} · v{r.Version}</div></td>
                    <td className="td">{r.RoomTypeName}<div className="text-xs text-slate-500">{r.BedType} · {r.AreaM2} m² · ≤{r.Capacity} khách</div></td>
                    <td className="td">{r.View}</td>
                    <td className="td tabular text-right">{formatMoney(r.BasePrice)}</td>
                    <td className="td">
                      <RoomStatusBadge status={r.Status} />
                      {r.CurrentBookingID && <div className="mt-0.5 text-xs text-slate-500">{r.CurrentBookingID}</div>}
                      {r.MaintenanceNote && <div className="mt-0.5 max-w-[14rem] truncate text-xs text-slate-500" title={r.MaintenanceNote}>{r.MaintenanceNote}</div>}
                    </td>
                    <td className="td whitespace-nowrap text-xs text-slate-500">{formatDateTime(r.UpdatedAt)}</td>
                    <td className="td whitespace-nowrap text-right">
                      <Link to={`/admin/rooms/${r.RoomID}/logs`} className="btn-ghost px-2 py-1">Nhật ký</Link>
                      <button className="btn-ghost px-2 py-1 text-brand-700" onClick={() => setEditing(r)}>Sửa</button>
                      <button className="btn-ghost px-2 py-1 text-red-600" onClick={() => setDeleting(r)}>Xóa</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination
              page={data.page} pageSize={data.pageSize} total={data.total} totalPages={data.totalPages} unit="phòng"
              busy={rooms.isFetching}
              onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: "smooth" }); }}
              onPageSize={(s) => { setPageSize(s); setPage(1); }}
              sizes={[5, 10, 20, 50]}
            />
            </>
          )}
      </div>

      {creating && <CreateRoomModal types={types.data || []} onClose={() => setCreating(false)} />}
      {editing && <EditRoomModal room={editing} onClose={() => setEditing(null)} />}
      {deleting && <DeleteRoomModal room={deleting} onClose={() => setDeleting(null)} onSwitch={(r) => { setDeleting(null); setEditing(r); }} />}
    </div>
  );
}

function CreateRoomModal({ types, onClose }) {
  const invalidate = useInvalidateRooms();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(roomCreateSchema),
    defaultValues: { RoomNumber: "", Floor: "", RoomTypeID: "", View: "", Amenities: "", Images: "" },
  });
  const type = types.find((t) => t.RoomTypeID === watch("RoomTypeID"));
  const create = useMutation({
    mutationFn: (v) => adminApi.createRoom({ ...v, Amenities: splitList(v.Amenities), Images: splitList(v.Images) }),
    onSuccess: (r) => { invalidate(); toast.success(`Đã tạo phòng ${r.RoomID}`); onClose(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Modal open onClose={onClose} title="Thêm phòng mới" size="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Hủy</button><button className="btn-primary" onClick={handleSubmit((v) => create.mutate(v))} disabled={create.isPending}>{create.isPending ? "Đang lưu..." : "Tạo phòng"}</button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
        <Field label="Số phòng" error={errors.RoomNumber}><input className="input" placeholder="VD: 601" {...register("RoomNumber")} /></Field>
        <Field label="Tầng" error={errors.Floor}><input type="number" className="input" {...register("Floor")} /></Field>
        <Field label="Loại phòng" error={errors.RoomTypeID} className="sm:col-span-2">
          <select className="input" {...register("RoomTypeID")}>
            <option value="">— Chọn loại phòng —</option>
            {types.map((t) => <option key={t.RoomTypeID} value={t.RoomTypeID}>{t.RoomTypeID} — {t.Name}</option>)}
          </select>
        </Field>
        {type && (
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
            Sao chép từ RoomType: {type.Name} · giá gốc {formatMoney(type.BasePrice)} · ≤{type.Capacity} khách · {type.BedType} · {type.AreaM2} m²
          </div>
        )}
        <Field label="Hướng nhìn (View)" error={errors.View} className="sm:col-span-2"><input className="input" {...register("View")} /></Field>
        <Field label="Tiện nghi" error={errors.Amenities} hint="Phân tách bằng dấu phẩy" className="sm:col-span-2"><input className="input" placeholder="Điều hòa, TV, Wifi" {...register("Amenities")} /></Field>
        <Field label="Ảnh" error={errors.Images} hint="Đường dẫn, phân tách bằng dấu phẩy. Bỏ trống để dùng ảnh của loại phòng." className="sm:col-span-2">
          <input className="input" placeholder="images/rooms/dlx-1.jpg" {...register("Images")} />
        </Field>
      </form>
    </Modal>
  );
}

function EditRoomModal({ room, onClose }) {
  const invalidate = useInvalidateRooms();
  const qc = useQueryClient();
  const { register, handleSubmit, watch, formState: { errors } } = useForm({
    resolver: zodResolver(roomUpdateSchema),
    defaultValues: {
      View: room.View || "", Amenities: (room.Amenities || []).join(", "), Images: (room.Images || []).join(", "),
      Status: room.Status, MaintenanceNote: room.MaintenanceNote || "", Reason: "",
    },
  });
  const status = watch("Status");
  const occupied = room.Status === "Occupied";
  const statusOptions = EDITABLE_ROOM_STATUSES.includes(room.Status) ? EDITABLE_ROOM_STATUSES : [room.Status, ...EDITABLE_ROOM_STATUSES];

  const update = useMutation({
    mutationFn: (v) => adminApi.updateRoom(room.RoomID, {
      Version: room.Version, View: v.View, Amenities: splitList(v.Amenities), Images: splitList(v.Images),
      ...(v.Status && v.Status !== room.Status ? { Status: v.Status } : {}),
      MaintenanceNote: v.MaintenanceNote || undefined, Reason: v.Reason || undefined,
    }),
    onSuccess: (r) => { invalidate(); toast.success(`Đã cập nhật phòng ${r.RoomID} (v${r.Version})`); onClose(); },
    onError: (e) => {
      toast.error(e.message, { duration: 6000 });
      if (e.status === 409) { qc.invalidateQueries({ queryKey: ["admin", "rooms"] }); onClose(); }
    },
  });

  return (
    <Modal open onClose={onClose} title={`Sửa phòng ${room.RoomID}`} size="max-w-2xl"
      footer={<><button className="btn-secondary" onClick={onClose}>Hủy</button><button className="btn-primary" onClick={handleSubmit((v) => update.mutate(v))} disabled={update.isPending}>{update.isPending ? "Đang lưu..." : "Lưu thay đổi"}</button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => e.preventDefault()} noValidate>
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600 sm:col-span-2">
          {room.RoomTypeName} · Tầng {room.Floor} · Version hiện tại <b>{room.Version}</b> (khóa lạc quan: nếu người khác sửa trước, thao tác sẽ bị từ chối)
        </div>
        <Field label="Trạng thái" error={errors.Status} hint={occupied ? "Phòng đang có khách, không thể đổi trạng thái" : undefined}>
          <select className="input" {...register("Status")} disabled={occupied}>
            {statusOptions.map((s) => <option key={s} value={s}>{(ROOM_STATUS[s] || {}).label || s} ({s})</option>)}
          </select>
        </Field>
        <Field label="Hướng nhìn (View)" error={errors.View}><input className="input" {...register("View")} /></Field>
        {status === "Maintenance" && (
          <Field label="Ghi chú bảo trì" error={errors.MaintenanceNote} className="sm:col-span-2"><input className="input" {...register("MaintenanceNote")} /></Field>
        )}
        {status && status !== room.Status && (
          <Field label="Lý do đổi trạng thái (ghi vào RoomStatusLog)" error={errors.Reason} className="sm:col-span-2"><input className="input" {...register("Reason")} /></Field>
        )}
        <Field label="Tiện nghi" error={errors.Amenities} hint="Phân tách bằng dấu phẩy" className="sm:col-span-2"><input className="input" {...register("Amenities")} /></Field>
        <Field label="Ảnh" error={errors.Images} hint="Đường dẫn, phân tách bằng dấu phẩy" className="sm:col-span-2"><input className="input" {...register("Images")} /></Field>
      </form>
    </Modal>
  );
}

function DeleteRoomModal({ room, onClose, onSwitch }) {
  const invalidate = useInvalidateRooms();
  const [blocked, setBlocked] = useState(null);
  const del = useMutation({
    mutationFn: () => adminApi.deleteRoom(room.RoomID),
    onSuccess: () => { invalidate(); toast.success(`Đã xóa phòng ${room.RoomID}`); onClose(); },
    onError: (e) => {
      toast.error(e.message, { duration: 6000 });
      if (e.code === "ROOM_HAS_HISTORY") setBlocked(e.message);
    },
  });
  return (
    <Modal open onClose={onClose} title={`Xóa phòng ${room.RoomID}?`}
      footer={blocked ? (
        <>
          <button className="btn-secondary" onClick={onClose}>Đóng</button>
          <button className="btn-primary" onClick={() => onSwitch(room)}>Chuyển sang OutOfOrder</button>
        </>
      ) : (
        <>
          <button className="btn-secondary" onClick={onClose}>Hủy</button>
          <button className="btn-danger" onClick={() => del.mutate()} disabled={del.isPending}>{del.isPending ? "Đang kiểm tra..." : "Xóa phòng"}</button>
        </>
      )}>
      {blocked ? (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{blocked}</p>
      ) : (
        <p className="text-sm text-slate-600">
          Hệ thống chỉ xóa khi phòng chưa từng có booking (GSI1 ROOM#{room.RoomID}) và không có RoomNight (PK ROOM#{room.RoomID}).
          Thao tác này không thể hoàn tác.
        </p>
      )}
    </Modal>
  );
}
