import { useState } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { loginSchema } from "../validation/schemas";
import Field from "../components/Field";
import { afterAuthPath } from "../components/ProtectedRoute";
import AlreadySignedIn from "../components/AlreadySignedIn";

export default function LoginPage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const from = location.state && location.state.from;
  const [justSignedIn, setJustSignedIn] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(loginSchema) });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (u) => {
      setJustSignedIn(true);
      setUser(u);
      toast.success(`Xin chào ${u.FullName}`);
    },
    onError: (e) => toast.error(e.message),
  });

  // Vừa đăng nhập bằng form này -> chuyển hướng (quay lại trang đang xem trước khi đăng nhập)
  if (user && justSignedIn) return <Navigate to={afterAuthPath(user, from)} replace />;
  // Mở /login khi đã đăng nhập sẵn -> cho chọn tiếp tục hoặc đổi tài khoản
  if (user) return <AlreadySignedIn from={from} />;

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Đăng nhập</h1>
        <p className="mt-1 text-sm text-slate-500">Khách hàng đặt phòng hoặc quản lý khách sạn.</p>
        <form className="mt-6 space-y-4" onSubmit={handleSubmit((v) => login.mutate(v))} noValidate>
          <Field label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" {...register("email")} />
          </Field>
          <Field label="Mật khẩu" error={errors.password}>
            <input className="input" type="password" autoComplete="current-password" {...register("password")} />
          </Field>
          <button className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Chưa có tài khoản? <Link to="/register" state={location.state} className="font-medium text-brand-600 hover:underline">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
