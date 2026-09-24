import axios from "axios";

export const http = axios.create({ baseURL: "/api", withCredentials: true, timeout: 30000 });

// Mọi API trả { data } — bóc sẵn phần data
export const unwrap = (p) => p.then((r) => r.data.data);

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

http.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err.response ? err.response.status : 0;
    const e = err.response && err.response.data && err.response.data.error;
    const message = e ? e.message : status ? `Lỗi máy chủ (${status})` : "Không kết nối được máy chủ";
    return Promise.reject(new ApiError(status, e ? e.code : "NETWORK", message, e && e.details));
  },
);
