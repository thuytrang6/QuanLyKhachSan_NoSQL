**HƯỚNG DẪN THIẾT KẾ DATABASE**

**Hệ thống Quản lý đặt phòng khách sạn và tình trạng phòng theo thời gian thực**

Amazon DynamoDB — Single-Table Design (phiên bản 2.0)

**Bảng:** HotelBookingTable (1 bảng, 3 GSI, TTL, Streams)

**File dữ liệu:** HotelBookingTable.json — DynamoDB JSON, 18.135 items

**Script nạp dữ liệu:** seed.js (Node.js, AWS SDK v3)

**Thời điểm dữ liệu:** 24/09/2026 10:00 (giờ Việt Nam)

*Tài liệu nội bộ cho nhóm — đọc trước khi code Backend/Frontend*

**MỤC LỤC**

1\. Mục đích và phạm vi

Tài liệu mô tả toàn bộ cách dữ liệu của hệ thống đặt phòng khách sạn được lưu trong Amazon DynamoDB theo mô hình **một bảng duy nhất** (single-table design). Đây là bản 2.0, thay thế bản hướng dẫn cũ: sửa các lỗi thiết kế khóa, bổ sung các entity còn thiếu và đi kèm bộ dữ liệu chuẩn dùng trực tiếp cho demo web Node.js.

Mục tiêu để cả 3 thành viên (thiết kế DB, Frontend, Backend) thống nhất về:

- Cấu trúc khóa: Partition Key, Sort Key và 3 Global Secondary Index.

- Danh sách access pattern (câu hỏi nghiệp vụ) và cách truy vấn tương ứng.

- Danh sách entity, field, kiểu dữ liệu và ý nghĩa.

- Quy tắc nghiệp vụ: tính giá, voucher, đặt cọc, hủy, chống đặt trùng, trạng thái phòng thời gian thực.

- Bộ dữ liệu mẫu, cách nạp vào DynamoDB, backup/restore, truy vấn trên Console và kết nối Node.js.

Tài liệu bám theo thang điểm môn Dữ liệu NoSQL: mục 5 (xây dựng Database), mục 6 (Import/Export, Backup/Restore), mục 7 (truy vấn cơ bản và nâng cao trên GUI Tool), mục 8 (kết nối ứng dụng) và mục 9 (demo chức năng).

2\. Khái niệm nền tảng

2.1. Partition Key và Sort Key

PK và SK hợp thành khóa chính. PK quyết định item nằm ở phân vùng vật lý nào; các item cùng PK được lưu cạnh nhau và gọi là một item collection. SK sắp xếp và phân biệt các item trong cùng PK, cho phép truy vấn theo khoảng (BETWEEN) hoặc theo tiền tố (begins_with).

Ví dụ: mọi item có PK = BOOKING#BK001954 gồm thông tin đặt phòng (SK = METADATA), các lượt thanh toán (PAYMENT#...), phụ phí (SURCHARGE#...), dịch vụ (SERVICE#...) và hóa đơn (INVOICE#...). Một lệnh Query duy nhất lấy về toàn bộ hồ sơ đặt phòng.

2.2. Global Secondary Index (GSI)

DynamoDB chỉ truy vấn nhanh theo khóa. Khi cần tra theo chiều khác (theo phòng, theo email, theo trạng thái) ta tạo GSI với cặp khóa riêng. Bảng này dùng 3 GSI có tên field trung tính (GSI1PK/GSI1SK...) để nhiều entity dùng chung một index. Kỹ thuật này gọi là **index overloading**.

GSI trong thiết kế là **sparse index**: item nào không có GSI1PK thì không xuất hiện trong GSI1. Nhờ vậy mỗi index chỉ chứa đúng các item cần tra cứu, tiết kiệm chi phí và tránh lẫn dữ liệu.

2.3. Single-table design

Thay vì tách 15 bảng, mọi entity nằm trong bảng HotelBookingTable. Sự khác nhau giữa các entity nằm ở giá trị PK/SK và field EntityType. Nguyên tắc cốt lõi: **xác định access pattern trước, rồi mới thiết kế khóa**. DynamoDB không có JOIN, nên dữ liệu hay đọc cùng nhau phải được đặt chung PK hoặc sao chép sẵn (denormalize), ví dụ CustomerName được lưu luôn trong Booking.

2.4. Các tính năng DynamoDB dùng trong đề tài

| **Tính năng**                  | **Dùng để làm gì trong hệ thống**                                                                                        |
|--------------------------------|--------------------------------------------------------------------------------------------------------------------------|
| TransactWriteItems             | Ghi nhiều item nguyên tử: tạo Booking + khóa từng đêm phòng + tăng lượt dùng voucher. Một item lỗi thì cả giao dịch hủy. |
| Condition Expression           | Chống đặt trùng phòng (attribute_not_exists), chống vượt giới hạn voucher, optimistic locking theo Version.              |
| TTL (Time To Live)             | Tự xóa đơn Pending và các đêm đang giữ chỗ (Held) sau 15 phút nếu khách không thanh toán cọc. Field: ExpiresAt.          |
| DynamoDB Streams               | Phát sự kiện khi Room/Booking thay đổi để đẩy trạng thái phòng thời gian thực lên web.                                   |
| PartiQL Editor                 | Truy vấn kiểu SQL trên Console: SELECT, INSERT, UPDATE, DELETE.                                                          |
| Import/Export S3, Backup, PITR | Nạp dữ liệu hàng loạt, xuất dữ liệu, sao lưu và khôi phục theo thời điểm.                                                |

3\. Cấu trúc bảng HotelBookingTable

3.1. Khóa và index

| **Thành phần**                | **Khóa**              | **Kiểu** | **Projection** | **Chứa những entity**                                    |
|-------------------------------|-----------------------|----------|----------------|----------------------------------------------------------|
| Bảng chính                    | PK (HASH), SK (RANGE) | String   | \-             | Tất cả                                                   |
| GSI1 — theo phòng / theo đêm  | GSI1PK, GSI1SK        | String   | ALL            | Booking, RoomNight, HousekeepingTask                     |
| GSI2 — theo người             | GSI2PK, GSI2SK        | String   | ALL            | Customer, Staff, Booking, Review, HousekeepingTask       |
| GSI3 — theo trạng thái / ngày | GSI3PK, GSI3SK        | String   | ALL            | Room, Booking, Staff, HousekeepingTask, Invoice, Payment |

3.2. Cấu hình bảng

- Capacity mode: **On-demand** (PAY_PER_REQUEST), không phải ước lượng RCU/WCU.

- TTL: bật trên attribute ExpiresAt (Number, epoch giây).

- Streams: bật, view type NEW_AND_OLD_IMAGES.

- Point-in-time recovery (PITR): bật, để demo khôi phục và Export to S3.

- Region khuyến nghị: ap-southeast-1 (Singapore), gần Việt Nam nhất.

4\. Danh sách entity và cấu trúc khóa

<table>
<colgroup>
<col style="width: 13%" />
<col style="width: 19%" />
<col style="width: 18%" />
<col style="width: 16%" />
<col style="width: 16%" />
<col style="width: 15%" />
</colgroup>
<thead>
<tr class="header">
<th><strong>Entity</strong></th>
<th><strong>PK</strong></th>
<th><strong>SK</strong></th>
<th><strong>GSI1</strong></th>
<th><strong>GSI2</strong></th>
<th><strong>GSI3</strong></th>
</tr>
</thead>
<tbody>
<tr class="odd">
<td>Hotel</td>
<td>HOTEL#MAIN</td>
<td>METADATA</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="even">
<td>RoomType</td>
<td>HOTEL#MAIN</td>
<td>ROOMTYPE#&lt;id&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>Room</td>
<td>HOTEL#MAIN</td>
<td>ROOM#&lt;id&gt;</td>
<td></td>
<td></td>
<td><p>ROOMSTATUS#&lt;st&gt;</p>
<p>FLOOR#&lt;ff&gt;#ROOM#&lt;id&gt;</p></td>
</tr>
<tr class="even">
<td>RoomNight</td>
<td>ROOM#&lt;id&gt;</td>
<td>NIGHT#&lt;date&gt;</td>
<td><p>NIGHT#&lt;date&gt;</p>
<p>ROOMTYPE#&lt;t&gt;#ROOM#&lt;id&gt;</p></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>RoomStatusLog</td>
<td>ROOM#&lt;id&gt;</td>
<td>LOG#&lt;ts&gt;#&lt;logId&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="even">
<td>Customer</td>
<td>CUSTOMER#&lt;id&gt;</td>
<td>PROFILE</td>
<td></td>
<td><p>EMAIL#&lt;email&gt;</p>
<p>PROFILE</p></td>
<td></td>
</tr>
<tr class="odd">
<td>Staff</td>
<td>USER#&lt;id&gt;</td>
<td>PROFILE</td>
<td></td>
<td><p>EMAIL#&lt;email&gt;</p>
<p>PROFILE</p></td>
<td><p>ROLE#&lt;role&gt;</p>
<p>USER#&lt;id&gt;</p></td>
</tr>
<tr class="even">
<td>UniqueEmail</td>
<td>UNIQUE#EMAIL#&lt;email&gt;</td>
<td>UNIQUE</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>Booking</td>
<td>BOOKING#&lt;id&gt;</td>
<td>METADATA</td>
<td><p>ROOM#&lt;id&gt;</p>
<p>CHECKIN#&lt;date&gt;#&lt;bk&gt;</p></td>
<td><p>CUSTOMER#&lt;id&gt;</p>
<p>BOOKING#&lt;date&gt;#&lt;bk&gt;</p></td>
<td><p>BKSTATUS#&lt;st&gt;</p>
<p>CHECKIN#&lt;date&gt;#&lt;bk&gt;</p></td>
</tr>
<tr class="even">
<td>Payment</td>
<td>BOOKING#&lt;id&gt;</td>
<td>PAYMENT#&lt;id&gt;</td>
<td></td>
<td></td>
<td><p>PAYDATE#&lt;date&gt;</p>
<p>&lt;ts&gt;#&lt;id&gt;</p></td>
</tr>
<tr class="odd">
<td>Surcharge</td>
<td>BOOKING#&lt;id&gt;</td>
<td>SURCHARGE#&lt;id&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="even">
<td>BookingService</td>
<td>BOOKING#&lt;id&gt;</td>
<td>SERVICE#&lt;bsId&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>Invoice</td>
<td>BOOKING#&lt;id&gt;</td>
<td>INVOICE#&lt;id&gt;</td>
<td></td>
<td></td>
<td><p>INVMONTH#&lt;yyyy-mm&gt;</p>
<p>&lt;ts&gt;#&lt;id&gt;</p></td>
</tr>
<tr class="even">
<td>Service</td>
<td>HOTEL#MAIN</td>
<td>SERVICE#&lt;id&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>Rate</td>
<td>HOTEL#MAIN</td>
<td>RATE#&lt;type&gt;#&lt;start&gt;</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="even">
<td>Voucher</td>
<td>VOUCHER#&lt;code&gt;</td>
<td>METADATA</td>
<td></td>
<td></td>
<td></td>
</tr>
<tr class="odd">
<td>Review</td>
<td>HOTEL#MAIN</td>
<td>REVIEW#&lt;date&gt;#&lt;id&gt;</td>
<td></td>
<td><p>CUSTOMER#&lt;id&gt;</p>
<p>REVIEW#&lt;date&gt;#&lt;id&gt;</p></td>
<td></td>
</tr>
<tr class="even">
<td>HousekeepingTask</td>
<td>TASK#&lt;id&gt;</td>
<td>METADATA</td>
<td><p>ROOM#&lt;id&gt;</p>
<p>TASK#&lt;due&gt;#&lt;id&gt;</p></td>
<td><p>USER#&lt;staff&gt;</p>
<p>TASK#&lt;due&gt;#&lt;id&gt;</p></td>
<td><p>TASKSTATUS#&lt;st&gt;</p>
<p>&lt;due&gt;#&lt;id&gt;</p></td>
</tr>
</tbody>
</table>

