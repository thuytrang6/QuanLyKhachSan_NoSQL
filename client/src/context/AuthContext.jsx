import { createContext, useContext } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { authApi } from "../api/auth";

const AuthContext = createContext(null);

// Đọc /api/auth/me khi load app; 401 nghĩa là chưa đăng nhập
export function AuthProvider({ children }) {
  const qc = useQueryClient();
  const me = useQuery({
    queryKey: ["auth", "me"],
    queryFn: () => authApi.me().catch((e) => { if (e.status === 401) return null; throw e; }),
    staleTime: 5 * 60e3,
    retry: false,
  });

  const value = {
    user: me.data || null,
    loading: me.isLoading,
    error: me.error,
    setUser: (u) => qc.setQueryData(["auth", "me"], u),
    logout: async () => {
      await authApi.logout();
      // Đặt user = null trên CHÍNH query đang được theo dõi (không dùng qc.clear(): nó xóa query này
      // khỏi cache nên giao diện vẫn giữ user cũ), rồi mới bỏ dữ liệu riêng của tài khoản vừa đăng xuất.
      await qc.cancelQueries();
      qc.setQueryData(["auth", "me"], null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== "auth" });
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
