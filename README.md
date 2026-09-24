<<<<<<< HEAD
# Quản lý đặt phòng khách sạn — Amazon DynamoDB (single-table)

Web app Node.js + React cho đồ án môn Dữ liệu NoSQL. Toàn bộ dữ liệu nằm trong **một bảng DynamoDB `HotelBookingTable`** (PK/SK + GSI1–3) theo thiết kế trong `Database/HuongDan_DB_HotelBooking_v2.docx`. Backend chỉ dùng **Query / GetItem / TransactWrite** theo access pattern của docx (mục 5), không dùng Scan, không có mock data.

```
.
├── Database/                    # docx thiết kế + HotelBookingTable.json (18.135 item, DynamoDB JSON)
├── seed.js                      # tạo bảng (3 GSI, On-demand, Streams, TTL) + nạp dữ liệu + item COUNTER
├── server/                      # Express REST API (cổng 4000)
│   └── src/
│       ├── config/db.js         # DynamoDBDocumentClient, queryAll/countAll có phân trang
│       ├── repositories/        # NƠI DUY NHẤT gọi DynamoDB (mỗi hàm ghi chú access pattern)
│       ├── services/            # quy tắc nghiệp vụ: pricing, booking, auth, room, report
│       ├── routes/              # auth, rooms, bookings, admin
│       ├── middlewares/         # requireAuth, requireRole, validate (zod), error
│       └── validation/          # zod schema
└── client/                      # Vite + React 18 SPA (cổng 5173, proxy /api -> 4000)
    └── src/ api/ pages/ components/ context/ hooks/ utils/ validation/
```

## Chạy dự án

Yêu cầu: Node.js 18+, Docker.

```bash
# 1. DynamoDB Local
docker run -d --name dynamodb-local -p 8000:8000 amazon/dynamodb-local
#    (hoặc: npm run ddb:local)

# 2. Cài thư viện (npm workspaces: 1 lệnh cài cho cả server và client,
#    chỉ có 1 package-lock.json và 1 node_modules ở thư mục gốc)
npm install

# 3. Tạo bảng + nạp dữ liệu mẫu (đọc cấu hình trong server/.env)
npm run seed



# 4. Chạy API + web song song
npm run dev
```

Mở http://localhost:5173.

- `server/.env` đã có sẵn cấu hình cho DynamoDB Local (xem `server/.env.example`). Muốn dùng AWS thật: xóa `DDB_ENDPOINT`, đặt `AWS_REGION=ap-southeast-1` và cấu hình credentials.
- `npm run seed` trên DynamoDB Local sẽ **xóa bảng cũ và tạo lại** để dữ liệu sạch. Chạy lại seed bất cứ lúc nào muốn trả dữ liệu về trạng thái ban đầu.
- Seed đặt lại `ExpiresAt` của đơn Pending **BK002314** = lúc nạp + 15 phút (demo TTL), và tạo 4 item `PK=COUNTER` (CUSTOMER, BOOKING, PAYMENT, LOG) có `Seq` = mã lớn nhất trong dữ liệu mẫu, nên mã tiếp theo là C0321, BK002317, P004206, L000581.
- Container chạy mặc định ở chế độ in-memory: seed nhanh hơn nhưng **mất dữ liệu khi container dừng**. Nếu chạy với `-sharedDb -dbPath ...` để lưu xuống đĩa thì seed mất khoảng 10 phút trên Docker Desktop Windows.
- Ảnh phòng lấy theo đường dẫn trong DB (`images/rooms/std-1.jpg`...). Đặt file ảnh vào `client/public/images/rooms/`. Nếu chưa có file ảnh, giao diện hiện khung thay thế.

## Xử lý sự cố

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Đăng nhập báo "Không kết nối được máy chủ", `/api/health` vẫn ok | DynamoDB Local không phản hồi. Đợi seed chạy xong (container lưu đĩa bị chậm khi seed). Nếu vẫn treo: `docker restart dynamodb-local` rồi `npm run seed` lại. |
| Seed báo "Đang có một lệnh seed khác chạy" | Chỉ chạy **một** lệnh seed mỗi lần, vì 2 lệnh ghi chồng sẽ làm kẹt khóa database. Đợi lệnh kia in `Xong.` |
| `npm run dev` báo `EADDRINUSE :4000`, hoặc Vite chạy ở cổng 5174 | Còn một bản dev cũ đang chạy. Tắt nó đi (Ctrl+C ở terminal cũ) rồi chạy lại. |
| Dashboard thiếu số liệu, đăng nhập sai dù đúng mật khẩu | Seed chưa xong hoặc bị ngắt giữa chừng. Chạy lại `npm run seed` và đợi dòng `Xong.` |