> *Trong mỗi ô GSI, dòng trên là GSIxPK, dòng dưới là GSIxSK. Ô trống nghĩa là item đó không có trong index (sparse).*

5\. Access patterns

Bảng dưới là hợp đồng giữa người thiết kế DB và Backend. Mọi API đều phải map được về một dòng trong bảng này; nếu phát sinh nhu cầu mới thì bổ sung access pattern trước rồi mới sửa khóa.

| **\#** | **Nghiệp vụ**                                          | **Nơi truy vấn** | **Điều kiện khóa**                                                 |
|--------|--------------------------------------------------------|------------------|--------------------------------------------------------------------|
| 1      | Thông tin khách sạn                                    | Bảng             | GetItem PK=HOTEL#MAIN, SK=METADATA                                 |
| 2      | Danh sách loại phòng                                   | Bảng             | PK=HOTEL#MAIN, begins_with(SK, ROOMTYPE#)                          |
| 3      | Sơ đồ toàn bộ phòng (bảng trạng thái realtime)         | Bảng             | PK=HOTEL#MAIN, begins_with(SK, ROOM#)                              |
| 4      | Phòng theo trạng thái (và theo tầng)                   | GSI3             | GSI3PK=ROOMSTATUS#Cleaning \[, begins_with(GSI3SK, FLOOR#03)\]     |
| 5      | Phòng đã bị chiếm trong đêm X, theo loại phòng         | GSI1             | GSI1PK=NIGHT#2026-09-25 \[, begins_with(GSI1SK, ROOMTYPE#DLX)\]    |
| 6      | Lịch đêm của 1 phòng trong khoảng ngày                 | Bảng             | PK=ROOM#205, SK BETWEEN NIGHT#d1 AND NIGHT#d2                      |
| 7      | Đặt phòng không trùng lịch                             | Bảng             | TransactWrite: Put RoomNight với attribute_not_exists(PK)          |
| 8      | Toàn bộ hồ sơ 1 booking (payment, dịch vụ, hóa đơn...) | Bảng             | PK=BOOKING#BK001954                                                |
| 9      | Chỉ các lượt thanh toán của booking                    | Bảng             | PK=BOOKING#..., begins_with(SK, PAYMENT#)                          |
| 10     | Lịch sử đặt phòng của khách                            | GSI2             | GSI2PK=CUSTOMER#C0001, begins_with(GSI2SK, BOOKING#)               |
| 11     | Đăng nhập khách hàng / nhân viên                       | GSI2             | GSI2PK=EMAIL#\<email\>, GSI2SK=PROFILE                             |
| 12     | Kiểm tra email đã tồn tại khi đăng ký                  | Bảng             | GetItem PK=UNIQUE#EMAIL#\<email\>, SK=UNIQUE                       |
| 13     | Lịch booking của 1 phòng                               | GSI1             | GSI1PK=ROOM#101, begins_with(GSI1SK, CHECKIN#)                     |
| 14     | Khách sẽ đến hôm nay                                   | GSI3             | GSI3PK=BKSTATUS#Confirmed, begins_with(GSI3SK, CHECKIN#2026-09-24) |
| 15     | Khách đang lưu trú                                     | GSI3             | GSI3PK=BKSTATUS#CheckedIn                                          |
| 16     | Khách phải trả phòng hôm nay                           | GSI3             | GSI3PK=BKSTATUS#CheckedIn + filter CheckOutDate = hôm nay          |
| 17     | Đơn đang chờ thanh toán cọc                            | GSI3             | GSI3PK=BKSTATUS#Pending                                            |
| 18     | Nhân viên theo vai trò                                 | GSI3             | GSI3PK=ROLE#Housekeeping                                           |
| 19     | Công việc của 1 nhân viên dọn phòng                    | GSI2             | GSI2PK=USER#S05, begins_with(GSI2SK, TASK#)                        |
| 20     | Công việc dọn phòng đang chờ                           | GSI3             | GSI3PK=TASKSTATUS#Todo                                             |
| 21     | Lịch sử dọn / bảo trì của 1 phòng                      | GSI1             | GSI1PK=ROOM#101, begins_with(GSI1SK, TASK#)                        |
| 22     | Nhật ký đổi trạng thái của 1 phòng                     | Bảng             | PK=ROOM#101, begins_with(SK, LOG#)                                 |
| 23     | Doanh thu theo tháng                                   | GSI3             | GSI3PK=INVMONTH#2026-09                                            |
| 24     | Sổ thu chi trong ngày                                  | GSI3             | GSI3PK=PAYDATE#2026-09-24                                          |
| 25     | Bảng giá theo mùa của 1 loại phòng                     | Bảng             | PK=HOTEL#MAIN, begins_with(SK, RATE#DLX#)                          |
| 26     | Danh mục dịch vụ                                       | Bảng             | PK=HOTEL#MAIN, begins_with(SK, SERVICE#)                           |
| 27     | Kiểm tra voucher                                       | Bảng             | GetItem PK=VOUCHER#SUMMER10, SK=METADATA                           |
| 28     | Đánh giá mới nhất                                      | Bảng             | PK=HOTEL#MAIN, begins_with(SK, REVIEW#), ScanIndexForward=false    |
| 29     | Đánh giá của 1 khách                                   | GSI2             | GSI2PK=CUSTOMER#C0001, begins_with(GSI2SK, REVIEW#)                |

6\. Chi tiết field từng entity

Field chung có trên mọi item: PK, SK, EntityType (tên entity, dùng để Backend phân loại item khi Query trả về nhiều loại), CreatedAt, UpdatedAt (ISO 8601 UTC). Các entity có thể bị nhiều người sửa cùng lúc (Room, Booking) có thêm Version (Number) để khóa lạc quan. Các bảng dưới chỉ liệt kê field riêng.

6.1. Hotel

| **Field**                 | **Kiểu**       | **Mô tả**                                                                                                      |
|---------------------------|----------------|----------------------------------------------------------------------------------------------------------------|
| HotelID                   | String         | Mã khách sạn, cố định "MAIN" (chừa sẵn để mở rộng chi nhánh)                                                   |
| HotelName, Address, City  | String         | Tên, địa chỉ, thành phố                                                                                        |
| Phone, Email              | String         | Liên hệ                                                                                                        |
| StarRating                | Number         | Hạng sao 1-5                                                                                                   |
| Location                  | Map            | {Lat, Lng} — tọa độ để hiển thị bản đồ                                                                         |
| CheckInTime, CheckOutTime | String         | Giờ nhận phòng 14:00, trả phòng 12:00                                                                          |
| Currency                  | String         | VND                                                                                                            |
| Policies                  | Map            | DepositPercent (20), FreeCancelBeforeHours (48), ChildFreeHeightCm (100), PendingHoldMinutes (15), VATIncluded |
| Amenities                 | List\<String\> | Tiện ích chung: hồ bơi, gym, spa...                                                                            |
| TotalRooms                | Number         | Tổng số phòng                                                                                                  |
| RatingAvg, ReviewCount    | Number         | Điểm đánh giá trung bình và số lượt, tính sẵn để trang chủ không phải đọc hết Review                           |

6.2. RoomType

| **Field**                    | **Kiểu**       | **Mô tả**                                                        |
|------------------------------|----------------|------------------------------------------------------------------|
| RoomTypeID                   | String         | STD / DBL / DLX / LUX                                            |
| Name                         | String         | Phòng Tiêu chuẩn / Phòng Đôi / Phòng Deluxe / Phòng Luxury Suite |
| BasePrice                    | Number         | Giá gốc 1 đêm (VND)                                              |
| Capacity                     | Number         | Số khách tiêu chuẩn (người lớn + trẻ trên 1m)                    |
| MaxExtraBed                  | Number         | Số giường phụ tối đa được thêm                                   |
| BedType, AreaM2, Description | String/Number  | Mô tả loại phòng                                                 |
| Images                       | List\<String\> | Đường dẫn ảnh (thư mục public/images/rooms của web)              |

6.3. Room

| **Field**                | **Kiểu**       | **Mô tả**                                                                                     |
|--------------------------|----------------|-----------------------------------------------------------------------------------------------|
| RoomID, RoomNumber       | String         | Số phòng, ví dụ "205"                                                                         |
| Floor                    | Number         | Tầng                                                                                          |
| RoomTypeID, RoomTypeName | String         | Loại phòng (sao chép tên để hiển thị nhanh)                                                   |
| Capacity, BasePrice      | Number         | Sao chép từ RoomType. Khi sửa RoomType phải cập nhật lại các Room                             |
| BedType, View, AreaM2    | String/Number  | Thông tin hiển thị                                                                            |
| Amenities, Images        | List\<String\> | Tiện nghi trong phòng, ảnh                                                                    |
| Status                   | String         | Trạng thái vật lý hiện tại: Available / Occupied / Cleaning / Maintenance / OutOfOrder        |
| CurrentBookingID         | String         | Booking đang ở trong phòng (chỉ có khi Occupied)                                              |
| LastCleanedAt            | String         | Lần dọn gần nhất                                                                              |
| MaintenanceNote          | String         | Lý do bảo trì (chỉ có khi Maintenance)                                                        |
| GSI3PK / GSI3SK          | String         | ROOMSTATUS#\<Status\> / FLOOR#\<ff\>#ROOM#\<id\>. Bắt buộc cập nhật GSI3PK mỗi lần đổi Status |

> *Room.Status chỉ phản ánh tình trạng vật lý ngay lúc này. Phòng trống hay không theo một khoảng ngày được tính từ RoomNight (mục 6.4), không dựa vào Status.*

6.4. RoomNight (khóa từng đêm của phòng)

| **Field**          | **Kiểu** | **Mô tả**                                                                 |
|--------------------|----------|---------------------------------------------------------------------------|
| RoomID, RoomTypeID | String   | Phòng và loại phòng                                                       |
| Date               | String   | Đêm được giữ (YYYY-MM-DD, đêm của ngày check-in đến trước ngày check-out) |
| BookingID          | String   | Booking đang chiếm đêm này                                                |
| Price              | Number   | Giá đêm đó (đã áp bảng giá mùa)                                           |
| Status             | String   | Held (đang giữ chờ cọc) / Booked (đã xác nhận)                            |
| ExpiresAt          | Number   | Chỉ có khi Held. Epoch giây, TTL tự xóa sau 15 phút                       |
| GSI1PK / GSI1SK    | String   | NIGHT#\<Date\> / ROOMTYPE#\<type\>#ROOM#\<id\>                            |

