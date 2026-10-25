import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "../../api/admin";
import { formatDate, formatDateTime } from "../../utils/format";
import Modal from "../../components/Modal";
import { TableSkeleton } from "../../components/Skeleton";
import EmptyState, { ErrorState } from "../../components/EmptyState";

// Cùng công thức với server/src/services/backupSchedule.js: mốc 02:00 Chủ nhật giờ Việt Nam
const SCHEDULE_ANCHOR_MS = Date.parse("2026-01-04T02:00:00+07:00");
const WEEKDAYS = ["Chủ nhật", "Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7"];

function computeNextRunAt(frequencyHours, from = Date.now()) {
  const period = frequencyHours * 3600 * 1000;
  const k = Math.floor((from - SCHEDULE_ANCHOR_MS) / period) + 1;
  return new Date(SCHEDULE_ANCHOR_MS + k * period).toISOString();
}

// Thứ trong tuần theo giờ Việt Nam (UTC+7)
const weekdayVN = (iso) => WEEKDAYS[new Date(Date.parse(iso) + 7 * 3600 * 1000).getUTCDay()];

export default function BackupAdminPage() {
  const qc = useQueryClient();
  const [confirmRestore, setConfirmRestore] = useState(null); // filename to restore
  const [confirmDelete, setConfirmDelete] = useState(null); // filename to delete
  const [confirmResetSeed, setConfirmResetSeed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scheduleEnabled, setScheduleEnabled] = useState(null);
  const [frequencyHours, setFrequencyHours] = useState(null);

  const backups = useQuery({
    queryKey: ["admin", "backups"],
    queryFn: adminApi.listBackups,
  });

  const schedule = useQuery({
    queryKey: ["admin", "backup-schedule"],
    queryFn: adminApi.getBackupSchedule,
  });

  const updateScheduleMutation = useMutation({
    mutationFn: (body) => adminApi.updateBackupSchedule(body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin", "backup-schedule"] });
      toast.success("Đã cập nhật lịch sao lưu tự động thành công!");
    },
    onError: (e) => toast.error(e.message || "Cập nhật lịch thất bại"),
  });

  const currentEnabled = scheduleEnabled !== null ? scheduleEnabled : (schedule.data?.enabled ?? true);
  const currentFrequency = frequencyHours !== null ? frequencyHours : (schedule.data?.frequencyHours ?? 168);
  // Đang chọn khác lịch đã lưu thì xem trước lần chạy kế tiếp theo lựa chọn mới
  const isScheduleDirty = Boolean(schedule.data) &&
    (currentEnabled !== schedule.data.enabled || currentFrequency !== schedule.data.frequencyHours);
  const nextRunAt = isScheduleDirty ? computeNextRunAt(currentFrequency) : schedule.data?.nextRunAt;

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["admin", "backups"] });
    qc.invalidateQueries({ queryKey: ["admin", "rooms"] });
    qc.invalidateQueries({ queryKey: ["admin", "room-board"] });
    qc.invalidateQueries({ queryKey: ["admin", "revenue"] });
    qc.invalidateQueries({ queryKey: ["admin", "invoices"] });
    qc.invalidateQueries({ queryKey: ["admin", "occupancy"] });
    qc.invalidateQueries({ queryKey: ["admin", "booking-status"] });
    qc.invalidateQueries({ queryKey: ["rooms"] });
  };

  const createMutation = useMutation({
    mutationFn: adminApi.createBackup,
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["admin", "backups"] });
      toast.success(`Đã tạo bản sao lưu thành công (${res.totalItems} items)!`);
    },
    onError: (e) => toast.error(e.message || "Tạo bản sao lưu thất bại"),
  });

  const restoreMutation = useMutation({
    mutationFn: (filename) => adminApi.restoreBackup(filename),
    onSuccess: (res) => {
      setConfirmRestore(null);
      invalidateAll();
      toast.success(res.message || "Đã khôi phục dữ liệu thành công!");
    },
    onError: (e) => toast.error(e.message || "Khôi phục dữ liệu thất bại"),
  });

  const resetSeedMutation = useMutation({
    mutationFn: adminApi.restoreSeed,
    onSuccess: (res) => {
      setConfirmResetSeed(false);
      invalidateAll();
      toast.success(res.message || "Đã khôi phục về dữ liệu mẫu gốc!");
    },
    onError: (e) => toast.error(e.message || "Khôi phục dữ liệu gốc thất bại"),
  });

  const deleteMutation = useMutation({
    mutationFn: (filename) => adminApi.deleteBackup(filename),
    onSuccess: () => {
      setConfirmDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "backups"] });
      toast.success("Đã xóa file sao lưu");
    },
    onError: (e) => toast.error(e.message || "Xóa file thất bại"),
  });

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error("Vui lòng chọn file định dạng .json");
      return;
    }

    setUploading(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const text = evt.target.result;
        let payload;
        try {
          payload = JSON.parse(text);
        } catch (parseErr) {
          // Thử parse dạng JSON Lines (mỗi dòng 1 item như HotelBookingTable.json)
          const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
          const items = [];
          for (const line of lines) {
            try {
              const p = JSON.parse(line);
              items.push(p.Item || p);
            } catch { }
          }
          if (items.length > 0) {
            payload = { items };
          } else {
            throw parseErr;
          }
        }

        const res = await adminApi.restoreUpload(payload);
        invalidateAll();
        toast.success(res.message || "Đã khôi phục từ file tải lên thành công!");
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message || "Lỗi định dạng";
        toast.error("Khôi phục thất bại: " + msg);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    };
    reader.onerror = () => {
      toast.error("Không thể đọc file");
      setUploading(false);
      e.target.value = "";
    };
    reader.readAsText(file);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Sao lưu & Phục hồi dữ liệu</h1>
          <p className="text-sm text-slate-500">
            Quản lý Backup/Restore, nạp lại dữ liệu mẫu gốc hoặc sao lưu toàn bộ bảng Amazon DynamoDB.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="btn-primary"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            {createMutation.isPending ? "Đang sao lưu..." : "Tạo bản sao lưu ngay"}
          </button>
          <button
            className="btn-secondary text-red-600 hover:bg-red-50"
            onClick={() => setConfirmResetSeed(true)}
          >
            Khôi phục dữ liệu gốc mẫu
          </button>
        </div>
      </div>

      {/* Quick Action Banner */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5 border-l-4 border-l-brand-500">
          <div className="text-sm font-semibold text-slate-900">Sao lưu tức thì</div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Quét toàn bộ item từ bảng HotelBookingTable và xuất ra file JSON lưu trữ an toàn trên máy chủ.
          </p>
          <button
            className="mt-3 text-xs font-semibold text-brand-600 hover:text-brand-800"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
          >
            Chạy tiến trình Backup
          </button>
        </div>

        <div className="card p-5 border-l-4 border-l-amber-500">
          <div className="text-sm font-semibold text-slate-900">Tải lên file sao lưu</div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Khôi phục dữ liệu từ file JSON backup trên máy tính của bạn trực tiếp vào DynamoDB.
          </p>
          <label className="mt-3 inline-block cursor-pointer text-xs font-semibold text-amber-600 hover:text-amber-800">
            {uploading ? "Đang xử lý nạp..." : "Chọn file JSON để Restore"}
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileUpload}
              disabled={uploading}
            />
          </label>
        </div>

        <div className="card p-5 border-l-4 border-l-emerald-500">
          <div className="text-sm font-semibold text-slate-900">Dữ liệu mẫu ban đầu</div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Bản chuẩn HotelBookingTable.json (18.135 items) chuẩn mốc 24/09/2026 dùng cho thuyết trình và kiểm thử.
          </p>
          <button
            className="mt-3 text-xs font-semibold text-emerald-600 hover:text-emerald-800"
            onClick={() => setConfirmResetSeed(true)}
          >
            Khôi phục mốc gốc
          </button>
        </div>
      </div>

      {/* Cấu hình sao lưu tự động theo lịch */}
      <div className="card p-5 border border-slate-200 bg-gradient-to-r from-slate-50 via-white to-slate-50">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">

            <div>
              <h2 className="text-base font-semibold text-slate-900">Sao lưu tự động theo lịch (Automated Schedule)</h2>
              <p className="text-xs text-slate-500">
                Tiến trình chạy nền tự động quét DynamoDB và tạo bản sao lưu định kỳ theo giờ đã cấu hình.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {schedule.data?.enabled ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 border border-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                Đang bật tự động
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                Đang tạm ngưng
              </span>
            )}
          </div>
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-4 items-end">
          <div>
            <label className="block text-xs font-medium text-slate-700">Trạng thái tiến trình</label>
            <select
              className="input mt-1 text-sm"
              value={currentEnabled ? "true" : "false"}
              onChange={(e) => setScheduleEnabled(e.target.value === "true")}
            >
              <option value="true">Bật sao lưu tự động</option>
              <option value="false">Tắt / Tạm ngưng</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700">Chu kỳ / Tần suất</label>
            <select
              className="input mt-1 text-sm"
              value={currentFrequency}
              onChange={(e) => setFrequencyHours(Number(e.target.value))}
            >
              <option value={6}>Mỗi 6 giờ </option>
              <option value={12}>Mỗi 12 giờ </option>
              <option value={24}>Hàng ngày (02:00)</option>
              <option value={168}>Hàng tuần (02:00 Chủ nhật - Khuyên dùng)</option>
            </select>
          </div>

          <div className="text-xs text-slate-600 space-y-1 sm:col-span-1">
            <div>
              <span className="text-slate-400">Lần chạy gần nhất:</span>{" "}
              <strong>{schedule.data?.lastRunAt ? formatDateTime(schedule.data.lastRunAt) : "Chưa có"}</strong>
            </div>
            <div>
              <span className="text-slate-400">Lần chạy kế tiếp:</span>{" "}
              {!currentEnabled ? (
                <strong className="text-slate-500">Không chạy (đang tắt)</strong>
              ) : nextRunAt ? (
                <>
                  <strong className="text-brand-700">{weekdayVN(nextRunAt)}, {formatDateTime(nextRunAt)}</strong>
                  {isScheduleDirty && <span className="text-slate-400"> (sau khi áp dụng)</span>}
                </>
              ) : (
                <strong className="text-brand-700">Đang tính...</strong>
              )}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary w-full sm:w-auto text-xs py-2 px-4 shadow-sm"
              disabled={updateScheduleMutation.isPending}
              onClick={() => {
                updateScheduleMutation.mutate({
                  enabled: currentEnabled,
                  frequencyHours: currentFrequency,
                });
              }}
            >
              {updateScheduleMutation.isPending ? "Đang lưu..." : "Áp dụng lịch"}
            </button>
          </div>
        </div>
      </div>

      {/* Backup list table */}
      <div className="card overflow-x-auto">
        <div className="border-b border-slate-100 p-4 font-semibold text-slate-800 flex justify-between items-center">
          <span>Danh sách các bản sao lưu ({backups.data?.length || 0})</span>
          <button
            className="text-xs text-brand-600 hover:underline"
            onClick={() => backups.refetch()}
          >
            Làm mới danh sách
          </button>
        </div>

        {backups.isLoading ? (
          <TableSkeleton cols={6} rows={5} />
        ) : backups.isError ? (
          <div className="p-4">
            <ErrorState error={backups.error} onRetry={backups.refetch} />
          </div>
        ) : !backups.data?.length ? (
          <div className="p-6">
            <EmptyState title="Chưa có bản sao lưu nào" />
          </div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100">
            <thead className="bg-slate-50 text-xs font-semibold uppercase text-slate-500">
              <tr>
                <th className="th">Tên bản sao lưu</th>
                <th className="th">Mô tả</th>
                <th className="th text-right">Số items</th>
                <th className="th text-right">Dung lượng</th>
                <th className="th">Thời điểm tạo</th>
                <th className="th text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {backups.data.map((b) => (
                <tr key={b.filename} className="hover:bg-slate-50">
                  <td className="td font-mono font-medium text-slate-900">
                    <span>{b.filename}</span>
                  </td>
                  <td className="td text-slate-600">{b.description}</td>
                  <td className="td text-right font-medium text-slate-800">
                    {b.totalItems.toLocaleString("vi-VN")}
                  </td>
                  <td className="td text-right text-slate-600">{b.sizeFormatted}</td>
                  <td className="td text-slate-500">{formatDateTime(b.createdAt)}</td>
                  <td className="td text-right space-x-2">
                    <button
                      className="btn-secondary py-1 px-2.5 text-xs text-brand-700 hover:bg-brand-50"
                      onClick={() => setConfirmRestore(b.filename)}
                      disabled={restoreMutation.isPending}
                    >
                      Khôi phục
                    </button>
                    <a
                      href={`/api/admin/backups/${b.filename}/download`}
                      className="btn-ghost py-1 px-2 text-xs"
                      title="Tải về máy tính"
                      download
                    >
                      Tải về
                    </a>
                    {!b.isOriginal && (
                      <button
                        className="btn-ghost py-1 px-2 text-xs text-red-600 hover:bg-red-50"
                        onClick={() => setConfirmDelete(b.filename)}
                        title="Xóa bản sao lưu này"
                      >
                        Xóa
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal
        open={!!confirmRestore}
        onClose={() => setConfirmRestore(null)}
        title="Xác nhận khôi phục dữ liệu"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Bạn có chắc chắn muốn khôi phục bảng <strong>HotelBookingTable</strong> từ bản sao lưu:
          </p>
          <div className="rounded-lg bg-amber-50 p-3 font-mono text-xs text-amber-900 border border-amber-200">
            {confirmRestore}
          </div>
          <p className="text-xs text-red-600">
            Lưu ý: Thao tác này sẽ ghi đè dữ liệu tương ứng từ bản sao lưu vào bảng DynamoDB.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setConfirmRestore(null)}>
              Hủy
            </button>
            <button
              className="btn-primary bg-amber-600 hover:bg-amber-700"
              onClick={() => restoreMutation.mutate(confirmRestore)}
              disabled={restoreMutation.isPending}
            >
              {restoreMutation.isPending ? "Đang khôi phục..." : "Xác nhận khôi phục"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirm Reset Seed */}
      <Modal
        open={confirmResetSeed}
        onClose={() => setConfirmResetSeed(false)}
        title="Khôi phục về dữ liệu mẫu gốc"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Hệ thống sẽ nạp lại toàn bộ <strong>18.135 items</strong> từ file <code>HotelBookingTable.json</code> chuẩn mốc 24/09/2026.
          </p>
          <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded-lg border border-amber-200">
            Dữ liệu phòng, booking, đánh giá và doanh thu sẽ được đồng bộ lại theo đúng kịch bản ban đầu.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setConfirmResetSeed(false)}>
              Hủy
            </button>
            <button
              className="btn-primary"
              onClick={() => resetSeedMutation.mutate()}
              disabled={resetSeedMutation.isPending}
            >
              {resetSeedMutation.isPending ? "Đang khôi phục..." : "Khôi phục dữ liệu gốc"}
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal Confirm Delete */}
      <Modal
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="Xác nhận xóa bản sao lưu"
      >
        <div className="space-y-4 text-sm">
          <p className="text-slate-600">
            Bạn có chắc chắn muốn xóa file sao lưu: <strong>{confirmDelete}</strong>?
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <button className="btn-secondary" onClick={() => setConfirmDelete(null)}>
              Hủy
            </button>
            <button
              className="btn-primary bg-red-600 hover:bg-red-700"
              onClick={() => deleteMutation.mutate(confirmDelete)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Đang xóa..." : "Xóa file"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
