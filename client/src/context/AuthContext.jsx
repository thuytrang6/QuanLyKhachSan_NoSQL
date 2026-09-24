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
      qc.clear();
      qc.setQueryData(["auth", "me"], null);
    },
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