Mỗi đêm của mỗi phòng chỉ có tối đa một item (PK = ROOM#205, SK = NIGHT#2026-09-25). Khi đặt phòng, Backend ghi các item này với điều kiện attribute_not_exists(PK). Nếu một đêm đã có người giữ thì giao dịch thất bại, nên **không thể có 2 booking trùng lịch** kể cả khi hai người bấm đặt cùng một giây.

6.5. RoomStatusLog

| **Field**            | **Kiểu** | **Mô tả**                                                      |
|----------------------|----------|----------------------------------------------------------------|
| LogID                | String   | L000001                                                        |
| RoomID               | String   | Phòng                                                          |
| FromStatus, ToStatus | String   | Trạng thái trước và sau                                        |
| ChangedByStaffID     | String   | Nhân viên thực hiện                                            |
| Reason               | String   | Check-in BK..., Check-out BK..., Dọn phòng xong, lý do bảo trì |
| ChangedAt            | String   | Thời điểm đổi                                                  |

6.6. Customer

| **Field**                     | **Kiểu** | **Mô tả**                                                                 |
|-------------------------------|----------|---------------------------------------------------------------------------|
| CustomerID                    | String   | C0001                                                                     |
| FullName, Gender, DateOfBirth | String   | Họ tên, Nam/Nữ, ngày sinh                                                 |
| Nationality                   | String   | Quốc tịch                                                                 |
| IDType, IDNumber              | String   | CCCD (12 số) hoặc Passport                                                |
| Phone, Email, Address         | String   | Liên hệ. Email luôn viết thường. Khách tạo tại quầy có thể không có Email |
| PasswordHash                  | String   | bcrypt. Chỉ có với tài khoản đăng ký online                               |
| IsGuestAccount                | Boolean  | true: hồ sơ do lễ tân tạo tại quầy, chưa có mật khẩu                      |
| TotalBookings, TotalSpent     | Number   | Số lượt đặt, tổng chi tiêu (tính từ hóa đơn)                              |
| LoyaltyTier                   | String   | Member / Silver (≥ 5 triệu) / Gold (≥ 15 triệu)                           |
| LastStayAt                    | String   | Ngày trả phòng gần nhất                                                   |
| GSI2PK / GSI2SK               | String   | EMAIL#\<email\> / PROFILE (chỉ khi có Email)                              |

6.7. Staff

| **Field**                           | **Kiểu** | **Mô tả**                                             |
|-------------------------------------|----------|-------------------------------------------------------|
| StaffID                             | String   | S01                                                   |
| FullName, Email, Phone              | String   | Thông tin nhân viên                                   |
| Role                                | String   | Admin / Manager / Receptionist / Housekeeping         |
| Shift                               | String   | Morning / Afternoon / Night / Office                  |
| PasswordHash                        | String   | bcrypt                                                |
| IsActive                            | Boolean  | false thì không đăng nhập được                        |
| HiredAt, LastLoginAt, DeactivatedAt | String   | Ngày vào làm, lần đăng nhập cuối, ngày khóa tài khoản |
| GSI2PK / GSI2SK                     | String   | EMAIL#\<email\> / PROFILE                             |
| GSI3PK / GSI3SK                     | String   | ROLE#\<Role\> / USER#\<id\>                           |

6.8. UniqueEmail

| **Field** | **Kiểu** | **Mô tả**          |
|-----------|----------|--------------------|
| Email     | String   | Email đã được dùng |
| OwnerType | String   | Customer / Staff   |
| OwnerID   | String   | Mã chủ sở hữu      |

GSI không đảm bảo tính duy nhất, nên khi đăng ký Backend ghi đồng thời Customer và UniqueEmail trong một transaction, với điều kiện attribute_not_exists(PK) trên UniqueEmail. Email trùng thì giao dịch thất bại.

6.9. Booking (entity trung tâm)

| **Field**                               | **Kiểu**       | **Mô tả**                                                                        |
|-----------------------------------------|----------------|----------------------------------------------------------------------------------|
| BookingID                               | String         | BK000001                                                                         |
| CustomerID, CustomerName, CustomerPhone | String         | Khách đặt (tên, SĐT sao chép để hiển thị)                                        |
| RoomID, RoomTypeID, RoomTypeName        | String         | Phòng được đặt                                                                   |
| BookingChannel                          | String         | Online / Offline-FrontDesk                                                       |
| ProcessedByStaffID                      | String \| null | Lễ tân tạo đơn; null nếu khách tự đặt online                                     |
| CheckInDate, CheckOutDate               | String         | YYYY-MM-DD                                                                       |
| Nights                                  | Number         | Số đêm                                                                           |
| NumAdults                               | Number         | Số người lớn                                                                     |
| NumChildrenOver1m                       | Number         | Trẻ trên 1m, tính như người lớn                                                  |
| NumChildrenUnder1m                      | Number         | Trẻ dưới 1m, miễn phí, không tính vào sức chứa                                   |
| NightlyRates                            | List\<Map\>    | \[{Date, Price}\] giá từng đêm tại thời điểm đặt                                 |
| SubTotal                                | Number         | Tổng tiền phòng trước giảm giá = tổng NightlyRates                               |
| VoucherCode, DiscountAmount             | String, Number | Mã giảm giá (nếu có) và số tiền giảm. Không có voucher thì DiscountAmount = 0    |
| TotalPrice                              | Number         | SubTotal − DiscountAmount                                                        |
| DepositPercent                          | Number         | 20                                                                               |
| DepositAmount                           | Number         | TotalPrice × 20%, làm tròn nghìn                                                 |
| RemainingAmount                         | Number         | TotalPrice − DepositAmount                                                       |
| ServiceTotal, SurchargeTotal            | Number         | Tổng dịch vụ và phụ phí phát sinh                                                |
| PaidAmount                              | Number         | Tổng đã thu (trừ tiền đã hoàn)                                                   |
| BalanceDue                              | Number         | Số tiền còn phải thu                                                             |
| Status                                  | String         | Pending / Confirmed / CheckedIn / CheckedOut / Cancelled / NoShow                |
| Notes                                   | String         | Ghi chú của khách                                                                |
| ActualCheckInAt, CheckedInByStaffID     | String         | Thời điểm và người làm check-in                                                  |
| ActualCheckOutAt, CheckedOutByStaffID   | String         | Thời điểm và người làm check-out                                                 |
| CancelledAt, CancelReason, CancelledBy  | String         | Thông tin hủy (CancelledBy = Customer hoặc mã lễ tân)                            |
| RefundAmount                            | Number         | Số tiền cọc được hoàn (0 nếu mất cọc)                                            |
| NoShowMarkedAt                          | String         | Thời điểm đánh dấu khách không đến                                               |
| InvoiceID                               | String         | Hóa đơn sau check-out                                                            |
| ExpiresAt                               | Number         | Chỉ có khi Pending, TTL 15 phút                                                  |
| GSI1 / GSI2 / GSI3                      | String         | ROOM#.. / CHECKIN#..; CUSTOMER#.. / BOOKING#..; BKSTATUS#\<Status\> / CHECKIN#.. |

6.10. Payment

| **Field**            | **Kiểu**       | **Mô tả**                                                                |
|----------------------|----------------|--------------------------------------------------------------------------|
| PaymentID, BookingID | String         | P000001                                                                  |
| PaymentType          | String         | Deposit (cọc) / Remaining (thanh toán lúc trả phòng) / Refund (hoàn cọc) |
| Amount               | Number         | Số tiền                                                                  |
| PaymentMethod        | String         | Cash / Transfer / Card / EWallet                                         |
| PaymentStatus        | String         | Paid / Refunded                                                          |
| PaidAt               | String         | Thời điểm thanh toán                                                     |
| TransactionRef       | String         | Mã giao dịch (không có nếu tiền mặt)                                     |
| ReceivedByStaffID    | String \| null | Lễ tân thu tiền; null nếu thanh toán online                              |
| GSI3PK / GSI3SK      | String         | PAYDATE#\<ngày\> / \<PaidAt\>#\<id\>                                     |

6.11. Surcharge

| **Field**                     | **Kiểu** | **Mô tả**                   |
|-------------------------------|----------|-----------------------------|
| SurchargeID, BookingID        | String   | SC00001                     |
| Type                          | String   | Damage / LostItem / Smoking |
| Amount                        | Number   | Số tiền                     |
| Description                   | String   | Mô tả sự việc               |
| RecordedByStaffID, RecordedAt | String   | Người và thời điểm ghi nhận |

6.12. Service và BookingService

| **Field**                                   | **Kiểu** | **Mô tả**                                        |
|---------------------------------------------|----------|--------------------------------------------------|
| Service.ServiceID                           | String   | SV01                                             |
| Service.Name, Category, Unit                | String   | Tên, nhóm, đơn vị tính (người/ngày, lượt, kg...) |
| Service.Price                               | Number   | Đơn giá                                          |
| Service.IsActive                            | Boolean  | Còn cung cấp hay không                           |
| BookingService.BookingServiceID             | String   | BS000001                                         |
| BookingService.ServiceID, ServiceName, Unit | String   | Dịch vụ (sao chép tên)                           |
| BookingService.Quantity, UnitPrice, Amount  | Number   | Số lượng, đơn giá lúc dùng, thành tiền           |
| BookingService.Status                       | String   | Ordered (đặt trước) / Used (đã dùng)             |
| BookingService.UsedAt, AddedByStaffID       | String   | Thời điểm dùng, người thêm                       |

6.13. Invoice

| **Field**                                                 | **Kiểu**        | **Mô tả**                                                                              |
|-----------------------------------------------------------|-----------------|----------------------------------------------------------------------------------------|
| InvoiceID, InvoiceNo                                      | String          | INV000001, số hóa đơn HD2026-000001                                                    |
| BookingID, CustomerID, CustomerName, RoomID               | String          | Tham chiếu                                                                             |
| Items                                                     | List\<Map\>     | \[{Kind (Room/Discount/Service/Surcharge), Description, Quantity, UnitPrice, Amount}\] |
| RoomCharge, DiscountApplied, ServiceTotal, SurchargeTotal | Number          | Các khoản                                                                              |
| TotalAmount                                               | Number          | RoomCharge − DiscountApplied + ServiceTotal + SurchargeTotal                           |
| DepositPaid, RemainingPaid                                | Number          | Đã cọc, thu thêm lúc trả phòng                                                         |
| VATIncluded, PaymentStatus                                | Boolean, String | Giá đã gồm VAT, Paid                                                                   |
| IssuedAt, IssuedByStaffID                                 | String          | Thời điểm và người xuất                                                                |
| GSI3PK / GSI3SK                                           | String          | INVMONTH#\<yyyy-mm\> / \<IssuedAt\>#\<id\>                                             |

6.14. Rate (bảng giá theo mùa)

| **Field**          | **Kiểu** | **Mô tả**                                                   |
|--------------------|----------|-------------------------------------------------------------|
| RateID, Name       | String   | Mã và tên mùa giá (Lễ 30/4, Mùa hè, Quốc khánh, Giáng sinh) |
| RoomTypeID         | String   | Áp dụng cho loại phòng                                      |
| StartDate, EndDate | String   | Khoảng áp dụng (tính cả 2 đầu)                              |
| Multiplier         | Number   | Hệ số nhân với BasePrice                                    |
| PricePerNight      | Number   | Giá sau khi nhân, lưu sẵn để hiển thị                       |
| Priority           | Number   | Khi nhiều mùa chồng nhau, lấy Priority cao nhất             |

6.15. Voucher

| **Field**                | **Kiểu** | **Mô tả**                               |
|--------------------------|----------|-----------------------------------------|
| VoucherCode, Description | String   | Mã và mô tả                             |
| DiscountType             | String   | Percent / Fixed                         |
| Value                    | Number   | % hoặc số tiền                          |
| MaxDiscount              | Number   | Giảm tối đa                             |
| MinOrder, MinNights      | Number   | Điều kiện tổng tiền và số đêm tối thiểu |
| StartDate, EndDate       | String   | Thời hạn (tính theo ngày tạo đơn)       |
| UsageLimit, UsedCount    | Number   | Giới hạn và số lượt đã dùng             |
| IsActive                 | Boolean  | Còn hiệu lực                            |

6.16. Review

| **Field**                                     | **Kiểu** | **Mô tả**                                                   |
|-----------------------------------------------|----------|-------------------------------------------------------------|
| ReviewID, BookingID, CustomerID, CustomerName | String   | R00001 và tham chiếu                                        |
| RoomTypeID                                    | String   | Loại phòng đã ở                                             |
| Rating                                        | Number   | 1-5 sao                                                     |
| Scores                                        | Map      | {Cleanliness, Service, Location, Value} điểm thành phần 1-5 |
| Comment                                       | String   | Nội dung                                                    |
| IsVisible                                     | Boolean  | Admin có thể ẩn đánh giá                                    |
| GSI2PK / GSI2SK                               | String   | CUSTOMER#\<id\> / REVIEW#\<date\>#\<id\>                    |

6.17. HousekeepingTask

| **Field**                | **Kiểu** | **Mô tả**                                                                           |
|--------------------------|----------|-------------------------------------------------------------------------------------|
| TaskID                   | String   | T000001                                                                             |
| RoomID, BookingID        | String   | Phòng cần xử lý, booking vừa trả phòng (nếu có)                                     |
| Type                     | String   | Cleaning / Maintenance                                                              |
| Priority                 | String   | Normal / High                                                                       |
| Status                   | String   | Todo / InProgress / Done                                                            |
| AssignedTo, AssignedBy   | String   | Người được giao, người giao                                                         |
| DueAt, StartedAt, DoneAt | String   | Hạn, bắt đầu, hoàn thành                                                            |
| Note                     | String   | Ghi chú                                                                             |
| GSI1 / GSI2 / GSI3       | String   | ROOM#.. / TASK#..; USER#\<staff\> / TASK#..; TASKSTATUS#\<Status\> / \<due\>#\<id\> |

7\. Quy tắc nghiệp vụ

7.1. Tính giá phòng

1.  Giá mỗi đêm = BasePrice của loại phòng × Multiplier của Rate có StartDate ≤ đêm ≤ EndDate và Priority cao nhất; không có Rate thì hệ số = 1. Làm tròn đến nghìn đồng.

2.  SubTotal = tổng giá các đêm (lưu chi tiết trong NightlyRates).

3.  Voucher hợp lệ khi: IsActive, ngày tạo đơn nằm trong StartDate–EndDate, SubTotal ≥ MinOrder, Nights ≥ MinNights, UsedCount \< UsageLimit.

4.  DiscountAmount: Percent → min(SubTotal × Value%, MaxDiscount), làm tròn nghìn; Fixed → Value.

5.  TotalPrice = SubTotal − DiscountAmount; DepositAmount = TotalPrice × 20% (làm tròn nghìn); RemainingAmount = TotalPrice − DepositAmount.

6.  Lúc trả phòng khách thanh toán RemainingAmount + ServiceTotal + SurchargeTotal.

Ví dụ BK001960: phòng 205 (Deluxe) 2 đêm × 1.500.000đ = 3.000.000đ; voucher SUMMER10 giảm 10% = 300.000đ; TotalPrice 2.700.000đ; cọc 540.000đ; còn lại 2.160.000đ. Bản 1.0 tính cọc trên 3.000.000đ là sai.

7.2. Số khách và sức chứa

- NumAdults + NumChildrenOver1m ≤ Capacity. Nếu có dịch vụ giường phụ (SV05) và loại phòng có MaxExtraBed ≥ 1 thì được thêm 1 người.

- Trẻ dưới 1m miễn phí, không tính vào sức chứa.

7.3. Trạng thái Booking

| **Từ**    | **Sang**   | **Khi nào**                                 | **Việc cần ghi**                                                         |
|-----------|------------|---------------------------------------------|--------------------------------------------------------------------------|
| (mới)     | Pending    | Khách online bấm đặt                        | Booking + RoomNight Held, cả hai có ExpiresAt = now + 15 phút            |
| Pending   | Confirmed  | Thanh toán cọc thành công                   | Payment Deposit, bỏ ExpiresAt, RoomNight → Booked                        |
| Pending   | (bị xóa)   | Quá 15 phút chưa cọc                        | TTL tự xóa Booking và RoomNight Held                                     |
| (mới)     | Confirmed  | Lễ tân đặt tại quầy và thu cọc ngay         | Booking + RoomNight Booked + Payment Deposit trong 1 transaction         |
| Confirmed | CheckedIn  | Khách nhận phòng                            | Room → Occupied, CurrentBookingID, RoomStatusLog                         |
| CheckedIn | CheckedOut | Khách trả phòng                             | Surcharge, Payment Remaining, Invoice, Room → Cleaning, HousekeepingTask |
| Confirmed | Cancelled  | Khách hoặc lễ tân hủy                       | Xóa RoomNight, UsedCount voucher − 1, Payment Refund nếu đủ điều kiện    |
| Confirmed | NoShow     | 12:00 ngày sau ngày check-in khách chưa đến | Mất cọc, xóa RoomNight các đêm chưa tới để mở bán lại                    |

> *Bản 1.0 có cả Deposited và Confirmed nhưng trùng nghĩa. Bản 2.0 bỏ Deposited: đã cọc là Confirmed. Mỗi lần đổi Status phải đổi luôn GSI3PK = BKSTATUS#\<Status\> và tăng Version.*

7.4. Trạng thái phòng

| **Từ**                | **Sang**    | **Sự kiện**                                        |
|-----------------------|-------------|----------------------------------------------------|
| Available             | Occupied    | Check-in                                           |
| Occupied              | Cleaning    | Check-out, đồng thời tạo HousekeepingTask Cleaning |
| Cleaning              | Available   | Nhân viên dọn phòng bấm hoàn thành task            |
| Bất kỳ (trừ Occupied) | Maintenance | Quản lý báo hỏng, tạo task Maintenance             |
| Maintenance           | Available   | Hoàn thành bảo trì                                 |
| Bất kỳ                | OutOfOrder  | Ngừng khai thác dài hạn                            |

7.5. Hủy phòng và hoàn cọc

- Hủy trước 14:00 ngày check-in ít nhất 48 giờ: hoàn 100% tiền cọc bằng chuyển khoản (Payment Refund).

- Hủy muộn hơn: mất cọc, RefundAmount = 0.

- Đơn đã hủy trả lại các đêm (xóa RoomNight) và trả lại lượt voucher.

7.6. Quy tắc khác

- Hạng thành viên: TotalSpent ≥ 5.000.000đ là Silver, ≥ 15.000.000đ là Gold.

- Tiền lưu dạng số nguyên VND, không có phần thập phân.

- TTL của DynamoDB có thể xóa trễ (thường vài phút, tối đa khoảng 48 giờ). Vì vậy Backend luôn tự kiểm tra ExpiresAt \< now và coi đơn/đêm đó như đã hết hạn, không chờ TTL.

8\. Quy trình nghiệp vụ và thao tác DynamoDB

8.1. Khách đặt tại quầy (Offline)

1.  Lễ tân chọn ngày và loại phòng; hệ thống tính phòng trống bằng access pattern 3 + 5.

2.  Tra khách theo email (GSI2) hoặc tạo mới Customer từ CCCD với IsGuestAccount = true.

3.  Tính giá (mục 7.1), kiểm tra sức chứa (mục 7.2).

4.  Một TransactWriteItems: Put Booking (Status = Confirmed, BookingChannel = Offline-FrontDesk, ProcessedByStaffID = mã lễ tân), Put RoomNight Booked cho từng đêm có điều kiện, Put Payment Deposit, Update Voucher (nếu có).

5.  Nếu transaction báo ConditionalCheckFailed: phòng vừa bị người khác đặt, yêu cầu chọn phòng khác.

8.2. Khách đăng nhập đặt online

1.  Đăng nhập qua GSI2 (EMAIL#...), so sánh bcrypt.

2.  Tìm phòng trống theo ngày, chọn phòng, nhập voucher, ghi chú.

3.  Transaction: Put Booking Pending + RoomNight Held (ExpiresAt = now + 15 phút) + Update Voucher UsedCount với điều kiện UsedCount \< UsageLimit.

4.  Thanh toán cọc 20% (VNPay/MoMo/chuyển khoản). Callback thành công → transaction: Put Payment Deposit, Update Booking → Confirmed (điều kiện Status = Pending), Update RoomNight → Booked, REMOVE ExpiresAt.

5.  Quá 15 phút không thanh toán: TTL xóa đơn, các đêm được mở bán lại.

8.3. Check-in

1.  Lễ tân mở danh sách khách đến hôm nay (access pattern 14), đối chiếu CCCD.

2.  Transaction: Update Booking → CheckedIn (ActualCheckInAt, CheckedInByStaffID), Update Room → Occupied (CurrentBookingID, GSI3PK), Put RoomStatusLog.

8.4. Dịch vụ trong thời gian lưu trú

Lễ tân thêm BookingService (PK = BOOKING#...), đồng thời ADD ServiceTotal :amount trên Booking trong cùng transaction.

8.5. Check-out (chung cho mọi booking)

1.  Nhân viên kiểm tra phòng, ghi Surcharge nếu có.

2.  Tính số tiền còn phải thu = RemainingAmount + ServiceTotal + SurchargeTotal.

3.  Transaction: Put Payment Remaining, Put Invoice, Update Booking → CheckedOut (PaidAmount, BalanceDue = 0, InvoiceID), Update Room → Cleaning (xóa CurrentBookingID), Put HousekeepingTask, Put RoomStatusLog.

4.  Cập nhật Customer: ADD TotalBookings, TotalSpent; tính lại LoyaltyTier.

8.6. Dọn phòng và bảo trì

Nhân viên dọn phòng xem task của mình (access pattern 19), bấm bắt đầu (InProgress) và hoàn thành (Done). Khi Done: Update Room → Available, LastCleanedAt, Put RoomStatusLog.

8.7. Trạng thái phòng theo thời gian thực

Có hai cách, nhóm chọn tùy môi trường demo:

- **Chạy trên AWS:** DynamoDB Streams → AWS Lambda → API Gateway WebSocket. Mỗi khi item Room hoặc Booking đổi, Lambda đẩy bản ghi mới tới trình duyệt.

- **Chạy local / đơn giản:** server Node.js dùng Socket.IO; mỗi API làm đổi trạng thái phòng (check-in, check-out, dọn xong) phát sự kiện room:updated ngay sau khi ghi DynamoDB thành công. Thêm một vòng đọc lại access pattern 3 mỗi 5 giây để đồng bộ khi có thay đổi từ Console.

Kịch bản demo nên có: mở 2 trình duyệt, cùng đặt phòng 205 đêm 25/09. Một bên thành công, bên kia nhận lỗi "phòng vừa được đặt" nhờ điều kiện trên RoomNight. Bảng sơ đồ phòng ở tab lễ tân đổi màu ngay khi check-in/check-out.

9\. Bộ dữ liệu mẫu

9.1. Tổng quan

File HotelBookingTable.json mô phỏng hoạt động của khách sạn từ 01/03/2026 đến 28/12/2026. Mốc "hiện tại" của dữ liệu là **24/09/2026 10:00 giờ Việt Nam**: các booking trước mốc này đã trả phòng, một số đang lưu trú, phần sau là đặt trước. Dữ liệu được sinh bằng script nhưng đã kiểm tra: không trùng lịch phòng, tiền cọc/còn lại/hóa đơn/thanh toán khớp nhau, không có thời điểm nào vượt quá mốc hiện tại.

| **Entity**    | **Số item** | **Entity**       | **Số item** |
|---------------|-------------|------------------|-------------|
| Hotel         | 1           | RoomType         | 4           |
| Room          | 36          | RoomNight        | 5.324       |
| RoomStatusLog | 580         | Customer         | 320         |
| Staff         | 12          | UniqueEmail      | 262         |
| Booking       | 2.316       | Payment          | 4.205       |
| Surcharge     | 102         | BookingService   | 2.212       |
| Invoice       | 1.783       | Service          | 10          |
| Rate          | 16          | Voucher          | 6           |
| Review        | 823         | HousekeepingTask | 123         |
| Tổng          | 18.135      |                  |             |

| **Chỉ số**                     | **Giá trị**                                                                                                    |
|--------------------------------|----------------------------------------------------------------------------------------------------------------|
| Booking theo trạng thái        | CheckedOut: 1783, Cancelled: 184, NoShow: 42, CheckedIn: 15, Confirmed: 289, Pending: 3                        |
| Booking theo kênh              | Online: 1419, Offline-FrontDesk: 897                                                                           |
| Phòng lúc 24/09 10:00          | Occupied: 15, Cleaning: 4, Available: 15, Maintenance: 2 (Cleaning: 102, 306, 307, 503; Maintenance: 304, 407) |
| Khách đến / đi ngày 24/09      | 6 đơn chờ check-in, 7 đơn có ngày trả phòng hôm nay                                                            |
| Khách hàng                     | 320 hồ sơ, 187 tài khoản online, 26 khách nước ngoài (Passport)                                                |
| Doanh thu hóa đơn tháng 9/2026 | 753.007.000đ                                                                                                   |
| Đánh giá                       | 823 lượt, trung bình 4.07 sao                                                                                  |

9.2. Tài khoản demo

Mọi tài khoản dùng mật khẩu **123456** (đã băm bcrypt \$2a\$10\$..., dùng được với thư viện bcryptjs hoặc bcrypt trên Node.js).

| **Mã** | **Họ tên**              | **Vai trò**          | **Email đăng nhập**                      |
|--------|-------------------------|----------------------|------------------------------------------|
| S01    | Trần Thị Lan            | Receptionist         | lan.tran@sunrisehotel.vn                 |
| S02    | Ngô Văn Hùng            | Receptionist         | hung.ngo@sunrisehotel.vn                 |
| S03    | Lê Thị Mai              | Receptionist         | mai.le@sunrisehotel.vn                   |
| S04    | Đỗ Quốc Bảo             | Receptionist         | bao.do@sunrisehotel.vn                   |
| S05    | Phạm Thị Hoa            | Housekeeping         | hoa.pham@sunrisehotel.vn                 |
| S06    | Huỳnh Văn Tài           | Housekeeping         | tai.huynh@sunrisehotel.vn                |
| S07    | Bùi Thị Nga             | Housekeeping         | nga.bui@sunrisehotel.vn                  |
| S08    | Võ Minh Tâm             | Housekeeping         | tam.vo@sunrisehotel.vn                   |
| S09    | Đặng Thị Kim            | Housekeeping         | kim.dang@sunrisehotel.vn                 |
| S10    | Võ Thị Thu Hà           | Manager              | ha.vo@sunrisehotel.vn                    |
| S11    | Phạm Hoàng Long         | Admin                | long.pham@sunrisehotel.vn                |
| S12    | Lý Thanh Tùng (đã khóa) | Receptionist         | tung.ly@sunrisehotel.vn                  |
| C0001  | Nguyễn Văn An           | Khách tạo tại quầy   | nguyenvanan@gmail.com (chưa có mật khẩu) |
| C0002  | Lê Thị Bích             | Khách đăng ký online | lethibich@gmail.com                      |

9.3. Các booking dùng làm kịch bản demo

| **Booking**              | **Kịch bản**                                                                                                                                                                                       |
|--------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| BK001954                 | Kịch bản A — khách C0001 đặt tại quầy, lễ tân S01; phòng 101, 20→22/09; cọc 240.000đ tiền mặt; làm vỡ ly phụ thu 150.000đ; trả phòng thanh toán 1.110.000đ; hóa đơn 1.350.000đ; có đánh giá 4 sao. |
| BK001960                 | Kịch bản B — khách C0002 đặt online, phòng 205 Deluxe, 25→27/09, voucher SUMMER10; đã cọc 540.000đ, đang Confirmed chờ check-in.                                                                   |
| BK002314                 | Đơn Pending đang giữ chỗ 15 phút (seed.js tự đặt lại ExpiresAt = lúc nạp + 15 phút để demo TTL).                                                                                                   |
| BK000023                 | Đơn hủy sớm hơn 48 giờ, đã được hoàn cọc (Payment Refund).                                                                                                                                         |
| Phòng 304, 407           | Đang bảo trì, có HousekeepingTask Maintenance InProgress.                                                                                                                                          |
| Phòng 102, 306, 307, 503 | Vừa trả phòng sáng 24/09, đang chờ dọn (task Todo / InProgress).                                                                                                                                   |

9.4. Định dạng file

Mỗi dòng của file là một item theo định dạng **DynamoDB JSON** (dạng mà tính năng Import from S3 yêu cầu), mỗi giá trị kèm kiểu: S chuỗi, N số (ghi dưới dạng chuỗi), BOOL, NULL, L danh sách, M map. Ví dụ dòng của voucher SUMMER10:

> {"Item": {"PK": {"S": "VOUCHER#SUMMER10"},
>
> "SK": {"S": "METADATA"},
>
> "EntityType": {"S": "Voucher"},
>
> "VoucherCode": {"S": "SUMMER10"},
>
> "Description": {"S": "Giảm 10% mùa hè, tối đa 500.000đ"},
>
> "DiscountType": {"S": "Percent"},
>
> "Value": {"N": "10"},
>
> "MaxDiscount": {"N": "500000"},
>
> "MinOrder": {"N": "1000000"},
>
> "MinNights": {"N": "1"},
>
> "StartDate": {"S": "2026-06-01"},
>
> "EndDate": {"S": "2026-09-30"},
>
> "UsageLimit": {"N": "200"},
>
> "UsedCount": {"N": "87"},
>
> "IsActive": {"BOOL": true},
>
> "CreatedAt": {"S": "2026-01-05T02:00:00Z"}}}

Khác với file restaurants.json mẫu của môn (định dạng Extended JSON của MongoDB với \$oid), DynamoDB không đọc được \$oid, nên phải dùng định dạng trên.

9.5. Item mẫu (viết dạng JSON thường cho dễ đọc)

Hotel

> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "METADATA",
>
> "EntityType": "Hotel",
>
> "HotelID": "MAIN",
>
> "HotelName": "Sunrise Hotel",
>
> "Address": "123 Nguyễn Huệ, Phường Sài Gòn",
>
> "City": "TP.HCM",
>
> "Phone": "028 3822 6868",
>
> "Email": "booking@sunrisehotel.vn",
>
> "StarRating": 4,
>
> "Location": {
>
> "Lat": 10.7736,
>
> "Lng": 106.704
>
> },
>
> "CheckInTime": "14:00",
>
> "CheckOutTime": "12:00",
>
> "Currency": "VND",
>
> "Policies": {
>
> "DepositPercent": 20,
>
> "FreeCancelBeforeHours": 48,
>
> "ChildFreeHeightCm": 100,
>
> "PendingHoldMinutes": 15,
>
> "VATIncluded": true
>
> },
>
> "Amenities": \[
>
> "Hồ bơi",
>
> "Phòng gym",
>
> "Spa",
>
> "Nhà hàng",
>
> "Quầy bar tầng thượng",
>
> "Wifi miễn phí",
>
> "Bãi đậu xe"
>
> \],
>
> "CreatedAt": "2026-01-01T00:00:00Z",
>
> "RatingAvg": 4.07,
>
> "ReviewCount": 823,
>
> "TotalRooms": 36,
>
> "UpdatedAt": "2026-09-24T03:00:00Z"
>
> }

RoomType

> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "ROOMTYPE#DLX",
>
> "EntityType": "RoomType",
>
> "RoomTypeID": "DLX",
>
> "Name": "Phòng Deluxe",
>
> "BasePrice": 1500000,
>
> "Capacity": 3,
>
> "BedType": "1 giường King",
>
> "AreaM2": 35,
>
> "MaxExtraBed": 1,
>
> "Description": "Không gian rộng, nội thất cao cấp, bồn tắm.",
>
> "Images": \[
>
> "images/rooms/dlx-1.jpg",
>
> "images/rooms/dlx-2.jpg"
>
> \],
>
> "CreatedAt": "2026-01-01T00:00:00Z"
>
> }

Room đang có khách

> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "ROOM#101",
>
> "EntityType": "Room",
>
> "GSI3PK": "ROOMSTATUS#Occupied",
>
> "GSI3SK": "FLOOR#01#ROOM#101",
>
> "RoomID": "101",
>
> "RoomNumber": "101",
>
> "Floor": 1,
>
> "RoomTypeID": "STD",
>
> "RoomTypeName": "Phòng Tiêu chuẩn",
>
> "BedType": "1 giường Queen",
>
> "View": "Đường Nguyễn Huệ",
>
> "AreaM2": 22,
>
> "Capacity": 2,
>
> "BasePrice": 600000,
>
> "Amenities": \[
>
> "Điều hòa",
>
> "TV",
>
> "Wifi",
>
> "Minibar"
>
> \],
>
> "Images": \[
>
> "images/rooms/std-1.jpg"
>
> \],
>
> "Status": "Occupied",
>
> "Version": 44,
>
> "CreatedAt": "2026-01-01T00:00:00Z",
>
> "UpdatedAt": "2026-09-23T18:59:00Z",
>
> "CurrentBookingID": "BK002181",
>
> "LastCleanedAt": "2026-09-19T02:56:00Z"
>
> }

