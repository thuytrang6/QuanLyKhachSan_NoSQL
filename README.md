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
│       ├── services/            # quy tắc nghiệp vụ: pricing, booking, auth, room, report, backup
│       ├── routes/              # auth, rooms, bookings, admin
│       ├── middlewares/         # requireAuth, requireRole, validate (zod), error
│       └── validation/          # zod schema
└── client/                      # Vite + React 18 SPA (cổng 5173, proxy /api -> 4000)
    └── src/ api/ pages/ components/ context/ hooks/ utils/ validation/
```

## Chạy dự án

Yêu cầu: Node.js 18+, Docker.

```bash
# 1. DynamoDB Local (chạy container Docker)
#    Mặc định DynamoDB Local chạy trên cổng 8000 (khớp DDB_ENDPOINT=http://localhost:8000 trong server/.env)
npm run ddb:local

# 2. Cài thư viện (npm workspaces: 1 lệnh cài cho cả server và client)
npm install

# 3. Tạo bảng + nạp dữ liệu mẫu (chỉ cần chạy lần đầu, nạp 18.135 items)
npm run seed

# 4. Chạy API + web song song
npm run dev
```

Mở http://localhost:5173.

- `server/.env` đã có sẵn cấu hình cho DynamoDB Local (`DDB_ENDPOINT=http://localhost:8000`, `PORT=4000`, `TABLE=HotelBookingTable`). Muốn dùng AWS thật: xóa `DDB_ENDPOINT`, đặt `AWS_REGION=ap-southeast-1` và cấu hình credentials.
- **`npm run seed`**: tạo bảng nếu chưa có rồi nạp dữ liệu mẫu. Nếu bảng đã có, seed **không xóa gì**: chỉ ghi đè các item mẫu về trạng thái ban đầu, **giữ nguyên** tài khoản đăng ký, đơn đặt phòng, phòng tạo thêm.
- **`npm run seed:reset`**: xóa bảng và tạo lại từ đầu (chỉ DynamoDB Local). **Mất mọi dữ liệu tạo thêm**, chỉ dùng khi thật sự muốn làm sạch.
- Seed đặt lại `ExpiresAt` của đơn Pending **BK002314** = lúc nạp + 15 phút (demo TTL). 4 item `PK=COUNTER` (CUSTOMER, BOOKING, PAYMENT, LOG) được nâng lên mã lớn nhất của dữ liệu mẫu nhưng **không bao giờ bị hạ xuống**, nên seed lại không làm trùng mã đã cấp (lần đầu, mã tiếp theo là C0321, BK002317, P004206, L000581).
- Ảnh phòng lấy theo đường dẫn trong DB (`images/rooms/std-1.jpg`...). Đặt file ảnh vào `client/public/images/rooms/`. Nếu chưa có file ảnh, giao diện hiện khung thay thế đẹp mắt.

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
| Sửa hồ sơ khách hàng | `PUT /api/auth/me` | UpdateItem `CUSTOMER#<id>` / `PROFILE` (FullName, Phone, IDNumber, Address...) | 12 |
| Đăng ký | `POST /api/auth/register` | GetItem `UNIQUE#EMAIL#<email>` (kiểm tra trước) → UpdateItem `COUNTER/CUSTOMER` ADD Seq → TransactWrite Put Customer + Put UniqueEmail `attribute_not_exists(PK)` | 12 |
| Thông tin khách sạn (header) | `GET /api/hotel` | GetItem `HOTEL#MAIN / METADATA` | 1 |
| Danh sách loại phòng | `GET /api/rooms/types` | Query `HOTEL#MAIN`, begins_with `ROOMTYPE#` | 2 |
| Trang chủ: tìm phòng trống, lọc giá/tầng/loại, gắn tag lễ | `GET /api/rooms/search` | Query `HOTEL#MAIN` begins_with `ROOM#` + mỗi đêm Query GSI1 `NIGHT#<date>` begins_with `ROOMTYPE#<type>` (Booked, hoặc Held còn hạn) + Query `RATE#<type>#`; lọc `maxPrice` và `sort` ở server | 3, 5, 25 |
| Chi tiết phòng + lịch còn trống 2 tháng | `GET /api/rooms/:id` | GetItem Room + GetItem RoomType + Query `ROOM#<id>` SK BETWEEN `NIGHT#<đầu tháng>` AND `NIGHT#<cuối tháng sau>`; nếu có ngày: Query `ROOM#<id>` SK BETWEEN cho khoảng lưu trú + giá theo `RATE#` | 2, 3, 6, 25 |
| Tính giá (trẻ em + ngày lễ + voucher) | `POST /api/bookings/quote` | GetItem Room; Query `ROOMTYPE#`; Query `RATE#<type>#`; GetItem `VOUCHER#<code>`; GetItem Hotel (Policies); tính phụ thu trẻ em (>1m: 100k/đêm) và hệ số ngày lễ | 1, 2, 3, 25, 27 |
| Đặt phòng trực tiếp (Không cần thanh toán, Confirmed ngay) | `POST /api/bookings` | TransactWrite: Put Booking Confirmed (RoomID, CustomerID, TotalAmount...) + ConditionCheck Room + Put RoomNight Booked + Update Voucher `ADD UsedCount 1` | 6, 7 |
| Đặt phòng giữ chỗ (Pending 15p) | `POST /api/bookings` | TransactWrite: Put Booking Pending + ConditionCheck Room + Put RoomNight Held + Update Voucher | 6, 7 |
| Thanh toán cọc demo (VNPay) | `POST /api/bookings/:id/pay` | Query `BOOKING#<id>` → TransactWrite: Put Payment Deposit + Update Booking Pending→Confirmed + Update RoomNight Held→Booked | 7, 8 |
| Sửa ghi chú đơn đặt phòng | `PATCH /api/bookings/:id/notes` | UpdateItem `BOOKING#<id>` (SET Notes = :notes, UpdatedAt = :now, ADD Version 1) | 8 |
| Lịch sử đặt phòng của khách | `GET /api/bookings` | Query GSI2 `CUSTOMER#<id>` begins_with `BOOKING#`, ScanIndexForward=false | 10 |
| Chi tiết đơn đặt phòng | `GET /api/bookings/:id` | Query `PK=BOOKING#<id>` (Booking, Payment, Service, Surcharge, Invoice) | 8, 9 |
| Hủy đơn đặt phòng | `POST /api/bookings/:id/cancel` | TransactWrite: Update Booking → Cancelled (Version khớp) + Delete RoomNight (BookingID khớp) + Update Voucher `ADD UsedCount -1` + Put Payment Refund nếu đủ điều kiện | 7, 8 |
| Doanh thu 12 tháng (Dashboard) | `GET /api/admin/reports/revenue` | Query GSI3 `INVMONTH#<yyyy-mm>` × 12 (phân trang), cộng TotalAmount | 23 |
| Top hóa đơn tháng | `GET /api/admin/reports/invoices` | Query GSI3 `INVMONTH#<yyyy-mm>` | 23 |
| Số booking theo 6 trạng thái | `GET /api/admin/reports/booking-status` | Query GSI3 `BKSTATUS#<status>` Select=COUNT × 6 | 14, 15, 17 |
| Công suất phòng theo ngày | `GET /api/admin/reports/occupancy` | Query GSI1 `NIGHT#<date>` filter Booked, Select=COUNT / Query `ROOM#` Select=COUNT | 3, 5 |
| Khách đến hôm nay, khách đang ở, đánh giá | `GET /api/admin/reports/overview` | GSI3 `BKSTATUS#Confirmed` begins_with `CHECKIN#<date>`; GSI3 `BKSTATUS#CheckedIn`; GetItem Hotel; Query `REVIEW#` desc Limit 10 | 1, 14, 15, 28 |
| Sơ đồ trạng thái phòng (refetch 5 giây) | `GET /api/admin/room-board` | Query GSI3 `ROOMSTATUS#<status>` × 5 | 4 |
| Danh sách phòng + lọc + phân trang | `GET /api/admin/rooms` | Query `HOTEL#MAIN` begins_with `ROOM#` (LastEvaluatedKey phân trang), lọc tầng/loại/trạng thái | 3 |
| Tạo phòng mới | `POST /api/admin/rooms` | GetItem RoomType → TransactWrite Put Room `attribute_not_exists(PK)` (GSI3 `ROOMSTATUS#Available`, Version 1) + Hotel `ADD TotalRooms 1` | 2, 3 |
| Sửa phòng / đổi trạng thái (Optimistic Lock) | `PUT /api/admin/rooms/:id` | TransactWrite Update Room (Version khớp, không Occupied; SET Status, GSI3PK, UpdatedAt, ADD Version 1) + Put RoomStatusLog | 3, 4, 22 |
| Xóa phòng | `DELETE /api/admin/rooms/:id` | Query GSI1 `ROOM#<id>` begins_with `CHECKIN#` + Query `ROOM#<id>` begins_with `NIGHT#` → TransactWrite Delete Room + log + Hotel `ADD TotalRooms -1` (chặn nếu đã có lịch sử) | 6, 13, 22 |
| Nhật ký trạng thái phòng | `GET /api/admin/rooms/:id/logs` | Query `ROOM#<id>` begins_with `LOG#`, mới nhất trước | 22 |
| Sao lưu & Phục hồi DynamoDB | `GET/POST /api/admin/backup*` | Scan toàn bộ bảng thành JSON, nạp ngược lại bảng bằng BatchWriteCommand theo khối 25 item | Quản trị |

