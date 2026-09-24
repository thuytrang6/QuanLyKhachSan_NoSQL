import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../context/AuthContext";
import { useHotel } from "../hooks/useRoomTypes";

const CUSTOMER_LINKS = [
  { to: "/rooms", label: "Tìm phòng" },
  { to: "/my-bookings", label: "Đơn của tôi" },
];
const ADMIN_LINKS = [
  { to: "/admin", label: "Dashboard", end: true },
  { to: "/admin/rooms", label: "Quản lý phòng" },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const hotel = useHotel();
  const navigate = useNavigate();
  const links = !user ? [] : user.role === "admin" ? ADMIN_LINKS : CUSTOMER_LINKS;

  const onLogout = async () => {
    await logout();
    toast.success("Đã đăng xuất");
    navigate("/login");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 font-semibold text-slate-900">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-500 text-white" aria-hidden>☀</span>
            <span>{hotel.data ? hotel.data.HotelName : "Khách sạn"}</span>
          </Link>
          <nav className="flex gap-1">
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} end={l.end}
                className={({ isActive }) => `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100"}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3">
            {user ? (
              <>
                <div className="text-right text-sm leading-tight">
                  <div className="font-medium text-slate-800">{user.FullName}</div>
                  <div className="text-xs text-slate-500">
                    {user.role === "admin" ? `${user.Role} · ${user.StaffID}` : `Khách hàng · ${user.CustomerID}`}
                  </div>
                </div>
                <button className="btn-secondary py-1.5" onClick={onLogout}>Đăng xuất</button>
              </>
            ) : (
              <>
                <NavLink to="/login" className="btn-ghost py-1.5">Đăng nhập</NavLink>
                <NavLink to="/register" className="btn-primary py-1.5">Đăng ký</NavLink>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 bg-white px-4 py-4 text-center text-xs text-slate-500">
        {hotel.data ? `${hotel.data.HotelName} · ${hotel.data.Address}, ${hotel.data.City} · ${hotel.data.Phone}` : ""}
        <span className="block">Dữ liệu đọc/ghi trực tiếp từ Amazon DynamoDB — bảng HotelBookingTable</span>
      </footer>
    </div>
  );
}
