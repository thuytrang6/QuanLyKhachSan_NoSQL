import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { PageSkeleton } from "./Skeleton";

// Chặn route sai role: chưa đăng nhập -> /login; sai role -> /403
export default function ProtectedRoute({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <PageSkeleton />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (role && user.role !== role) return <Navigate to="/403" replace />;
  return children;
}

export const homeOf = (user) => (!user ? "/login" : user.role === "admin" ? "/admin" : "/rooms");