## Tài khoản test (mật khẩu `123456`)

| Email | Vai trò trên web | Ghi chú |
|---|---|---|
| lethibich@gmail.com | customer | C0002, có đơn BK001960 (phòng 205, 25→27/09) |
| long.pham@sunrisehotel.vn | admin | S11, Role Admin |
| ha.vo@sunrisehotel.vn | admin | S10, Role Manager |
| lan.tran@sunrisehotel.vn | bị từ chối | Receptionist, không phải Admin/Manager |
| tung.ly@sunrisehotel.vn | bị từ chối | Tài khoản đã khóa (IsActive = false) |
| nguyenvanan@gmail.com | bị từ chối | Khách tạo tại quầy, không có PasswordHash |

Dữ liệu mẫu lấy mốc **24/09/2026**. Trên dashboard có nút **"Dùng ngày dữ liệu mẫu"**.

## Bảng map chức năng → access pattern (docx mục 5)

| Chức năng | API | Thao tác DynamoDB | AP |
|---|---|---|---|
| Đăng nhập, `/auth/me` | `POST /api/auth/login`, `GET /api/auth/me` | Query GSI2 `EMAIL#<email>` / `PROFILE` + bcrypt | 11 |
| Đăng ký | `POST /api/auth/register` | GetItem `UNIQUE#EMAIL#<email>` (kiểm tra trước) → UpdateItem `COUNTER/CUSTOMER` ADD Seq → TransactWrite Put Customer + Put UniqueEmail `attribute_not_exists(PK)` | 12 |
| Thông tin khách sạn (header) | `GET /api/hotel` | GetItem `HOTEL#MAIN / METADATA` | 1 |
| Danh sách loại phòng | `GET /api/rooms/types` | Query `HOTEL#MAIN`, begins_with `ROOMTYPE#` | 2 |
| Tìm phòng trống | `GET /api/rooms/search` | Query `HOTEL#MAIN` begins_with `ROOM#` + mỗi đêm Query GSI1 `NIGHT#<date>` begins_with `ROOMTYPE#<type>` (Booked, hoặc Held còn hạn) | 3, 5 |
| Tính giá, báo giá | `POST /api/bookings/quote` | GetItem Room; Query `ROOMTYPE#`; Query `RATE#<type>#`; GetItem `VOUCHER#<code>`; GetItem Hotel (Policies) | 1, 2, 3, 25, 27 |
| Đặt phòng (Pending, giữ 15 phút) | `POST /api/bookings` | Query `ROOM#<id>` SK BETWEEN (kiểm tra sớm) → TransactWrite: Put Booking + ConditionCheck Room + Put RoomNight Held `attribute_not_exists(PK) OR (Status=Held AND ExpiresAt<now)` + Update Voucher `ADD UsedCount 1` (IsActive AND UsedCount<UsageLimit) | 6, 7 |
| Thanh toán cọc (VNPay demo) | `POST /api/bookings/:id/pay` | Query `BOOKING#<id>` → TransactWrite: Put Payment Deposit + Update Booking Pending→Confirmed (Status=Pending AND ExpiresAt>now, REMOVE ExpiresAt, ADD Version) + Update RoomNight Held→Booked | 7, 8 |
| Lịch sử đặt phòng | `GET /api/bookings` | Query GSI2 `CUSTOMER#<id>` begins_with `BOOKING#`, ScanIndexForward=false | 10 |
| Chi tiết đơn | `GET /api/bookings/:id` | Query `PK=BOOKING#<id>` (Booking, Payment, Service, Surcharge, Invoice) | 8, 9 |
| Hủy đơn Confirmed | `POST /api/bookings/:id/cancel` | TransactWrite: Update Booking → Cancelled (Version khớp) + Delete RoomNight (BookingID khớp) + Update Voucher `ADD UsedCount -1` + Put Payment Refund nếu hủy trước 14:00 ngày nhận phòng ≥ 48h | 7, 8 |
| Doanh thu 12 tháng | `GET /api/admin/reports/revenue` | Query GSI3 `INVMONTH#<yyyy-mm>` × 12 (phân trang), cộng TotalAmount | 23 |
| Top hóa đơn tháng | `GET /api/admin/reports/invoices` | Query GSI3 `INVMONTH#<yyyy-mm>` | 23 |
| Booking theo trạng thái | `GET /api/admin/reports/booking-status` | Query GSI3 `BKSTATUS#<status>` Select=COUNT × 6 | 14, 15, 17 |
| Công suất phòng theo ngày | `GET /api/admin/reports/occupancy` | Query GSI1 `NIGHT#<date>` filter Booked, Select=COUNT / Query `ROOM#` Select=COUNT | 3, 5 |
| Khách đến hôm nay, khách đang ở, đánh giá | `GET /api/admin/reports/overview` | GSI3 `BKSTATUS#Confirmed` begins_with `CHECKIN#<date>`; GSI3 `BKSTATUS#CheckedIn`; GetItem Hotel; Query `REVIEW#` desc Limit 10 | 1, 14, 15, 28 |
| Sơ đồ trạng thái phòng (refetch 5 giây) | `GET /api/admin/room-board` | Query GSI3 `ROOMSTATUS#<status>` × 5 | 4 |
| Danh sách phòng + lọc | `GET /api/admin/rooms` | Query `HOTEL#MAIN` begins_with `ROOM#` | 3 |
| Tạo phòng | `POST /api/admin/rooms` | GetItem RoomType → TransactWrite Put Room `attribute_not_exists(PK)` (GSI3 `ROOMSTATUS#Available`, Version 1) + Hotel `ADD TotalRooms 1` | 2, 3 |
| Sửa phòng / đổi trạng thái | `PUT /api/admin/rooms/:id` | TransactWrite Update Room (Version khớp, không Occupied; SET Status, GSI3PK, UpdatedAt, ADD Version) + Put RoomStatusLog | 3, 4, 22 |
| Xóa phòng | `DELETE /api/admin/rooms/:id` | Query GSI1 `ROOM#<id>` begins_with `CHECKIN#` Limit 1 + Query `ROOM#<id>` begins_with `NIGHT#` Limit 1 → TransactWrite Delete Room + log + Hotel `ADD TotalRooms -1` | 6, 13, 22 |
| Nhật ký trạng thái phòng | `GET /api/admin/rooms/:id/logs` | Query `ROOM#<id>` begins_with `LOG#`, mới nhất trước | 22 |
| Sinh mã C/BK/P/L | (nội bộ) | UpdateItem `PK=COUNTER, SK=<name>` ADD Seq 1, ReturnValues UPDATED_NEW | bổ sung |