RoomNight

> {
>
> "PK": "ROOM#205",
>
> "SK": "NIGHT#2026-09-25",
>
> "EntityType": "RoomNight",
>
> "GSI1PK": "NIGHT#2026-09-25",
>
> "GSI1SK": "ROOMTYPE#DLX#ROOM#205",
>
> "RoomID": "205",
>
> "RoomTypeID": "DLX",
>
> "Date": "2026-09-25",
>
> "BookingID": "BK001960",
>
> "Price": 1500000,
>
> "Status": "Booked",
>
> "CreatedAt": "2026-09-06T14:25:00Z"
>
> }

Customer (đăng ký online)

> {
>
> "PK": "CUSTOMER#C0002",
>
> "SK": "PROFILE",
>
> "EntityType": "Customer",
>
> "CustomerID": "C0002",
>
> "FullName": "Lê Thị Bích",
>
> "Gender": "Nữ",
>
> "DateOfBirth": "1989-03-16",
>
> "Nationality": "Việt Nam",
>
> "IDType": "CCCD",
>
> "IDNumber": "001189657270",
>
> "Phone": "0795345172",
>
> "Address": "Hà Nội",
>
> "IsGuestAccount": false,
>
> "Email": "lethibich@gmail.com",
>
> "TotalBookings": 6,
>
> "TotalSpent": 24595000,
>
> "LoyaltyTier": "Gold",
>
> "CreatedAt": "2026-02-02T23:24:00Z",
>
> "UpdatedAt": "2026-07-26T03:00:00Z",
>
> "LastStayAt": "2026-08-07",
>
> "PasswordHash": "\$2a\$10\$TtmvMxlGA75plR38WrmlYu7NYCjoQ297n6hfHBtJNFvlQmB6jWRm.",
>
> "GSI2PK": "EMAIL#lethibich@gmail.com",
>
> "GSI2SK": "PROFILE"
>
> }

