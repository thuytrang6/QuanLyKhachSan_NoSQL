// test-runner.js — Chạy kiểm thử tự động toàn bộ hệ thống và xác thực trực tiếp dưới DynamoDB
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "server", ".env") });
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, DeleteCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = process.env.TABLE || "HotelBookingTable";
const endpoint = process.env.DDB_ENDPOINT || "http://localhost:8000";
const rawClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "local",
  ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
});
const ddb = DynamoDBDocumentClient.from(rawClient, { marshallOptions: { removeUndefinedValues: true } });

const BASE_URL = "http://localhost:4000/api";
let customerCookie = "";
let adminCookie = "";
let createdBookingId = "";
let pendingBookingId = "";
const TEST_ROOM = "505"; // Mã phòng dùng cho toàn bộ kịch bản thêm/sửa/đặt

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function pass(name, detail = "") {
  console.log(`${colors.green}✔ [PASS]${colors.reset} ${colors.bold}${name}${colors.reset} ${detail ? `(${detail})` : ""}`);
}
function fail(name, err) {
  console.error(`${colors.red}✘ [FAIL]${colors.reset} ${colors.bold}${name}${colors.reset}: ${err}`);
}
function info(title, data) {
  console.log(`   ${colors.cyan}DB Query Output (${title}):${colors.reset} ${typeof data === "object" ? JSON.stringify(data, null, 2).split("\n").join("\n   ") : data}`);
}

async function request(url, options = {}) {
  const res = await fetch(`${BASE_URL}${url}`, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, headers: res.headers, data: json };
}

function extractCookie(res) {
  const raw = res.headers.get("set-cookie") || "";
  return raw.split(";")[0]; // lấy "token=..."
}

