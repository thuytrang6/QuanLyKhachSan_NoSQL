import { Link, Navigate, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { registerSchema } from "../validation/schemas";
import Field from "../components/Field";
import { homeOf } from "../components/ProtectedRoute";

export default function RegisterPage() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { idType: "CCCD" },
  });

  const signup = useMutation({
    mutationFn: ({ confirmPassword, ...body }) => authApi.register(body),
    onSuccess: (u) => {
      setUser(u);
      toast.success(`Tạo tài khoản ${u.CustomerID} thành công`);
      navigate("/rooms", { replace: true });
    },
    onError: (e) => {
      if (e.status === 409) setError("email", { message: e.message });
      toast.error(e.message);
    },
  });

  if (user) return <Navigate to={homeOf(user)} replace />;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Đăng ký tài khoản khách hàng</h1>
        <p className="mt-1 text-sm text-slate-500">Dùng để đặt phòng online và theo dõi lịch sử đặt phòng.</p>
        <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit((v) => signup.mutate(v))} noValidate>
          <Field label="Họ và tên" error={errors.fullName} className="sm:col-span-2">
            <input className="input" autoComplete="name" {...register("fullName")} />
          </Field>
          <Field label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Số điện thoại" error={errors.phone}>
            <input className="input" type="tel" autoComplete="tel" {...register("phone")} />
          </Field>
          <Field label="Loại giấy tờ" error={errors.idType}>
            <select className="input" {...register("idType")}>
              <option value="CCCD">CCCD</option>
              <option value="Passport">Passport</option>
            </select>
          </Field>
          <Field label="Số giấy tờ" error={errors.idNumber}>
            <input className="input" {...register("idNumber")} />
          </Field>
          <Field label="Mật khẩu" error={errors.password}>
            <input className="input" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Nhập lại mật khẩu" error={errors.confirmPassword}>
            <input className="input" type="password" autoComplete="new-password" {...register("confirmPassword")} />
          </Field>
          <button className="btn-primary sm:col-span-2" disabled={signup.isPending}>
            {signup.isPending ? "Đang tạo tài khoản..." : "Đăng ký"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Đã có tài khoản? <Link to="/login" className="font-medium text-brand-600 hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
