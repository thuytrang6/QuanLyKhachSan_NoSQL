import { http, unwrap } from "./client";

export const adminApi = {
  revenue: (year) => unwrap(http.get("/admin/reports/revenue", { params: { year } })),
  invoices: (month) => unwrap(http.get("/admin/reports/invoices", { params: { month } })),
  bookingStatus: () => unwrap(http.get("/admin/reports/booking-status")),
  occupancy: (month) => unwrap(http.get("/admin/reports/occupancy", { params: { month } })),
  overview: (date) => unwrap(http.get("/admin/reports/overview", { params: { date } })),
  roomBoard: () => unwrap(http.get("/admin/room-board")),
  rooms: (params) => unwrap(http.get("/admin/rooms", { params })),
  room: (id) => unwrap(http.get(`/admin/rooms/${id}`)),
  createRoom: (body) => unwrap(http.post("/admin/rooms", body)),
  updateRoom: (id, body) => unwrap(http.put(`/admin/rooms/${id}`, body)),
  deleteRoom: (id) => unwrap(http.delete(`/admin/rooms/${id}`)),
  roomLogs: (id) => unwrap(http.get(`/admin/rooms/${id}/logs`)),
};
