import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
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
  const navigate = useNavigate();
  const from = (location.state && location.state.from)
    || (() => { try { return sessionStorage.getItem("hotel_pending_booking_url") || undefined; } catch { return undefined; } })()
    || undefined;
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(loginSchema) });

  const login = useMutation({
    mutationFn: authApi.login,
    onSuccess: (u) => {
      const target = afterAuthPath(u, from);
      try { sessionStorage.removeItem("hotel_pending_booking_url"); } catch {}
      setJustSignedIn(true);
      setUser(u);
      toast.success(`Xin chào ${u.FullName}`);
      navigate(target, { replace: true });
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

        {from && from.startsWith("/rooms/") && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-xs text-brand-900">
            Đăng nhập để tiếp tục hoàn tất đơn đặt phòng đang chọn của bạn.
          </div>
        )}
        <form className="mt-6 space-y-4" onSubmit={handleSubmit((v) => login.mutate(v))} noValidate>
          <Field label="Email" error={errors.email}>
            <input className="input" type="email" autoComplete="email" placeholder="name@example.com" {...register("email")} />
          </Field>
          <Field label="Mật khẩu" error={errors.password}>
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder="Nhập mật khẩu"
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                title={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showPassword ? (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                  </svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="h-5 w-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                )}
              </button>
            </div>
          </Field>
          <button className="btn-primary w-full" disabled={login.isPending}>
            {login.isPending ? "Đang đăng nhập..." : "Đăng nhập"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Chưa có tài khoản? <Link to="/register" state={{ from }} className="font-medium text-brand-600 hover:underline">Đăng ký</Link>
        </p>
      </div>
    </div>
  );
}