async function runAllTests() {
  console.log(`\n${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.bold}   BẮT ĐẦU CHẠY BỘ KIỂM THỬ HỆ THỐNG & XÁC THỰC TRUY VẤN DYNAMODB   ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}\n`);

  // TC-01: Đăng nhập Khách hàng
  try {
    const res = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lethibich@gmail.com", password: "123456" }),
    });
    if (res.status === 200 && res.data.data?.role === "customer") {
      customerCookie = extractCookie(res);
      pass("TC-01: Đăng nhập Khách hàng thành công", `User: ${res.data.data.FullName} (${res.data.data.email})`);
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-01", e.message); }

  // TC-02: Đăng nhập Quản trị viên
  try {
    const res = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "long.pham@sunrisehotel.vn", password: "123456" }),
    });
    if (res.status === 200 && res.data.data?.role === "admin") {
      adminCookie = extractCookie(res);
      pass("TC-02: Đăng nhập Quản trị viên thành công", `Admin: ${res.data.data.FullName} (${res.data.data.email})`);
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-02", e.message); }

  // TC-03: Phân quyền - Khách hàng không thể gọi API Admin
  try {
    const res = await request("/admin/rooms", {
      headers: { "Cookie": customerCookie },
    });
    if (res.status === 403) {
      pass("TC-03: Phân quyền RBAC", "Khách hàng bị từ chối 403 khi truy cập API Quản trị");
    } else throw new Error(`Kỳ vọng 403 nhưng nhận ${res.status}`);
  } catch (e) { fail("TC-03", e.message); }

  // TC-04: Admin tạo phòng mới 505
  try {
    // Dọn sạch phòng TEST_ROOM trong DB nếu sót từ phiên trước
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: `ROOM#${TEST_ROOM}` } })).catch(() => {});

    const res = await request("/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": adminCookie },
      body: JSON.stringify({
        RoomNumber: TEST_ROOM,
        Floor: 5,
        RoomTypeID: "DLX",
        View: "Thành phố trên cao tầng 5",
        Amenities: ["Wifi", "Smart TV", "Minibar", "Bồn tắm"],
        Images: ["images/rooms/dlx-1.jpg"],
      }),
    });

    if (res.status === 201) {
      pass(`TC-04: Admin tạo phòng mới ${TEST_ROOM} thành công`, "HTTP 201 Created");
      // Xác thực trực tiếp dưới DynamoDB
      const dbRoom = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: `ROOM#${TEST_ROOM}` },
      }));
      if (dbRoom.Item && dbRoom.Item.RoomID === TEST_ROOM && dbRoom.Item.Status === "Available") {
        pass(`TC-04 [DB-CHECK]: Tìm thấy phòng ${TEST_ROOM} trong DynamoDB`, `PK: HOTEL#MAIN, SK: ROOM#${TEST_ROOM}, Status: ${dbRoom.Item.Status}`);
        info(`Phòng ${TEST_ROOM} vừa thêm`, {
          PK: dbRoom.Item.PK,
          SK: dbRoom.Item.SK,
          RoomID: dbRoom.Item.RoomID,
          RoomTypeName: dbRoom.Item.RoomTypeName,
          BasePrice: dbRoom.Item.BasePrice,
          Status: dbRoom.Item.Status,
          GSI3PK: dbRoom.Item.GSI3PK,
        });
      } else {
        throw new Error(`Không tìm thấy item phòng ${TEST_ROOM} dưới DynamoDB!`);
      }
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-04", e.message); }

  // TC-05: Chặn tạo trùng số phòng 505
  try {
    const res = await request("/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": adminCookie },
      body: JSON.stringify({
        RoomNumber: TEST_ROOM,
        Floor: 5,
        RoomTypeID: "DLX",
        View: "Thành phố",
        Amenities: [],
        Images: [],
      }),
    });
    if (res.status === 409) {
      pass(`TC-05: Chặn tạo trùng số phòng ${TEST_ROOM}`, "HTTP 409 Conflict");
    } else throw new Error(`Kỳ vọng 409 nhưng nhận ${res.status}`);
  } catch (e) { fail("TC-05", e.message); }

  // TC-06: Đổi trạng thái phòng 505 sang Maintenance
  try {
    const roomInfo = await request(`/admin/rooms/${TEST_ROOM}`, { headers: { "Cookie": adminCookie } });
    const current = roomInfo.data.data;
    const res = await request(`/admin/rooms/${TEST_ROOM}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", "Cookie": adminCookie },
      body: JSON.stringify({
        Version: current.Version,
        View: current.View,
        Amenities: current.Amenities || [],
        Images: current.Images || [],
        Status: "Maintenance",
        MaintenanceNote: "Sơn sửa lại ban công tầng 5",
      }),
    });
    if (res.status === 200 && res.data.data.Status === "Maintenance") {
      pass(`TC-06: Đổi trạng thái phòng ${TEST_ROOM} sang Maintenance`, "HTTP 200 OK");
      // Kiểm tra DB: xem GSI3PK và RoomStatusLog
      const dbRoom = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: `ROOM#${TEST_ROOM}` },
      }));
      const logs = await ddb.send(new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: { ":pk": `ROOM#${TEST_ROOM}`, ":sk": "LOG#" },
      }));
      if (dbRoom.Item?.GSI3PK === "ROOMSTATUS#Maintenance" && logs.Items?.length > 0) {
        pass(`TC-06 [DB-CHECK]: GSI3PK cập nhật và có RoomStatusLog trong DB`, `Số log: ${logs.Items.length}`);
        info("Log trạng thái phòng trong DB", {
          PK: logs.Items[0].PK,
          SK: logs.Items[0].SK,
          FromStatus: logs.Items[0].FromStatus,
          ToStatus: logs.Items[0].ToStatus,
          Reason: logs.Items[0].Reason,
        });
      }
      // Chuyển lại về Available để test đặt phòng tiếp
      const v2 = res.data.data.Version;
      await request(`/admin/rooms/${TEST_ROOM}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "Cookie": adminCookie },
        body: JSON.stringify({
          Version: v2,
          View: current.View,
          Amenities: current.Amenities || [],
          Images: current.Images || [],
          Status: "Available",
        }),
      });
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-06", e.message); }

  // TC-07: Chi tiết phòng và lịch trống
  try {
    const res = await request(`/rooms/${TEST_ROOM}?checkIn=2026-11-10&checkOut=2026-11-12&adults=2&childrenOver1m=0&childrenUnder1m=0`);
    if (res.status === 200 && res.data.data.room.RoomID === TEST_ROOM && res.data.data.stay?.Available === true) {
      pass("TC-07: Lấy chi tiết phòng và lịch trống", `Đêm: ${res.data.data.stay.Nights}, Giá: ${res.data.data.stay.EstimatedTotal.toLocaleString()}đ`);
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-07", e.message); }

  // TC-08: Báo giá có phụ thu trẻ em (>1m: 100k/đêm)
  try {
    const res = await request("/bookings/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": customerCookie },
      body: JSON.stringify({
        roomId: TEST_ROOM,
        checkIn: "2026-11-10",
        checkOut: "2026-11-12", // 2 đêm
        adults: 2,
        childrenOver1m: 1, // 1 trẻ > 1m
        childrenUnder1m: 1, // 1 trẻ < 1m (miễn phí)
      }),
    });
    if (res.status === 200 && res.data.data.ChildSurchargeTotal === 200000) {
      pass("TC-08: Báo giá tính đúng phụ thu trẻ em", `Phụ thu: ${res.data.data.ChildSurchargeTotal.toLocaleString()}đ cho 2 đêm`);
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-08", e.message); }

  // TC-09: Khách hàng đặt phòng trực tiếp (pay_at_hotel -> Confirmed ngay)
  try {
    const res = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": customerCookie },
      body: JSON.stringify({
        roomId: TEST_ROOM,
        checkIn: "2026-11-10",
        checkOut: "2026-11-12",
        adults: 2,
        childrenOver1m: 0,
        childrenUnder1m: 0,
        paymentMode: "pay_at_hotel",
        notes: "Khách VIP, phòng view đẹp",
      }),
    });

    if (res.status === 201 && res.data.data.isDirectConfirm === true) {
      createdBookingId = res.data.data.BookingID;
      pass("TC-09: Đặt phòng trực tiếp thành công", `Mã đơn: ${createdBookingId}, Trạng thái: Confirmed`);

      // XÁC THỰC DƯỚI DYNAMODB
      const bookingItem = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `BOOKING#${createdBookingId}`, SK: "METADATA" },
      }));
      const night1 = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM}`, SK: "NIGHT#2026-11-10" },
      }));
      const night2 = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM}`, SK: "NIGHT#2026-11-11" },
      }));

      if (bookingItem.Item?.Status === "Confirmed" && night1.Item?.Status === "Booked" && night2.Item?.Status === "Booked") {
        pass("TC-09 [DB-CHECK]: Tìm thấy đơn & các đêm phòng bị chiếm trong DynamoDB", `Đêm 10/11 & 11/11: ${night1.Item.Status}`);
        info("Đơn đặt phòng (Booking Metadata) trong DB", {
          PK: bookingItem.Item.PK,
          SK: bookingItem.Item.SK,
          BookingID: bookingItem.Item.BookingID,
          CustomerName: bookingItem.Item.CustomerName,
          RoomID: bookingItem.Item.RoomID,
          TotalAmount: bookingItem.Item.TotalAmount,
          Status: bookingItem.Item.Status,
          GSI3PK: bookingItem.Item.GSI3PK,
        });
        info("Đêm phòng bị chiếm (RoomNight) trong DB", {
          PK: night1.Item.PK,
          SK: night1.Item.SK,
          Status: night1.Item.Status,
          BookingID: night1.Item.BookingID,
          GSI1PK: night1.Item.GSI1PK,
        });
      } else {
        throw new Error("Dữ liệu Booking hoặc RoomNight trong DynamoDB không khớp!");
      }
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-09", e.message); }

  // TC-10: Chống trùng phòng (Race condition / Conflict check)
  try {
    const res = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": customerCookie },
      body: JSON.stringify({
        roomId: TEST_ROOM,
        checkIn: "2026-11-10",
        checkOut: "2026-11-12",
        adults: 2,
        paymentMode: "pay_at_hotel",
      }),
    });
    if (res.status === 409) {
      pass("TC-10: Chống trùng lịch đặt phòng", "HTTP 409 Conflict (Phòng đã có khách đặt)");
    } else throw new Error(`Kỳ vọng 409 nhưng nhận ${res.status}`);
  } catch (e) { fail("TC-10", e.message); }

  // TC-11: Đặt phòng giữ chỗ online (deposit_online -> Pending 15p)
  try {
    const res = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": customerCookie },
      body: JSON.stringify({
        roomId: TEST_ROOM,
        checkIn: "2026-11-20",
        checkOut: "2026-11-21",
        adults: 2,
        paymentMode: "deposit_online",
      }),
    });
    if (res.status === 201 && res.data.data.Status === "Pending") {
      pendingBookingId = res.data.data.BookingID;
      pass("TC-11: Đặt phòng giữ chỗ online", `Mã đơn: ${pendingBookingId}, Trạng thái: Pending`);

      // Kiểm tra DB
      const bookingItem = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `BOOKING#${pendingBookingId}`, SK: "METADATA" },
      }));
      const heldNight = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM}`, SK: "NIGHT#2026-11-20" },
      }));
      if (bookingItem.Item?.Status === "Pending" && heldNight.Item?.Status === "Held" && heldNight.Item?.ExpiresAt) {
        pass("TC-11 [DB-CHECK]: Đêm phòng ở trạng thái Held kèm TTL ExpiresAt", `ExpiresAt: ${heldNight.Item.ExpiresAt}`);
        info("RoomNight Held trong DB", {
          PK: heldNight.Item.PK,
          SK: heldNight.Item.SK,
          Status: heldNight.Item.Status,
          ExpiresAt: heldNight.Item.ExpiresAt,
        });
      }
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-11", e.message); }

  // TC-12: Thanh toán cọc demo 20%
  try {
    const res = await request(`/bookings/${pendingBookingId}/pay`, {
      method: "POST",
      headers: { "Cookie": customerCookie },
    });
    if (res.status === 200 && res.data.data.Status === "Confirmed") {
      pass("TC-12: Thanh toán cọc thành công", "Đơn chuyển từ Pending sang Confirmed");
      // Kiểm tra DB: RoomNight chuyển từ Held sang Booked
      const updatedNight = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM}`, SK: "NIGHT#2026-11-20" },
      }));
      if (updatedNight.Item?.Status === "Booked") {
        pass("TC-12 [DB-CHECK]: RoomNight đã chuyển từ Held thành Booked", `Status: ${updatedNight.Item.Status}`);
      }
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-12", e.message); }

  // TC-13: Hủy đơn đặt phòng giải phóng phòng
  try {
    const res = await request(`/bookings/${createdBookingId}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": customerCookie },
      body: JSON.stringify({ reason: "Thay đổi lịch trình công tác" }),
    });
    if (res.status === 200 && res.data.data.Status === "Cancelled") {
      pass("TC-13: Hủy đơn đặt phòng thành công", `Đơn ${createdBookingId} chuyển sang Cancelled`);

      // XÁC THỰC DƯỚI DYNAMODB: RoomNight của các đêm này phải bị XÓA hoàn toàn khỏi DB!
      const night1After = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM}`, SK: "NIGHT#2026-11-10" },
      }));
      if (!night1After.Item) {
        pass(`TC-13 [DB-CHECK]: Item RoomNight đã được XÓA khỏi DynamoDB`, `Phòng ${TEST_ROOM} đêm 10/11 đã trống trở lại!`);
      } else {
        throw new Error("Item RoomNight vẫn còn tồn tại sau khi hủy!");
      }
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC-13", e.message); }

  // TC-14 & TC-15: Thêm phòng 999 rồi XÓA phòng 999 để chứng minh truy vấn phòng vừa xóa
  try {
    // 1. Dọn phòng 999 cũ nếu có
    await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "ROOM#999" } })).catch(() => {});

    // 2. Thêm phòng 999
    const addRes = await request("/admin/rooms", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Cookie": adminCookie },
      body: JSON.stringify({
        RoomNumber: "999",
        Floor: 9,
        RoomTypeID: "STD",
        View: "Sân thượng tầng 9",
        Amenities: ["Wifi"],
        Images: [],
      }),
    });
    if (addRes.status === 201) {
      const beforeDel = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: "ROOM#999" },
      }));
      if (beforeDel.Item) {
        pass("TC-14: Tạo phòng 999 thành công để kiểm tra xóa", `Phòng 999 tồn tại trong DB (Floor ${beforeDel.Item.Floor})`);
        info("Phòng 999 trước khi xóa", {
          PK: beforeDel.Item.PK,
          SK: beforeDel.Item.SK,
          RoomID: beforeDel.Item.RoomID,
          Status: beforeDel.Item.Status,
        });
      }
    } else throw new Error(`Tạo phòng 999 thất bại: ${JSON.stringify(addRes.data)}`);

    // 3. Xóa phòng 999
    const delRes = await request("/admin/rooms/999", {
      method: "DELETE",
      headers: { "Cookie": adminCookie },
    });
    if (delRes.status === 200) {
      pass("TC-15: Gọi API xóa phòng 999 thành công", "HTTP 200 OK");

      // XÁC THỰC DƯỚI DYNAMODB: Kiểm tra xem item ROOM#999 có thực sự bị xóa khỏi bảng không
      const afterDel = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: "ROOM#999" },
      }));

      if (!afterDel.Item) {
        pass("TC-15 [DB-CHECK]: Xác nhận phòng 999 đã bị XÓA HOÀN TOÀN khỏi DynamoDB!", "Item không còn tồn tại (undefined)");
        info("Kết quả GetItem sau khi xóa phòng 999", { Item: null, message: "Phòng 999 đã bị xóa khỏi bảng HotelBookingTable" });
      } else {
        throw new Error("Phòng 999 vẫn còn tồn tại trong DynamoDB!");
      }
    } else throw new Error(`Status ${delRes.status}: ${JSON.stringify(delRes.data)}`);
  } catch (e) { fail("TC-14/15", e.message); }

  console.log(`\n${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}   HOÀN TẤT TẤT CẢ CÁC BÀI TEST & ĐÃ KIỂM TRA CHỨNG THỰC DƯỚI DYNAMODB!   ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}\n`);
}

runAllTests().catch((e) => console.error("Lỗi test:", e));
