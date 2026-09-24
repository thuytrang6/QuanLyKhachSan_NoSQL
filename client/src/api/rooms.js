import { http, unwrap } from "./client";

export const roomsApi = {
  types: () => unwrap(http.get("/rooms/types")),
  search: (params) => unwrap(http.get("/rooms/search", { params })),
};
