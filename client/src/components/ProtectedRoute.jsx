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

// Sau đăng nhập/đăng ký: quay lại trang đang xem (vd. chi tiết phòng) nếu đúng quyền, ngược lại về trang chính
export function afterAuthPath(user, from) {
  const allowed = from && from !== "/login" && from !== "/register"
    && (user.role === "admin" ? from.startsWith("/admin") : !from.startsWith("/admin"));
  return allowed ? from : homeOf(user);
}
