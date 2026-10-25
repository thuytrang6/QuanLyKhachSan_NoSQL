import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageSkeleton } from "./Skeleton";

// Chặn route sai role: chưa đăng nhập -> /login; sai role -> /403
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (role && user.role !== role) return <Navigate to="/403" replace />;
  return children;
}

export const homeOf = (user) => (!user ? "/" : user.role === "admin" ? "/admin" : "/");

// Sau đăng nhập/đăng ký:
// - Với Admin: luôn chuyển thẳng đến trang chủ Dashboard /admin (hoặc giữ trang nội bộ /admin/* nếu đang truy cập dở)
// - Với User (Khách hàng): quay lại trang đang xem (ví dụ: chi tiết phòng /rooms/:id) để tiếp tục thao tác
export function afterAuthPath(user, from) {
  if (!user) return "/";
  if (user.role === "admin") {
    return from && from.startsWith("/admin") ? from : "/admin";
  }
  // User (Khách hàng): nếu from không hợp lệ hoặc là trang admin thì về trang chủ /
  if (!from || from === "/login" || from === "/register" || from.startsWith("/admin")) return "/";
  return from;
}