Staff

> {
>
> "PK": "USER#S01",
>
> "SK": "PROFILE",
>
> "EntityType": "Staff",
>
> "GSI2PK": "EMAIL#lan.tran@sunrisehotel.vn",
>
> "GSI2SK": "PROFILE",
>
> "GSI3PK": "ROLE#Receptionist",
>
> "GSI3SK": "USER#S01",
>
> "StaffID": "S01",
>
> "FullName": "Trần Thị Lan",
>
> "Email": "lan.tran@sunrisehotel.vn",
>
> "Phone": "0908289064",
>
> "Role": "Receptionist",
>
> "Shift": "Morning",
>
> "PasswordHash": "\$2a\$10\$TtmvMxlGA75plR38WrmlYu7NYCjoQ297n6hfHBtJNFvlQmB6jWRm.",
>
> "IsActive": true,
>
> "HiredAt": "2025-06-01",
>
> "LastLoginAt": "2026-09-23T02:00:00Z",
>
> "CreatedAt": "2026-01-01T00:00:00Z",
>
> "UpdatedAt": "2026-09-21T03:00:00Z"
>
> }

Kịch bản A — Booking BK001954

> {
>
> "PK": "BOOKING#BK001954",
>
> "SK": "METADATA",
>
> "EntityType": "Booking",
>
> "GSI1PK": "ROOM#101",
>
> "GSI1SK": "CHECKIN#2026-09-20#BK001954",
>
> "GSI2PK": "CUSTOMER#C0001",
>
> "GSI2SK": "BOOKING#2026-09-20#BK001954",
>
> "GSI3PK": "BKSTATUS#CheckedOut",
>
> "GSI3SK": "CHECKIN#2026-09-20#BK001954",
>
> "BookingID": "BK001954",
>
> "CustomerID": "C0001",
>
> "CustomerName": "Nguyễn Văn An",
>
> "CustomerPhone": "0388908405",
>
> "RoomID": "101",
>
> "RoomTypeID": "STD",
>
> "RoomTypeName": "Phòng Tiêu chuẩn",
>
> "BookingChannel": "Offline-FrontDesk",
>
> "ProcessedByStaffID": "S01",
>
> "CheckInDate": "2026-09-20",
>
> "CheckOutDate": "2026-09-22",
>
> "Nights": 2,
>
> "NumAdults": 2,
>
> "NumChildrenOver1m": 0,
>
> "NumChildrenUnder1m": 1,
>
> "NightlyRates": \[
>
> {
>
> "Date": "2026-09-20",
>
> "Price": 600000
>
> },
>
> {
>
> "Date": "2026-09-21",
>
> "Price": 600000
>
> }
>
> \],
>
> "SubTotal": 1200000,
>
> "DiscountAmount": 0,
>
> "TotalPrice": 1200000,
>
> "DepositPercent": 20,
>
> "DepositAmount": 240000,
>
> "RemainingAmount": 960000,
>
> "ServiceTotal": 0,
>
> "SurchargeTotal": 150000,
>
> "PaidAmount": 1350000,
>
> "BalanceDue": 0,
>
> "Status": "CheckedOut",
>
> "CreatedAt": "2026-09-06T10:00:00Z",
>
> "UpdatedAt": "2026-09-22T03:50:00Z",
>
> "Version": 4,
>
> "ActualCheckInAt": "2026-09-20T07:20:00Z",
>
> "CheckedInByStaffID": "S04",
>
> "ActualCheckOutAt": "2026-09-22T03:50:00Z",
>
> "CheckedOutByStaffID": "S01",
>
> "InvoiceID": "INV001709"
>
> }

