import { http, unwrap } from "./client";

export const authApi = {
  me: () => unwrap(http.get("/auth/me")),
  login: (body) => unwrap(http.post("/auth/login", body)),
  register: (body) => unwrap(http.post("/auth/register", body)),
  logout: () => unwrap(http.post("/auth/logout")),
  hotel: () => unwrap(http.get("/hotel")),
};