## Quy tắc nghiệp vụ

1. **Tính tiền theo trẻ em & ngày lễ**:
   - **Trẻ em**:
     - Trẻ em dưới 1m: **Miễn phí** (0đ).
     - Trẻ em trên 1m: Phụ thu **100.000đ / trẻ / đêm**.
     - Tổng phụ thu trẻ em: `ChildSurchargeTotal = childrenOver1m × 100.000 × số_đêm`.
   - **Ngày lễ**:
     - Tự động nhận diện các ngày lễ lớn trong năm 2026 (Tết Dương lịch, Tết Nguyên Đán, Giỗ tổ Hùng Vương, 30/4 - 1/5, Quốc khánh 2/9, Giáng sinh...): **Phụ thu thêm 10% của giá phòng** (hệ số `Multiplier = 1.10`).
     - Trên lịch (`AvailabilityCalendar`): Note trực quan các ngày lễ với badge 🎉, viền nổi bật, tooltip tên ngày lễ & mức phụ thu 10%, kèm khung thông báo danh sách ngày lễ trong tháng.
     - Giao diện đặt phòng hiển thị chi tiết phụ thu từng đêm lễ (ví dụ: `🎉 Lễ Quốc khánh 2/9 (+10%)`).
2. **Đặt phòng không cần thanh toán**:
   - Khách có thể chọn tùy chọn: **"Xác nhận đặt phòng (Thanh toán tại khách sạn)"**.
   - Đơn lập tức chuyển trạng thái `Confirmed`, các đêm phòng chuyển thành `Booked`, không bị hủy tự động sau 15 phút.
   - Hỗ trợ cả chế độ demo VNPay cọc 20% (trạng thái ban đầu `Pending`, đếm ngược 15 phút).