Kịch bản A — các item con (Payment, Surcharge, Invoice)

> {
>
> "PK": "BOOKING#BK001954",
>
> "SK": "PAYMENT#P003744",
>
> "EntityType": "Payment",
>
> "GSI3PK": "PAYDATE#2026-09-06",
>
> "GSI3SK": "2026-09-06T10:03:00Z#P003744",
>
> "PaymentID": "P003744",
>
> "BookingID": "BK001954",
>
> "PaymentType": "Deposit",
>
> "Amount": 240000,
>
> "PaymentMethod": "Card",
>
> "PaymentStatus": "Paid",
>
> "PaidAt": "2026-09-06T10:03:00Z",
>
> "ReceivedByStaffID": "S01",
>
> "CreatedAt": "2026-09-06T10:03:00Z",
>
> "TransactionRef": "CARD260906293668"
>
> }
>
> {
>
> "PK": "BOOKING#BK001954",
>
> "SK": "SURCHARGE#SC00095",
>
> "EntityType": "Surcharge",
>
> "SurchargeID": "SC00095",
>
> "BookingID": "BK001954",
>
> "Type": "Damage",
>
> "Amount": 150000,
>
> "Description": "Vỡ ly thủy tinh",
>
> "RecordedByStaffID": "S01",
>
> "RecordedAt": "2026-09-22T03:42:00Z",
>
> "CreatedAt": "2026-09-22T03:42:00Z"
>
> }
>
> {
>
> "PK": "BOOKING#BK001954",
>
> "SK": "PAYMENT#P003745",
>
> "EntityType": "Payment",
>
> "GSI3PK": "PAYDATE#2026-09-22",
>
> "GSI3SK": "2026-09-22T03:51:00Z#P003745",
>
> "PaymentID": "P003745",
>
> "BookingID": "BK001954",
>
> "PaymentType": "Remaining",
>
> "Amount": 1110000,
>
> "PaymentMethod": "Card",
>
> "PaymentStatus": "Paid",
>
> "PaidAt": "2026-09-22T03:51:00Z",
>
> "ReceivedByStaffID": "S01",
>
> "CreatedAt": "2026-09-22T03:51:00Z",
>
> "TransactionRef": "CARD260922801176"
>
> }
>
> {
>
> "PK": "BOOKING#BK001954",
>
> "SK": "INVOICE#INV001709",
>
> "EntityType": "Invoice",
>
> "GSI3PK": "INVMONTH#2026-09",
>
> "GSI3SK": "2026-09-22T03:52:00Z#INV001709",
>
> "InvoiceID": "INV001709",
>
> "InvoiceNo": "HD2026-001709",
>
> "BookingID": "BK001954",
>
> "CustomerID": "C0001",
>
> "CustomerName": "Nguyễn Văn An",
>
> "RoomID": "101",
>
> "Items": \[
>
> {
>
> "Kind": "Room",
>
> "Description": "Tiền phòng 101 (Phòng Tiêu chuẩn)",
>
> "Quantity": 2,
>
> "UnitPrice": 600000,
>
> "Amount": 1200000
>
> },
>
> {
>
> "Kind": "Surcharge",
>
> "Description": "Vỡ ly thủy tinh",
>
> "Quantity": 1,
>
> "UnitPrice": 150000,
>
> "Amount": 150000
>
> }
>
> \],
>
> "RoomCharge": 1200000,
>
> "DiscountApplied": 0,
>
> "ServiceTotal": 0,
>
> "SurchargeTotal": 150000,
>
> "TotalAmount": 1350000,
>
> "DepositPaid": 240000,
>
> "RemainingPaid": 1110000,
>
> "VATIncluded": true,
>
> "PaymentStatus": "Paid",
>
> "IssuedAt": "2026-09-22T03:52:00Z",
>
> "IssuedByStaffID": "S01",
>
> "CreatedAt": "2026-09-22T03:52:00Z"
>
> }

Kịch bản B — Booking BK001960

> {
>
> "PK": "BOOKING#BK001960",
>
> "SK": "METADATA",
>
> "EntityType": "Booking",
>
> "GSI1PK": "ROOM#205",
>
> "GSI1SK": "CHECKIN#2026-09-25#BK001960",
>
> "GSI2PK": "CUSTOMER#C0002",
>
> "GSI2SK": "BOOKING#2026-09-25#BK001960",
>
> "GSI3PK": "BKSTATUS#Confirmed",
>
> "GSI3SK": "CHECKIN#2026-09-25#BK001960",
>
> "BookingID": "BK001960",
>
> "CustomerID": "C0002",
>
> "CustomerName": "Lê Thị Bích",
>
> "CustomerPhone": "0795345172",
>
> "RoomID": "205",
>
> "RoomTypeID": "DLX",
>
> "RoomTypeName": "Phòng Deluxe",
>
> "BookingChannel": "Online",
>
> "ProcessedByStaffID": null,
>
> "CheckInDate": "2026-09-25",
>
> "CheckOutDate": "2026-09-27",
>
> "Nights": 2,
>
> "NumAdults": 2,
>
> "NumChildrenOver1m": 0,
>
> "NumChildrenUnder1m": 0,
>
> "NightlyRates": \[
>
> {
>
> "Date": "2026-09-25",
>
> "Price": 1500000
>
> },
>
> {
>
> "Date": "2026-09-26",
>
> "Price": 1500000
>
> }
>
> \],
>
> "SubTotal": 3000000,
>
> "DiscountAmount": 300000,
>
> "TotalPrice": 2700000,
>
> "DepositPercent": 20,
>
> "DepositAmount": 540000,
>
> "RemainingAmount": 2160000,
>
> "ServiceTotal": 0,
>
> "SurchargeTotal": 0,
>
> "PaidAmount": 540000,
>
> "BalanceDue": 2160000,
>
> "Status": "Confirmed",
>
> "CreatedAt": "2026-09-06T14:25:00Z",
>
> "UpdatedAt": "2026-09-06T14:26:00Z",
>
> "Version": 2,
>
> "VoucherCode": "SUMMER10",
>
> "Notes": "Cần phòng yên tĩnh, view thành phố nếu có thể"
>
> }

Rate, Voucher, Service

> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "RATE#DLX#2026-08-29",
>
> "EntityType": "Rate",
>
> "RateID": "QK0209-DLX",
>
> "Name": "Lễ Quốc khánh 2/9",
>
> "RoomTypeID": "DLX",
>
> "StartDate": "2026-08-29",
>
> "EndDate": "2026-09-02",
>
> "Multiplier": 1.3,
>
> "PricePerNight": 1950000,
>
> "Priority": 2,
>
> "CreatedAt": "2026-01-05T02:00:00Z"
>
> }
>
> {
>
> "PK": "VOUCHER#SUMMER10",
>
> "SK": "METADATA",
>
> "EntityType": "Voucher",
>
> "VoucherCode": "SUMMER10",
>
> "Description": "Giảm 10% mùa hè, tối đa 500.000đ",
>
> "DiscountType": "Percent",
>
> "Value": 10,
>
> "MaxDiscount": 500000,
>
> "MinOrder": 1000000,
>
> "MinNights": 1,
>
> "StartDate": "2026-06-01",
>
> "EndDate": "2026-09-30",
>
> "UsageLimit": 200,
>
> "UsedCount": 87,
>
> "IsActive": true,
>
> "CreatedAt": "2026-01-05T02:00:00Z"
>
> }
>
> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "SERVICE#SV01",
>
> "EntityType": "Service",
>
> "ServiceID": "SV01",
>
> "Name": "Ăn sáng buffet",
>
> "Category": "Ăn uống",
>
> "Price": 150000,
>
> "Unit": "người/ngày",
>
> "IsActive": true,
>
> "CreatedAt": "2026-01-05T02:00:00Z"
>
> }

BookingService

> {
>
> "PK": "BOOKING#BK000002",
>
> "SK": "SERVICE#BS000001",
>
> "EntityType": "BookingService",
>
> "BookingServiceID": "BS000001",
>
> "BookingID": "BK000002",
>
> "ServiceID": "SV07",
>
> "ServiceName": "Thuê xe máy",
>
> "Unit": "ngày",
>
> "Quantity": 2,
>
> "UnitPrice": 150000,
>
> "Amount": 300000,
>
> "Status": "Used",
>
> "UsedAt": "2026-03-05T23:24:58Z",
>
> "AddedByStaffID": "S04",
>
> "CreatedAt": "2026-03-05T23:24:58Z"
>
> }

Review

