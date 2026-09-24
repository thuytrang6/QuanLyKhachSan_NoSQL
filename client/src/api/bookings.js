import { http, unwrap } from "./client";

export const bookingsApi = {
  quote: (body) => unwrap(http.post("/bookings/quote", body)),
  create: (body) => unwrap(http.post("/bookings", body)),
  mine: () => unwrap(http.get("/bookings")),
  detail: (id) => unwrap(http.get(`/bookings/${id}`)),
  pay: (id) => unwrap(http.post(`/bookings/${id}/pay`)),
  cancel: (id, reason) => unwrap(http.post(`/bookings/${id}/cancel`, { reason })),
};