## Quy tắc nghiệp vụ đã cài đặt

- **Giá đêm** = BasePrice × Multiplier của Rate có Priority cao nhất bao phủ đêm đó, làm tròn nghìn. Voucher kiểm tra IsActive, hạn (theo ngày tạo đơn), MinOrder, MinNights, UsedCount < UsageLimit. `TotalPrice = SubTotal − Discount`, cọc = `DepositPercent` (20%, đọc từ Hotel.Policies) làm tròn nghìn.
- **Chống đặt trùng**: mỗi đêm của mỗi phòng là 1 item RoomNight, ghi có điều kiện trong TransactWrite. Hai người bấm đặt cùng lúc thì chỉ 1 người thành công, người kia nhận 409 "Phòng vừa được người khác đặt, vui lòng chọn phòng khác" và danh sách phòng tự tải lại.
- **Hết hạn giữ chỗ**: backend luôn tự so `ExpiresAt` với thời điểm hiện tại, không chờ TTL (docx 7.6). Đêm Held quá hạn được coi là trống và cho phép ghi đè.
- **Đổi Status** của Room/Booking luôn cập nhật cùng lúc `Status`, `GSI3PK`, `UpdatedAt` và `ADD Version 1`. Sửa phòng dùng khóa lạc quan theo Version (lệch thì trả 409 "Dữ liệu đã bị người khác sửa, tải lại").
- API trả `{ data }` hoặc `{ error: { code, message } }`. Mã lỗi: 400 dữ liệu không hợp lệ, 401, 403, 404, 409 xung đột.

## Kiểm thử đã chạy (DynamoDB Local, dữ liệu seed)

1. Đăng ký email mới → C0321; đăng ký trùng email → 409 "Email đã được sử dụng".
2. Customer mở `/admin` → chuyển tới trang 403; gọi API admin → 403.
3. Tìm 25/09–27/09/2026 loại DLX → 207, 208, 401, 408 (**không có 205**).
4. Hai phiên đặt cùng phòng cùng đêm đồng thời → 201 / 409.
5. Đơn Pending quá hạn → phòng xuất hiện lại khi tìm, thanh toán bị từ chối (409), người khác đặt được.
6. Doanh thu tháng 09/2026 = **753.007.000đ** (199 hóa đơn).
7. Tạo, sửa (kèm RoomStatusLog, Version), xóa phòng mới đều hoạt động. Phòng 101 không xóa được (đã có lịch sử). Phòng Occupied không đổi được Status.
8. Grep `server/src` và `client/src` không còn giá, voucher, tên khách sạn hay tài khoản hardcode. Mọi con số đều đọc từ DynamoDB.
=======
# QuanLyKhachSan_NoSQL
>>>>>>> f7a240cc52a177bc13355467e3ed4f368d2991a7
