import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { afterAuthPath } from "./ProtectedRoute";

// Mở /login hoặc /register khi đang đăng nhập sẵn: cho biết đang dùng tài khoản nào và cho đổi tài khoản
// (trước đây trang tự chuyển đi nên không có cách nào đăng nhập bằng tài khoản khác, ví dụ admin)
export default function AlreadySignedIn({ from }) {
  const { user, logout } = useAuth();
  const [busy, setBusy] = useState(false);
  const roleLabel = user.role === "admin" ? `Quản lý · ${user.Role} · ${user.StaffID}` : `Khách hàng · ${user.CustomerID}`;

  const switchAccount = async () => {
    setBusy(true);
    try {
      await logout(); // user = null -> trang login/đăng ký hiện lại form
      toast.success("Đã đăng xuất, hãy đăng nhập tài khoản khác");
    } catch (e) {
      toast.error(e.message || "Đăng xuất thất bại, vui lòng thử lại");
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-16">
      <div className="card p-6 text-center">
        <h1 className="text-xl font-semibold">Bạn đang đăng nhập</h1>
        <div className="mt-4 rounded-lg bg-slate-50 p-4">
          <div className="font-semibold text-slate-900">{user.FullName}</div>
          <div className="text-sm text-slate-600">{user.Email}</div>
          <div className="mt-1 text-xs text-slate-500">{roleLabel}</div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Link to={afterAuthPath(user, from)} replace className="btn-primary w-full">Tiếp tục với tài khoản này</Link>
          <button className="btn-secondary w-full" onClick={switchAccount} disabled={busy}>
            {busy ? "Đang đăng xuất..." : "Đăng xuất để đăng nhập tài khoản khác"}
          </button>
        </div>
      </div>
    </div>
  );
}