3. **Sửa thông tin**:
   - Khách hàng có thể cập nhật thông tin cá nhân (Họ tên, SĐT, CMND/CCCD, Quốc tịch, Ngày sinh, Địa chỉ) tại trang `/profile`.
   - Khách hàng có thể cập nhật Ghi chú đơn đặt phòng (`Notes`) tại chi tiết đơn đặt phòng.
4. **Admin Backup - Restore**:
   - Trang `/admin/backup` cho phép:
     - Tạo bản sao lưu tức thì (lưu file JSON kèm timestamp).
     - Xem danh sách và tải file sao lưu về máy.
     - Khôi phục dữ liệu từ bản sao lưu bất kỳ, hoặc tải file JSON từ máy tính lên để khôi phục.
     - Nút khôi phục dữ liệu gốc `seed` (18.135 items) nhanh chóng.
5. **Chống đặt trùng & khóa lạc quan**:
   - Mỗi đêm phòng là một item `RoomNight` độc lập, kiểm tra điều kiện trong `TransactWriteCommand`.
   - Đổi Status của Room/Booking luôn cập nhật cùng lúc: `Status`, `GSI3PK`, `UpdatedAt` và `ADD Version 1`.

## Hướng dẫn Query DynamoDB
```
node query-db.js room 501
node query-db.js booking BK002317
node query-db.js nights 501
node query-db.js check-deleted 999
node query-db.js hotel
```