> {
>
> "PK": "HOTEL#MAIN",
>
> "SK": "REVIEW#2026-09-23#R00794",
>
> "EntityType": "Review",
>
> "GSI2PK": "CUSTOMER#C0001",
>
> "GSI2SK": "REVIEW#2026-09-23#R00794",
>
> "ReviewID": "R00794",
>
> "BookingID": "BK001954",
>
> "CustomerID": "C0001",
>
> "CustomerName": "Nguyễn Văn An",
>
> "RoomTypeID": "STD",
>
> "Rating": 4,
>
> "Scores": {
>
> "Cleanliness": 3,
>
> "Service": 4,
>
> "Location": 5,
>
> "Value": 4
>
> },
>
> "Comment": "Phòng ổn, lễ tân nhiệt tình, trừ vụ làm vỡ ly là lỗi của mình.",
>
> "IsVisible": true,
>
> "CreatedAt": "2026-09-22T18:50:00Z"
>
> }

HousekeepingTask

> {
>
> "PK": "TASK#T000039",
>
> "SK": "METADATA",
>
> "EntityType": "HousekeepingTask",
>
> "GSI1PK": "ROOM#307",
>
> "GSI1SK": "TASK#2026-09-24T03:38:00Z#T000039",
>
> "GSI2PK": "USER#S06",
>
> "GSI2SK": "TASK#2026-09-24T03:38:00Z#T000039",
>
> "GSI3PK": "TASKSTATUS#Todo",
>
> "GSI3SK": "2026-09-24T03:38:00Z#T000039",
>
> "TaskID": "T000039",
>
> "RoomID": "307",
>
> "BookingID": "BK001910",
>
> "Type": "Cleaning",
>
> "Priority": "High",
>
> "AssignedTo": "S06",
>
> "AssignedBy": "S04",
>
> "CreatedAt": "2026-09-24T01:38:00Z",
>
> "DueAt": "2026-09-24T03:38:00Z",
>
> "Note": "Dọn phòng sau check-out",
>
> "Status": "Todo",
>
> "UpdatedAt": "2026-09-24T01:38:00Z"
>
> }

RoomStatusLog

> {
>
> "PK": "ROOM#205",
>
> "SK": "LOG#2026-09-01T02:30:00Z#L000001",
>
> "EntityType": "RoomStatusLog",
>
> "LogID": "L000001",
>
> "RoomID": "205",
>
> "FromStatus": "Occupied",
>
> "ToStatus": "Cleaning",
>
> "ChangedByStaffID": "S04",
>
> "Reason": "Check-out BK001869",
>
> "ChangedAt": "2026-09-01T02:30:00Z",
>
> "CreatedAt": "2026-09-01T02:30:00Z"
>
> }

10\. Nạp dữ liệu vào DynamoDB

10.1. Cách 1 — Import from S3 trên Console (dùng cho báo cáo mục 6)

1.  Nén file (không bắt buộc): gzip HotelBookingTable.json. Upload lên một S3 bucket cùng region.

2.  DynamoDB Console → **Imports from S3** → **Import from S3**.

3.  Source S3 URL: chọn file; Import file format: **DynamoDB JSON**; Compression: GZIP hoặc None.

4.  Table name: HotelBookingTable; Partition key PK (String); Sort key SK (String).

5.  Table settings → Customize settings → Capacity mode **On-demand**. Thêm 3 GSI: GSI1 (GSI1PK, GSI1SK), GSI2 (GSI2PK, GSI2SK), GSI3 (GSI3PK, GSI3SK), đều String, projection All.

6.  Import. Khi xong, vào bảng → **Additional settings** → bật **Time to Live** với attribute ExpiresAt; tab **Exports and streams** → bật **DynamoDB stream** (New and old images); tab **Backups** → bật **Point-in-time recovery**.

> *Import from S3 luôn tạo bảng mới, không nạp vào bảng đã có. Muốn nạp lại thì xóa bảng cũ hoặc đặt tên khác.*

10.2. Cách 2 — Script Node.js seed.js (dùng khi code web)

> npm init -y
>
> npm i @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb bcryptjs
>
> \# AWS thật (đã cấu hình aws configure hoặc biến môi trường AWS_ACCESS_KEY_ID...)
>
> AWS_REGION=ap-southeast-1 node seed.js
>
> \# DynamoDB Local
>
> docker run -d -p 8000:8000 amazon/dynamodb-local
>
> DDB_ENDPOINT=http://localhost:8000 AWS_REGION=local node seed.js

Script tự tạo bảng (3 GSI, On-demand, Streams, TTL) nếu chưa có, rồi ghi dữ liệu theo lô 25 item, tự thử lại phần UnprocessedItems. Có thể dùng **NoSQL Workbench** kết nối localhost:8000 để xem dữ liệu khi chạy local.

11\. Import/Export, Backup và Restore trên Console

| **Chức năng**    | **Thao tác trên Console**                                                                                          | **Ghi chú khi báo cáo**                                                         |
|------------------|--------------------------------------------------------------------------------------------------------------------|---------------------------------------------------------------------------------|
| Import           | Imports from S3 (mục 10.1)                                                                                         | Chụp màn hình trạng thái Completed, số item đã nhập                             |
| Export           | Bảng → Exports and streams → Export to S3 → chọn bucket, Full export hoặc Incremental, định dạng DynamoDB JSON/ION | Yêu cầu đã bật PITR. File xuất nằm trong thư mục AWSDynamoDB/\<export-id\>/data |
| Xuất nhanh CSV   | Explore items → chạy Query/Scan → Actions → Download results to CSV                                                | Dùng cho báo cáo nhỏ                                                            |
| On-demand backup | Bảng → Backups → Create backup → đặt tên, ví dụ backup-2026-09-24                                                  | Sao lưu toàn bộ bảng kèm GSI                                                    |
| Restore          | Backups → chọn bản backup → Restore → đặt tên bảng mới HotelBookingTable-restored                                  | Restore luôn ra bảng mới                                                        |
| PITR             | Backups → Point-in-time recovery → Restore to point in time → chọn thời điểm                                       | Demo: xóa nhầm một booking rồi khôi phục bảng về thời điểm trước đó             |

12\. Truy vấn trên DynamoDB Console

12.1. Explore items

Vào **Explore items**, chọn bảng hoặc index, chế độ **Query** nhập PK và điều kiện SK (Begins with / Between...), có thể thêm Filter. Chế độ **Scan** đọc toàn bảng, dùng để minh họa chi phí khác biệt giữa Query và Scan.

12.2. PartiQL Editor — truy vấn cơ bản

> -- Danh sách phòng
>
> SELECT \* FROM "HotelBookingTable" WHERE PK = 'HOTEL#MAIN' AND begins_with(SK, 'ROOM#');
>
> -- Toàn bộ hồ sơ booking kịch bản A
>
> SELECT \* FROM "HotelBookingTable" WHERE PK = 'BOOKING#BK001954';
>
> -- Phòng đang trống
>
> SELECT RoomID, RoomTypeName, Floor FROM "HotelBookingTable"."GSI3" WHERE GSI3PK = 'ROOMSTATUS#Available';
>
> -- Thêm dịch vụ mới
>
> INSERT INTO "HotelBookingTable" VALUE {'PK':'HOTEL#MAIN','SK':'SERVICE#SV11','EntityType':'Service',
>
> 'ServiceID':'SV11','Name':'Thuê phòng họp','Category':'Khác','Price':800000,'Unit':'giờ','IsActive':true};
>
> -- Sửa giá dịch vụ
>
> UPDATE "HotelBookingTable" SET Price = 900000 WHERE PK = 'HOTEL#MAIN' AND SK = 'SERVICE#SV11';
>
> -- Xóa dịch vụ
>
> DELETE FROM "HotelBookingTable" WHERE PK = 'HOTEL#MAIN' AND SK = 'SERVICE#SV11';

12.3. PartiQL Editor — truy vấn nâng cao

> -- Phòng Deluxe đã bị chiếm đêm 25/09 (phần còn lại là phòng trống)
>
> SELECT RoomID, BookingID, Status FROM "HotelBookingTable"."GSI1"
>
> WHERE GSI1PK = 'NIGHT#2026-09-25' AND begins_with(GSI1SK, 'ROOMTYPE#DLX');
>
> -- Khách sẽ đến hôm nay
>
> SELECT BookingID, CustomerName, RoomID FROM "HotelBookingTable"."GSI3"
>
> WHERE GSI3PK = 'BKSTATUS#Confirmed' AND begins_with(GSI3SK, 'CHECKIN#2026-09-24');
>
> -- Khách phải trả phòng hôm nay
>
> SELECT BookingID, CustomerName, RoomID, BalanceDue FROM "HotelBookingTable"."GSI3"
>
> WHERE GSI3PK = 'BKSTATUS#CheckedIn' AND CheckOutDate = '2026-09-24';
>
> -- Hóa đơn tháng 9 trên 5 triệu
>
> SELECT InvoiceNo, CustomerName, TotalAmount FROM "HotelBookingTable"."GSI3"
>
> WHERE GSI3PK = 'INVMONTH#2026-09' AND TotalAmount \> 5000000;
>
> -- Lịch sử đặt phòng và đánh giá của khách C0001
>
> SELECT \* FROM "HotelBookingTable"."GSI2" WHERE GSI2PK = 'CUSTOMER#C0001';
>
> -- Nhật ký trạng thái phòng 101 trong tháng 9
>
> SELECT \* FROM "HotelBookingTable"
>
> WHERE PK = 'ROOM#101' AND SK BETWEEN 'LOG#2026-09-01' AND 'LOG#2026-09-30T23:59:59Z';
>
> -- Đánh giá từ 2 sao trở xuống, mới nhất trước
>
> SELECT CustomerName, Rating, Comment FROM "HotelBookingTable"
>
> WHERE PK = 'HOTEL#MAIN' AND begins_with(SK, 'REVIEW#') AND Rating \<= 2 ORDER BY SK DESC;
>
> -- Đơn đã trả phòng có dùng voucher SUMMER10
>
> SELECT BookingID, SubTotal, DiscountAmount FROM "HotelBookingTable"."GSI3"
>
> WHERE GSI3PK = 'BKSTATUS#CheckedOut' AND VoucherCode = 'SUMMER10';
>
> -- Khách hạng Gold (không có khóa =\> Scan, so sánh chi phí với Query)
>
> SELECT CustomerID, FullName, TotalSpent FROM "HotelBookingTable"
>
> WHERE EntityType = 'Customer' AND LoyaltyTier = 'Gold';
>
> -- Cập nhật có điều kiện (optimistic locking): chỉ ghi nếu Version chưa đổi
>
> UPDATE "HotelBookingTable" SET Status = 'Maintenance' SET GSI3PK = 'ROOMSTATUS#Maintenance'
>
> SET Version = Version + 1
>
> WHERE PK = 'HOTEL#MAIN' AND SK = 'ROOM#105' AND Status = 'Available';
>
> *PartiQL trên DynamoDB không có SUM/COUNT/GROUP BY. Các báo cáo tổng hợp (doanh thu, công suất phòng) lấy dữ liệu bằng Query theo GSI3/GSI1 rồi cộng trong Node.js.*

13\. Kết nối Node.js

13.1. Khởi tạo client

> // db.js
>
> const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
>
> const { DynamoDBDocumentClient } = require("@aws-sdk/lib-dynamodb");
>
> const endpoint = process.env.DDB_ENDPOINT;
>
> const client = new DynamoDBClient({
>
> region: process.env.AWS_REGION \|\| "ap-southeast-1",
>
> ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
>
> });
>
> const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
>
> module.exports = { ddb, TABLE: "HotelBookingTable" };

13.2. Đăng nhập

> const bcrypt = require("bcryptjs");
>
> const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
>
> async function login(email, password) {
>
> const { Items } = await ddb.send(new QueryCommand({
>
> TableName: TABLE, IndexName: "GSI2",
>
> KeyConditionExpression: "GSI2PK = :pk AND GSI2SK = :sk",
>
> ExpressionAttributeValues: { ":pk": "EMAIL#" + email.trim().toLowerCase(), ":sk": "PROFILE" },
>
> }));
>
> const u = Items\[0\];
>
> if (!u \|\| !u.PasswordHash) return null;
>
> if (u.EntityType === "Staff" && !u.IsActive) return null;
>
> return (await bcrypt.compare(password, u.PasswordHash)) ? u : null;
>
> }

