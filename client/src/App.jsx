import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import { PageSkeleton } from "./components/Skeleton";
import { useAuth } from "./context/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import HomePage from "./pages/HomePage";
import RoomDetailPage from "./pages/RoomDetailPage";
import PaymentPage from "./pages/PaymentPage";
import MyBookingsPage from "./pages/MyBookingsPage";
import BookingDetailPage from "./pages/BookingDetailPage";
import DashboardPage from "./pages/admin/DashboardPage";
import RoomsAdminPage from "./pages/admin/RoomsAdminPage";
import RoomLogsPage from "./pages/admin/RoomLogsPage";
import { ForbiddenPage, NotFoundPage } from "./pages/ErrorPages";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <PageSkeleton />;
  // Trang chủ công khai cho khách; admin về dashboard quản lý
  if (user && user.role === "admin") return <Navigate to="/admin" replace />;
  return <HomePage />;
}

const customer = (el) => <ProtectedRoute role="customer">{el}</ProtectedRoute>;
const admin = (el) => <ProtectedRoute role="admin">{el}</ProtectedRoute>;

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        <Route path="/rooms" element={<Navigate to="/" replace />} />
        <Route path="/rooms/:id" element={<RoomDetailPage />} />
        <Route path="/booking/:id/pay" element={customer(<PaymentPage />)} />
        <Route path="/my-bookings" element={customer(<MyBookingsPage />)} />
        <Route path="/my-bookings/:id" element={customer(<BookingDetailPage />)} />

        <Route path="/admin" element={admin(<DashboardPage />)} />
        <Route path="/admin/rooms" element={admin(<RoomsAdminPage />)} />
        <Route path="/admin/rooms/:id/logs" element={admin(<RoomLogsPage />)} />

        <Route path="/403" element={<ForbiddenPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
