import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { adminApi } from "../../api/admin";
import { formatDate, formatDateTime } from "../../utils/format";
import Modal from "../../components/Modal";
import { TableSkeleton } from "../../components/Skeleton";
import EmptyState, { ErrorState } from "../../components/EmptyState";

export default function BackupAdminPage() {
  const qc = useQueryClient();
  const [confirmRestore, setConfirmRestore] = useState(null); // filename to restore
  const [confirmDelete, setConfirmDelete] = useState(null); // filename to delete
  const [confirmResetSeed, setConfirmResetSeed] = useState(false);
  const [uploading, setUploading] = useState(false);

  const backups = useQuery({
    queryKey: ["admin", "backups"],
    queryFn: adminApi.listBackups,
  });

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
        const json = JSON.parse(evt.target.result);
        const res = await adminApi.restoreUpload(json);
        invalidateAll();
        toast.success(res.message || "Đã khôi phục từ file tải lên thành công!");
      } catch (err) {
        toast.error("File JSON không hợp lệ: " + (err.message || "Lỗi định dạng"));
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
