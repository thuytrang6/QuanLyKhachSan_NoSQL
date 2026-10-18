import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { profileSchema } from "../validation/schemas";
import Field from "../components/Field";
import { formatDate } from "../utils/format";

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      fullName: user?.FullName || "",
      phone: user?.Phone || "",
      idType: user?.IDType || "CCCD",
      idNumber: user?.IDNumber || "",
      dateOfBirth: user?.DateOfBirth || "",
      gender: user?.Gender || "Nam",
      nationality: user?.Nationality || "Việt Nam",
      address: user?.Address || "",
    },
  });

  const onSubmit = async (values) => {
    setSubmitting(true);
    try {
      await authApi.updateProfile(values);
      if (refreshUser) await refreshUser();
      toast.success("Cập nhật thông tin thành công!");
    } catch (e) {
      toast.error(e.message || "Cập nhật thất bại, vui lòng thử lại");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Thông tin tài khoản</h1>
        <p className="text-sm text-slate-500">
          Xem và cập nhật thông tin cá nhân của bạn trên hệ thống Sunrise Hotel.
        </p>
      </div>

      <div className="card divide-y divide-slate-100 p-6">
        <div className="mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-brand-100 text-lg font-bold text-brand-700">
              {user?.FullName?.slice(0, 1) || "U"}
            </div>
            <div>
              <div className="font-semibold text-slate-900">{user?.FullName}</div>
              <div className="text-xs text-slate-500">Mã khách hàng: {user?.CustomerID} · Email: {user?.Email}</div>
            </div>
          </div>
          <div className="rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 border border-brand-200">
            Hạng: {user?.LoyaltyTier || "Member"}
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4 pt-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Họ và tên" error={errors.fullName} required>
              <input type="text" className="input" {...register("fullName")} placeholder="Nguyễn Văn A" />
            </Field>

            <Field label="Số điện thoại" error={errors.phone} required>
              <input type="text" className="input" {...register("phone")} placeholder="0901234567" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Loại giấy tờ" error={errors.idType} required>
              <select className="input" {...register("idType")}>
                <option value="CCCD">Căn cước công dân (CCCD)</option>
                <option value="Passport">Hộ chiếu (Passport)</option>
              </select>
            </Field>

            <Field label="Số giấy tờ" error={errors.idNumber} required>
              <input type="text" className="input" {...register("idNumber")} placeholder="012345678901" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Ngày sinh" error={errors.dateOfBirth}>
              <input type="date" className="input" {...register("dateOfBirth")} />
            </Field>

            <Field label="Giới tính" error={errors.gender}>
              <select className="input" {...register("gender")}>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
                <option value="Khác">Khác</option>
              </select>
            </Field>

            <Field label="Quốc tịch" error={errors.nationality}>
              <input type="text" className="input" {...register("nationality")} placeholder="Việt Nam" />
            </Field>
          </div>

          <Field label="Địa chỉ" error={errors.address}>
            <input type="text" className="input" {...register("address")} placeholder="Số nhà, đường, quận/huyện, tỉnh/thành" />
          </Field>

          <div className="flex justify-end pt-3">
            <button type="submit" className="btn-primary px-6 py-2.5" disabled={submitting}>
              {submitting ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
