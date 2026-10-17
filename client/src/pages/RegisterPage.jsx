import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import toast from "react-hot-toast";
import { authApi } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { registerSchema } from "../validation/schemas";
import Field from "../components/Field";
import { afterAuthPath } from "../components/ProtectedRoute";
import AlreadySignedIn from "../components/AlreadySignedIn";

export default function RegisterPage() {
  const { user, setUser } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const from = (location.state && location.state.from)
    || (() => { try { return sessionStorage.getItem("hotel_pending_booking_url") || undefined; } catch { return undefined; } })()
    || undefined;
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { register, handleSubmit, setError, formState: { errors } } = useForm({
    resolver: zodResolver(registerSchema),
    defaultValues: { idType: "CCCD" },
  });

  const signup = useMutation({
    mutationFn: ({ confirmPassword, ...body }) => authApi.register(body),
    onSuccess: (u) => {
      const target = afterAuthPath(u, from);
      try { sessionStorage.removeItem("hotel_pending_booking_url"); } catch {}
      setJustSignedIn(true);
      setUser(u);
      toast.success(`Tạo tài khoản ${u.CustomerID} thành công`);
      navigate(target, { replace: true });
    },
    onError: (e) => {
      if (e.status === 409) setError("email", { message: e.message });
      toast.error(e.message);
    },
  });

  // setUser làm trang render lại -> chuyển hướng tại đây (quay lại trang đang xem trước khi đăng nhập)
  if (user && justSignedIn) return <Navigate to={afterAuthPath(user, from)} replace />;
  if (user) return <AlreadySignedIn from={from} />;

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="card p-6">
        <h1 className="text-2xl font-semibold">Đăng ký tài khoản khách hàng</h1>
        <p className="mt-1 text-sm text-slate-500">Dùng để đặt phòng online và theo dõi lịch sử đặt phòng.</p>

        {from && from.startsWith("/rooms/") && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/70 p-3 text-xs text-brand-900 flex items-center gap-2">
            <span className="text-base">🏨</span>
            <span>Đăng ký tài khoản để tiếp tục hoàn tất đơn đặt phòng đang chọn của bạn.</span>
          </div>
        )}
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
            <div className="relative">
              <input
                className="input pr-10"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Tối thiểu 6 ký tự"
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
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
          <Field label="Nhập lại mật khẩu" error={errors.confirmPassword}>
            <div className="relative">
              <input
                className="input pr-10"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Nhập lại mật khẩu"
                {...register("confirmPassword")}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600 focus:outline-none"
                onClick={() => setShowConfirmPassword((prev) => !prev)}
                aria-label={showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
              >
                {showConfirmPassword ? (
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
          <button className="btn-primary sm:col-span-2" disabled={signup.isPending}>
            {signup.isPending ? "Đang tạo tài khoản..." : "Đăng ký"}
          </button>
        </form>
        <p className="mt-4 text-center text-sm text-slate-500">
          Đã có tài khoản? <Link to="/login" state={{ from }} className="font-medium text-brand-600 hover:underline">Đăng nhập</Link>
        </p>
      </div>
    </div>
  );
}