13.3. Tìm phòng trống

> function nights(checkIn, checkOut) { // \["2026-09-25", "2026-09-26"\]
>
> const out = \[\], d = new Date(checkIn + "T00:00:00Z"), end = new Date(checkOut + "T00:00:00Z");
>
> for (; d \< end; d.setUTCDate(d.getUTCDate() + 1)) out.push(d.toISOString().slice(0, 10));
>
> return out;
>
> }
>
> async function findAvailableRooms(checkIn, checkOut, roomTypeId) {
>
> const { Items: rooms } = await ddb.send(new QueryCommand({
>
> TableName: TABLE, KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
>
> ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": "ROOM#" },
>
> }));
>
> const now = Math.floor(Date.now() / 1000), taken = new Set();
>
> await Promise.all(nights(checkIn, checkOut).map(async (d) =\> {
>
> const { Items } = await ddb.send(new QueryCommand({
>
> TableName: TABLE, IndexName: "GSI1",
>
> KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :t)",
>
> ExpressionAttributeValues: { ":pk": "NIGHT#" + d, ":t": "ROOMTYPE#" + (roomTypeId \|\| "") },
>
> }));
>
> Items.filter((n) =\> n.Status === "Booked" \|\| n.ExpiresAt \> now).forEach((n) =\> taken.add(n.RoomID));
>
> }));
>
> return rooms.filter((r) =\> (!roomTypeId \|\| r.RoomTypeID === roomTypeId)
>
> && \!["Maintenance", "OutOfOrder"\].includes(r.Status) && !taken.has(r.RoomID));
>
> }

13.4. Tạo booking online (chống đặt trùng)

> const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
>
> async function createOnlineBooking(b) { // b đã được tính giá theo mục 7.1
>
> const now = new Date(), nowSec = Math.floor(now / 1000), exp = nowSec + 15 \* 60;
>
> const k = "CHECKIN#" + b.CheckInDate + "#" + b.BookingID;
>
> const tx = \[{ Put: { TableName: TABLE, ConditionExpression: "attribute_not_exists(PK)", Item: {
>
> PK: "BOOKING#" + b.BookingID, SK: "METADATA", EntityType: "Booking",
>
> GSI1PK: "ROOM#" + b.RoomID, GSI1SK: k,
>
> GSI2PK: "CUSTOMER#" + b.CustomerID, GSI2SK: "BOOKING#" + b.CheckInDate + "#" + b.BookingID,
>
> GSI3PK: "BKSTATUS#Pending", GSI3SK: k,
>
> ...b, BookingChannel: "Online", ProcessedByStaffID: null, Status: "Pending",
>
> PaidAmount: 0, ExpiresAt: exp, Version: 1, CreatedAt: now.toISOString(), UpdatedAt: now.toISOString() } } }\];
>
> for (const n of b.NightlyRates) tx.push({ Put: { TableName: TABLE,
>
> // đêm chưa ai giữ, hoặc chỉ là Held đã hết hạn mà TTL chưa kịp xóa
>
> ConditionExpression: "attribute_not_exists(PK) OR (#s = :held AND ExpiresAt \< :now)",
>
> ExpressionAttributeNames: { "#s": "Status" },
>
> ExpressionAttributeValues: { ":held": "Held", ":now": nowSec },
>
> Item: { PK: "ROOM#" + b.RoomID, SK: "NIGHT#" + n.Date, EntityType: "RoomNight",
>
> GSI1PK: "NIGHT#" + n.Date, GSI1SK: "ROOMTYPE#" + b.RoomTypeID + "#ROOM#" + b.RoomID,
>
> RoomID: b.RoomID, RoomTypeID: b.RoomTypeID, Date: n.Date, BookingID: b.BookingID,
>
> Price: n.Price, Status: "Held", ExpiresAt: exp, CreatedAt: now.toISOString() } } });
>
> if (b.VoucherCode) tx.push({ Update: { TableName: TABLE,
>
> Key: { PK: "VOUCHER#" + b.VoucherCode, SK: "METADATA" },
>
> UpdateExpression: "ADD UsedCount :one",
>
> ConditionExpression: "IsActive = :t AND UsedCount \< UsageLimit",
>
> ExpressionAttributeValues: { ":one": 1, ":t": true } } });
>
> try { await ddb.send(new TransactWriteCommand({ TransactItems: tx })); return { ok: true }; }
>
> catch (e) {
>
> if (e.name === "TransactionCanceledException") return { ok: false, reason: "Phòng vừa được đặt hoặc voucher hết lượt" };
>
> throw e;
>
> }
>
> }

13.5. Check-in

> async function checkIn(bookingId, roomId, staffId) {
>
> const t = new Date().toISOString();
>
> await ddb.send(new TransactWriteCommand({ TransactItems: \[
>
> { Update: { TableName: TABLE, Key: { PK: "BOOKING#" + bookingId, SK: "METADATA" },
>
> UpdateExpression: "SET \#s = :ci, GSI3PK = :g, ActualCheckInAt = :t, CheckedInByStaffID = :st, UpdatedAt = :t ADD Version :one",
>
> ConditionExpression: "#s = :cf", ExpressionAttributeNames: { "#s": "Status" },
>
> ExpressionAttributeValues: { ":ci": "CheckedIn", ":cf": "Confirmed", ":g": "BKSTATUS#CheckedIn", ":t": t, ":st": staffId, ":one": 1 } } },
>
> { Update: { TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "ROOM#" + roomId },
>
> UpdateExpression: "SET \#s = :o, GSI3PK = :g, CurrentBookingID = :b, UpdatedAt = :t ADD Version :one",
>
> ConditionExpression: "#s = :a", ExpressionAttributeNames: { "#s": "Status" },
>
> ExpressionAttributeValues: { ":o": "Occupied", ":a": "Available", ":g": "ROOMSTATUS#Occupied", ":b": bookingId, ":t": t, ":one": 1 } } },
>
> { Put: { TableName: TABLE, Item: { PK: "ROOM#" + roomId, SK: "LOG#" + t + "#" + bookingId, EntityType: "RoomStatusLog",
>
> RoomID: roomId, FromStatus: "Available", ToStatus: "Occupied", ChangedByStaffID: staffId,
>
> Reason: "Check-in " + bookingId, ChangedAt: t, CreatedAt: t } } },
>
> \] }));
>
> io.emit("room:updated", { roomId, status: "Occupied" }); // Socket.IO đẩy realtime
>
> }

Check-out, hủy phòng và hoàn thành dọn phòng viết theo cùng khuôn: một TransactWriteCommand gồm các thao tác đã liệt kê ở mục 8, điều kiện theo Status hiện tại, sau đó phát sự kiện Socket.IO.

13.6. Báo cáo doanh thu tháng

> async function revenueByMonth(ym) { // "2026-09"
>
> let total = 0, count = 0, ExclusiveStartKey;
>
> do {
>
> const r = await ddb.send(new QueryCommand({ TableName: TABLE, IndexName: "GSI3",
>
> KeyConditionExpression: "GSI3PK = :pk", ExpressionAttributeValues: { ":pk": "INVMONTH#" + ym },
>
> ProjectionExpression: "TotalAmount", ExclusiveStartKey }));
>
> r.Items.forEach((i) =\> { total += i.TotalAmount; count++; });
>
> ExclusiveStartKey = r.LastEvaluatedKey;
>
> } while (ExclusiveStartKey);
>
> return { total, count };
>
> }

14\. Quy ước chung

| **Hạng mục**      | **Quy ước**                                                                                                                          |
|-------------------|--------------------------------------------------------------------------------------------------------------------------------------|
| Tên field         | PascalCase cho mọi attribute (CheckInDate, TotalPrice). Riêng khóa viết hoa: PK, SK, GSI1PK...                                       |
| Ngày              | Ngày lưu trú (CheckInDate, Date của RoomNight...) dạng YYYY-MM-DD theo giờ Việt Nam                                                  |
| Thời điểm         | ISO 8601 UTC có hậu tố Z, ví dụ 2026-09-20T07:20:00Z (tức 14:20 giờ Việt Nam). Frontend tự đổi sang giờ địa phương                   |
| TTL               | ExpiresAt là Number, epoch giây                                                                                                      |
| Tiền              | Number nguyên, đơn vị VND                                                                                                            |
| Mã ID             | C0001, S01, BK000001, P000001, SC00001, BS000001, INV000001, T000001, R00001, L000001, SV01, phòng "101", loại phòng STD/DBL/DLX/LUX |
| Tiền tố           | Chỉ dùng trong PK/SK/GSI (BOOKING#BK000001). Attribute lưu giá trị gốc (BookingID = "BK000001")                                      |
| Email             | Luôn chuyển về chữ thường trước khi lưu và truy vấn                                                                                  |
| Giá trị trống     | Field không áp dụng thì bỏ hẳn, không ghi chuỗi rỗng. Ngoại lệ duy nhất: ProcessedByStaffID = null với đơn online                    |
| Đổi trạng thái    | Luôn cập nhật cùng lúc Status, GSI3PK, UpdatedAt và tăng Version                                                                     |
| JSON dữ liệu      | Không đặt comment trong file dữ liệu; giải thích field nằm trong tài liệu này                                                        |
| Thay đổi thiết kế | Mọi thay đổi PK/SK/GSI phải cập nhật mục 4, 5 và báo người phụ trách Backend trước                                                   |

15\. Thay đổi so với bản 1.0

| **Vấn đề ở bản 1.0**                                                                             | **Cách xử lý ở bản 2.0**                                                             |
|--------------------------------------------------------------------------------------------------|--------------------------------------------------------------------------------------|
| Booking nằm dưới PK CUSTOMER#, còn Payment/Invoice dưới BOOKING#, không tra được booking theo mã | Booking chuyển về PK=BOOKING#\<id\>, SK=METADATA; lịch sử khách tra qua GSI2         |
| Không kiểm tra được trùng lịch theo khoảng ngày, không chống đặt đồng thời                       | Thêm entity RoomNight + TransactWriteItems có điều kiện                              |
| Room.Status trộn Booked (theo ngày) với trạng thái vật lý                                        | Status chỉ còn trạng thái vật lý; phòng trống theo ngày tính từ RoomNight            |
| GSI1 của Room là ROOM#\<id\> nên không lọc được theo trạng thái                                  | GSI3 ROOMSTATUS#\<Status\>                                                           |
| Staff không có email/mật khẩu để đăng nhập                                                       | Staff có Email, PasswordHash, Role, IsActive, nằm trong GSI2 và GSI3                 |
| Tính cọc sai khi có voucher (BK1002)                                                             | Thêm SubTotal; cọc tính trên TotalPrice sau giảm                                     |
| Status Deposited và Confirmed trùng nghĩa                                                        | Bỏ Deposited; thêm NoShow                                                            |
| Service, BookingService, Rate, Voucher chưa có field                                             | Định nghĩa đầy đủ ở mục 6                                                            |
| Thiếu EntityType, CreatedAt, UpdatedAt, Version                                                  | Bổ sung cho mọi item                                                                 |
| Chưa có entity cho vận hành phòng, đánh giá, doanh thu                                           | Thêm RoomStatusLog, HousekeepingTask, Review, Invoice theo tháng (GSI3), UniqueEmail |
| Dữ liệu mẫu chỉ khoảng 10 item, lẫn tiền tố trong giá trị ID                                     | Bộ dữ liệu 18.135 item, định dạng DynamoDB JSON, ID không lẫn tiền tố                |
