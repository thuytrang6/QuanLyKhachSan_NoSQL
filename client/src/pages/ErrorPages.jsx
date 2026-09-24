import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { homeOf } from "../components/ProtectedRoute";

function ErrorPage({ code, title, description, switchAccount }) {
  const { user } = useAuth();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-24 text-center">
      <div className="text-7xl font-bold text-brand-500">{code}</div>
      <h1 className="mt-4 text-2xl font-semibold">{title}</h1>
      <p className="mt-2 text-slate-500">{description}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link to={homeOf(user)} className="btn-primary">Về trang chính</Link>
        {switchAccount && <Link to="/login" className="btn-secondary">Đăng nhập tài khoản khác</Link>}
      </div>
    </div>
  );
}

export const ForbiddenPage = () => (
  <ErrorPage code="403" title="Không có quyền truy cập" description="Tài khoản của bạn không được phép mở trang này." switchAccount />
);

export const NotFoundPage = () => (
  <ErrorPage code="404" title="Không tìm thấy trang" description="Đường dẫn không tồn tại hoặc đã bị thay đổi." />
);
