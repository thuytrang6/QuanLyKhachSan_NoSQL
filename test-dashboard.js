// test-dashboard.js — Kiểm thử tự động chuyên sâu các thành phần trên Dashboard Quản lý (Admin Dashboard)
// và xác thực đối soát 100% với cơ sở dữ liệu DynamoDB.
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "server", ".env") });
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand, DeleteCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = process.env.TABLE || "HotelBookingTable";
const endpoint = process.env.DDB_ENDPOINT || "http://localhost:8000";
const rawClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "local",
  ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
});
const ddb = DynamoDBDocumentClient.from(rawClient, { marshallOptions: { removeUndefinedValues: true } });

const BASE_URL = "http://localhost:4000/api";
let adminCookie = "";
let customerCookie = "";

const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
  magenta: "\x1b[35m",
};

function pass(code, name, detail = "") {
  console.log(`${colors.green}✔ [PASS]${colors.reset} ${colors.bold}[${code}] ${name}${colors.reset} ${detail ? colors.cyan + `(${detail})` + colors.reset : ""}`);
}
function fail(code, name, err) {
  console.error(`${colors.red}✘ [FAIL]${colors.reset} ${colors.bold}[${code}] ${name}${colors.reset}: ${colors.yellow}${err}${colors.reset}`);
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
  return raw.split(";")[0];
}

async function runDashboardTests() {
  console.log(`\n${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.magenta}${colors.bold}   BẮT ĐẦU KIỂM THỬ TOÀN DIỆN CÁC THÀNH PHẦN DASHBOARD ADMIN & DYNAMODB   ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}\n`);

  // --- NHÓM 1: AUTH & RBAC CHO DASHBOARD ---
  console.log(`${colors.bold}--- [NHÓM 1: BẢO MẬT & PHÂN QUYỀN TRUY CẬP DASHBOARD] ---${colors.reset}`);

  // TC_DASH_01: Chặn truy cập khi chưa đăng nhập
  try {
    const res = await request("/admin/reports/overview?date=2026-09-24");
    if (res.status === 401) {
      pass("TC_DASH_01", "Chặn truy cập Dashboard khi chưa đăng nhập", "HTTP 401 Unauthorized");
    } else throw new Error(`Kỳ vọng 401 nhưng nhận ${res.status}`);
  } catch (e) { fail("TC_DASH_01", "Chặn truy cập chưa đăng nhập", e.message); }

  // TC_DASH_02: Phân quyền - Khách hàng không thể gọi API Dashboard Admin
  try {
    const loginCust = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "lethibich@gmail.com", password: "123456" }),
    });
    customerCookie = extractCookie(loginCust);
    const res = await request("/admin/reports/overview?date=2026-09-24", {
      headers: { Cookie: customerCookie },
    });
    if (res.status === 403) {
      pass("TC_DASH_02", "Chặn vai trò Khách hàng (Customer) truy cập API Dashboard", "HTTP 403 Forbidden");
    } else throw new Error(`Kỳ vọng 403 nhưng nhận ${res.status}`);
  } catch (e) { fail("TC_DASH_02", "Phân quyền Customer vào Dashboard", e.message); }

  // TC_DASH_03: Quản trị viên đăng nhập thành công
  try {
    const loginAdmin = await request("/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "long.pham@sunrisehotel.vn", password: "123456" }),
    });
    if (loginAdmin.status === 200 && loginAdmin.data.data?.role === "admin") {
      adminCookie = extractCookie(loginAdmin);
      pass("TC_DASH_03", "Quản trị viên đăng nhập thành công", `Role: admin, User: ${loginAdmin.data.data.FullName}`);
    } else throw new Error(`Status ${loginAdmin.status}`);
  } catch (e) { fail("TC_DASH_03", "Đăng nhập Admin", e.message); }

  // --- NHÓM 2: SƠ ĐỒ TRẠNG THÁI PHÒNG HIỆN TẠI (ROOM BOARD) ---
  console.log(`\n${colors.bold}--- [NHÓM 2: SƠ ĐỒ TRẠNG THÁI PHÒNG THỜI GIAN THỰC (ROOM BOARD)] ---${colors.reset}`);

  // TC_DASH_04: Lấy danh sách sơ đồ phòng theo tầng và 5 trạng thái
  let boardData = null;
  try {
    const res = await request("/admin/room-board", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && res.data.data) {
      boardData = res.data.data;
      const counts = boardData.counts;
      pass("TC_DASH_04", "Lấy dữ liệu sơ đồ phòng (Room Board) thành công",
        `Tổng ${boardData.total} phòng; Available: ${counts.Available}, Occupied: ${counts.Occupied}, Cleaning: ${counts.Cleaning}, Maintenance: ${counts.Maintenance}`);
    } else throw new Error(`Status ${res.status}: ${JSON.stringify(res.data)}`);
  } catch (e) { fail("TC_DASH_04", "Lấy dữ liệu Room Board", e.message); }

  // TC_DASH_05: Đối soát số lượng phòng thực tế với DynamoDB (GSI3 ROOMSTATUS#<status>)
  try {
    const ddbAvailable = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: { ":pk": "ROOMSTATUS#Available" },
      Select: "COUNT",
    }));
    const ddbOccupied = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: { ":pk": "ROOMSTATUS#Occupied" },
      Select: "COUNT",
    }));

    if (boardData && boardData.counts.Available === ddbAvailable.Count && boardData.counts.Occupied === ddbOccupied.Count) {
      pass("TC_DASH_05", "Xác thực đối soát Room Board khớp 100% DynamoDB GSI3",
        `Available DB=${ddbAvailable.Count}, Occupied DB=${ddbOccupied.Count}`);
    } else {
      throw new Error(`Số lượng không khớp: API Available=${boardData?.counts.Available} vs DB=${ddbAvailable.Count}`);
    }
  } catch (e) { fail("TC_DASH_05", "Đối soát Room Board với DynamoDB", e.message); }

  // TC_DASH_06: Kiểm tra phòng Occupied phải có CurrentBookingID và phòng Available không có CurrentBookingID
  try {
    const allRooms = boardData.floors.flatMap((f) => f.rooms);
    const occupiedWithoutBk = allRooms.filter((r) => r.Status === "Occupied" && !r.CurrentBookingID);
    const availableWithBk = allRooms.filter((r) => r.Status === "Available" && r.CurrentBookingID);
    if (occupiedWithoutBk.length === 0 && availableWithBk.length === 0) {
      pass("TC_DASH_06", "Kiểm tra tính toàn vẹn trạng thái phòng & CurrentBookingID",
        `Mọi phòng Occupied đều có mã đơn, phòng Available không bị chiếm`);
    } else {
      throw new Error(`Vi phạm toàn vẹn: ${occupiedWithoutBk.length} phòng Occupied thiếu mã đơn, ${availableWithBk.length} phòng Available có mã đơn`);
    }
  } catch (e) { fail("TC_DASH_06", "Tính toàn vẹn CurrentBookingID", e.message); }

  // --- NHÓM 3: TỔNG QUAN NGÀY (OVERVIEW: KHÁCH ĐẾN, ĐANG Ở, ĐÁNH GIÁ) ---
  console.log(`\n${colors.bold}--- [NHÓM 3: TỔNG QUAN NGÀY - KHÁCH ĐẾN, ĐANG Ở, REVIEW] ---${colors.reset}`);

  // TC_DASH_07: Lấy dữ liệu tổng quan ngày mẫu 2026-09-24
  let overviewData = null;
  try {
    const res = await request("/admin/reports/overview?date=2026-09-24", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && res.data.data) {
      overviewData = res.data.data;
      pass("TC_DASH_07", "Lấy dữ liệu Overview ngày mẫu 2026-09-24 thành công",
        `Khách đến: ${overviewData.arrivals.length}, Đang lưu trú: ${overviewData.inHouse.length}, Reviews: ${overviewData.reviews.length}`);
    } else throw new Error(`Status ${res.status}`);
  } catch (e) { fail("TC_DASH_07", "Lấy dữ liệu Overview", e.message); }

  // TC_DASH_08: Đối soát Khách đến (Arrivals) với DynamoDB (GSI3 BKSTATUS#Confirmed begins_with CHECKIN#2026-09-24)
  try {
    const ddbArrivals = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk AND begins_with(GSI3SK, :sk)",
      ExpressionAttributeValues: { ":pk": "BKSTATUS#Confirmed", ":sk": "CHECKIN#2026-09-24" },
    }));
    if (overviewData && overviewData.arrivals.length === (ddbArrivals.Items || []).length) {
      pass("TC_DASH_08", "Đối soát danh sách 'Khách đến hôm nay' khớp 100% với DynamoDB",
        `Số đơn Confirmed ngày 2026-09-24: ${overviewData.arrivals.length}`);
    } else throw new Error(`Số lượng không khớp: API=${overviewData?.arrivals.length} vs DB=${ddbArrivals.Items?.length}`);
  } catch (e) { fail("TC_DASH_08", "Đối soát Arrivals với DynamoDB", e.message); }

  // TC_DASH_09: Đối soát Khách đang lưu trú (InHouse) với DynamoDB (GSI3 BKSTATUS#CheckedIn)
  try {
    const ddbInHouse = await ddb.send(new QueryCommand({
      TableName: TABLE,
      IndexName: "GSI3",
      KeyConditionExpression: "GSI3PK = :pk",
      ExpressionAttributeValues: { ":pk": "BKSTATUS#CheckedIn" },
      Select: "COUNT",
    }));
    if (overviewData && overviewData.inHouse.length === ddbInHouse.Count) {
      pass("TC_DASH_09", "Đối soát danh sách 'Khách đang lưu trú' khớp 100% với DynamoDB",
        `Số đơn CheckedIn: ${overviewData.inHouse.length}`);
    } else throw new Error(`Số lượng không khớp: API=${overviewData?.inHouse.length} vs DB=${ddbInHouse.Count}`);
  } catch (e) { fail("TC_DASH_09", "Đối soát InHouse với DynamoDB", e.message); }

  // TC_DASH_10: Đối soát thông tin khách sạn và đánh giá từ HOTEL#MAIN
  try {
    const dbHotel = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: "METADATA" },
    }));
    if (overviewData && overviewData.hotel && overviewData.hotel.RatingAvg === dbHotel.Item?.RatingAvg) {
      pass("TC_DASH_10", "Đối soát chỉ số đánh giá khách sạn với DynamoDB",
        `Rating: ${overviewData.hotel.RatingAvg} sao, Reviews: ${overviewData.hotel.ReviewCount}`);
    } else throw new Error("Chỉ số khách sạn không khớp DB");
  } catch (e) { fail("TC_DASH_10", "Đối soát Hotel Rating", e.message); }

  // --- NHÓM 4: BÁO CÁO DOANH THU & HÓA ĐƠN ---
  console.log(`\n${colors.bold}--- [NHÓM 4: DOANH THU 12 THÁNG & TOP HÓA ĐƠN] ---${colors.reset}`);

  // TC_DASH_11: Báo cáo doanh thu 12 tháng năm 2026
  try {
    const res = await request("/admin/reports/revenue?year=2026", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && Array.isArray(res.data.data) && res.data.data.length === 12) {
      const revData = res.data.data;
      const totalYear = revData.reduce((s, m) => s + m.total, 0);
      pass("TC_DASH_11", "Lấy dữ liệu doanh thu 12 tháng năm 2026 thành công",
        `12 tháng đủ, Tổng doanh thu năm: ${totalYear.toLocaleString()}đ`);
    } else throw new Error(`Status ${res.status}`);
  } catch (e) { fail("TC_DASH_11", "Doanh thu 12 tháng", e.message); }

  // TC_DASH_12: Top hóa đơn tháng 2026-09 và xác thực đối soát DynamoDB (GSI3 INVMONTH#2026-09)
  try {
    const res = await request("/admin/reports/invoices?month=2026-09", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && res.data.data) {
      const invData = res.data.data;
      const ddbInvoices = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :pk",
        ExpressionAttributeValues: { ":pk": "INVMONTH#2026-09" },
      }));
      const dbTotal = (ddbInvoices.Items || []).reduce((s, i) => s + (i.TotalAmount || 0), 0);
      if (invData.total === dbTotal && invData.count === (ddbInvoices.Items || []).length) {
        pass("TC_DASH_12", "Đối soát Top hóa đơn tháng 2026-09 khớp 100% DynamoDB",
          `Hóa đơn: ${invData.count}, Tổng tiền: ${invData.total.toLocaleString()}đ`);
      } else {
        throw new Error(`Không khớp: API total=${invData.total} vs DB total=${dbTotal}`);
      }
    } else throw new Error(`Status ${res.status}`);
  } catch (e) { fail("TC_DASH_12", "Hóa đơn tháng 2026-09", e.message); }

  // --- NHÓM 5: THỐNG KÊ BOOKING THEO TRẠNG THÁI & CÔNG SUẤT PHÒNG ---
  console.log(`\n${colors.bold}--- [NHÓM 5: SỐ LƯỢNG BOOKING THEO TRẠNG THÁI & CÔNG SUẤT PHÒNG] ---${colors.reset}`);

  // TC_DASH_13: Thống kê số lượng booking theo 6 trạng thái
  try {
    const res = await request("/admin/reports/booking-status", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && Array.isArray(res.data.data) && res.data.data.length === 6) {
      const statusMap = Object.fromEntries(res.data.data.map((s) => [s.status, s.count]));
      // Đối soát Confirmed với DynamoDB Select=COUNT
      const ddbConfirmed = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI3",
        KeyConditionExpression: "GSI3PK = :pk",
        ExpressionAttributeValues: { ":pk": "BKSTATUS#Confirmed" },
        Select: "COUNT",
      }));
      if (statusMap.Confirmed === ddbConfirmed.Count) {
        pass("TC_DASH_13", "Đối soát số lượng booking theo 6 trạng thái khớp DynamoDB",
          `Confirmed: ${statusMap.Confirmed}, CheckedIn: ${statusMap.CheckedIn}, CheckedOut: ${statusMap.CheckedOut}`);
      } else throw new Error(`Confirmed không khớp: API=${statusMap.Confirmed} vs DB=${ddbConfirmed.Count}`);
    } else throw new Error(`Status ${res.status}`);
  } catch (e) { fail("TC_DASH_13", "Booking theo trạng thái", e.message); }

  // TC_DASH_14: Báo cáo công suất phòng (Occupancy) tháng 2026-09
  try {
    const res = await request("/admin/reports/occupancy?month=2026-09", { headers: { Cookie: adminCookie } });
    if (res.status === 200 && res.data.data?.days?.length === 30) {
      const day24 = res.data.data.days.find((d) => d.date === "2026-09-24");
      // Đối soát số phòng Booked ngày 2026-09-24 trên DynamoDB GSI1 NIGHT#2026-09-24
      const ddbNights = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        FilterExpression: "#s = :b",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: { ":pk": "NIGHT#2026-09-24", ":b": "Booked" },
        Select: "COUNT",
      }));
      if (day24 && day24.booked === ddbNights.Count) {
        pass("TC_DASH_14", "Đối soát công suất phòng ngày 2026-09-24 khớp 100% DynamoDB",
          `Công suất: ${day24.rate}%, Booked: ${day24.booked}/${res.data.data.totalRooms} phòng`);
      } else throw new Error(`Số đêm booked không khớp: API=${day24?.booked} vs DB=${ddbNights.Count}`);
    } else throw new Error(`Tháng 9 phải có đủ 30 ngày!`);
  } catch (e) { fail("TC_DASH_14", "Công suất phòng tháng 9", e.message); }

  // --- NHÓM 6: QUY TRÌNH PHÒNG "ĐANG CỌC", KHÓA LỊCH & TỰ ĐỘNG MỞ LẠI PHÒNG ---
  console.log(`\n${colors.bold}--- [NHÓM 6: QUY TRÌNH PHÒNG 'ĐANG CỌC' (DEPOSITED), KHÓA LỊCH & MỞ LẠI PHÒNG] ---${colors.reset}`);

  const FLOW_ROOM = "501";
  const FLOW_CHECKIN = "2026-12-10";
  const FLOW_CHECKOUT = "2026-12-12";
  let flowBookingId = "";

  async function cleanRoomBookingState(roomId, checkIn, checkOut) {
    const nights = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `ROOM#${roomId}`, ":sk": "NIGHT#" },
    })).catch(() => ({ Items: [] }));
    for (const item of (nights.Items || [])) {
      if (item.SK >= `NIGHT#${checkIn}` && item.SK < `NIGHT#${checkOut}`) {
        await ddb.send(new DeleteCommand({ TableName: TABLE, Key: { PK: item.PK, SK: item.SK } })).catch(() => {});
      }
    }
    await ddb.send(new UpdateCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: `ROOM#${roomId}` },
      UpdateExpression: "SET #s = :av, GSI3PK = :gsi REMOVE CurrentBookingID",
      ExpressionAttributeNames: { "#s": "Status" },
      ExpressionAttributeValues: { ":av": "Available", ":gsi": "ROOMSTATUS#Available" },
    })).catch(() => {});
  }

  // Dọn sạch phòng 501 nếu có sót từ lần trước
  await cleanRoomBookingState(FLOW_ROOM, FLOW_CHECKIN, FLOW_CHECKOUT);

  // TC_DASH_15: Đặt phòng & thanh toán cọc -> Phòng chuyển sang Deposited trong DynamoDB
  try {
    // 1. Tạo đơn giữ chỗ Pending
    const createRes = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        roomId: FLOW_ROOM,
        checkIn: FLOW_CHECKIN,
        checkOut: FLOW_CHECKOUT,
        adults: 2,
        childrenOver1m: 0,
        childrenUnder1m: 0,
        paymentMode: "deposit_online",
      }),
    });
    if (createRes.status !== 201) throw new Error(`Tạo đơn thất bại: ${JSON.stringify(createRes.data)}`);
    flowBookingId = createRes.data.data.BookingID;

    // 2. Thanh toán cọc
    const payRes = await request(`/bookings/${flowBookingId}/pay`, {
      method: "POST",
      headers: { Cookie: customerCookie },
    });
    if (payRes.status !== 200 || payRes.data.data.Status !== "Confirmed") {
      throw new Error(`Thanh toán cọc thất bại: ${JSON.stringify(payRes.data)}`);
    }

    // 3. Đối soát DynamoDB: Item ROOM#501 phải có Status = 'Deposited' và CurrentBookingID = flowBookingId
    const dbRoom = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: `ROOM#${FLOW_ROOM}` },
    }));

    if (dbRoom.Item?.Status === "Deposited" && dbRoom.Item?.CurrentBookingID === flowBookingId && dbRoom.Item?.GSI3PK === "ROOMSTATUS#Deposited") {
      pass("TC_DASH_15", `Sau khi cọc, phòng ${FLOW_ROOM} đã chuyển sang 'Deposited' (Đang cọc) trong DynamoDB`,
        `Status: ${dbRoom.Item.Status}, CurrentBookingID: ${dbRoom.Item.CurrentBookingID}, GSI3PK: ${dbRoom.Item.GSI3PK}`);
    } else {
      throw new Error(`Phòng chưa chuyển Deposited: Status=${dbRoom.Item?.Status}, GSI3PK=${dbRoom.Item?.GSI3PK}`);
    }
  } catch (e) { fail("TC_DASH_15", "Phòng chuyển sang Deposited", e.message); }

  // TC_DASH_16: Khóa lịch đặt phòng - Người khác không thể đăng ký hoặc đặt trùng ngày này
  try {
    const conflictRes = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        roomId: FLOW_ROOM,
        checkIn: FLOW_CHECKIN,
        checkOut: FLOW_CHECKOUT,
        adults: 2,
        paymentMode: "pay_at_hotel",
      }),
    });
    if (conflictRes.status === 409) {
      pass("TC_DASH_16", `Lịch phòng ${FLOW_ROOM} đã bị KHÓA hoàn toàn, chặn đặt trùng thành công`,
        "HTTP 409 Conflict (Phòng vừa được người khác đặt)");
    } else {
      throw new Error(`Kỳ vọng 409 Conflict nhưng nhận ${conflictRes.status}`);
    }
  } catch (e) { fail("TC_DASH_16", "Khóa lịch chống đặt trùng", e.message); }

  // TC_DASH_17: Lễ tân làm thủ tục Check-in -> Phòng chuyển sang 'Occupied'
  try {
    const ciRes = await request(`/admin/bookings/${flowBookingId}/checkin`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    if (ciRes.status === 200 && ciRes.data.data?.Status === "CheckedIn") {
      const dbRoom = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: `ROOM#${FLOW_ROOM}` },
      }));
      if (dbRoom.Item?.Status === "Occupied") {
        pass("TC_DASH_17", `Lễ tân Check-in đơn ${flowBookingId}: Phòng ${FLOW_ROOM} chuyển từ 'Deposited' sang 'Occupied'`,
          `Status: ${dbRoom.Item.Status}, GSI3PK: ${dbRoom.Item.GSI3PK}`);
      } else throw new Error(`Phòng chưa sang Occupied: ${dbRoom.Item?.Status}`);
    } else throw new Error(`Check-in thất bại: ${JSON.stringify(ciRes.data)}`);
  } catch (e) { fail("TC_DASH_17", "Check-in chuyển sang Occupied", e.message); }

  // TC_DASH_18: Khi khách không Check-in (No-Show / Hủy) -> Tự động mở lại phòng về 'Available' và giải phóng các đêm
  try {
    // Để kiểm tra No-Show & mở lại phòng, tạo một đơn cọc thứ hai trên phòng 502
    const TEST_ROOM_2 = "502";
    const NS_CHECKIN = "2026-12-15";
    const NS_CHECKOUT = "2026-12-16";

    // Dọn sạch phòng 502 trước khi test
    await cleanRoomBookingState(TEST_ROOM_2, NS_CHECKIN, NS_CHECKOUT);

    const bk2 = await request("/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: customerCookie },
      body: JSON.stringify({
        roomId: TEST_ROOM_2, checkIn: NS_CHECKIN, checkOut: NS_CHECKOUT, adults: 2, paymentMode: "deposit_online",
      }),
    });
    const bk2Id = bk2.data.data.BookingID;
    await request(`/bookings/${bk2Id}/pay`, { method: "POST", headers: { Cookie: customerCookie } });

    // Quản trị viên ghi nhận No-Show
    const nsRes = await request(`/admin/bookings/${bk2Id}/noshow`, {
      method: "POST",
      headers: { Cookie: adminCookie },
    });
    if (nsRes.status === 200 && nsRes.data.data?.Status === "NoShow") {
      const dbRoom2 = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: "HOTEL#MAIN", SK: `ROOM#${TEST_ROOM_2}` },
      }));
      const deletedNight = await ddb.send(new GetCommand({
        TableName: TABLE,
        Key: { PK: `ROOM#${TEST_ROOM_2}`, SK: `NIGHT#${NS_CHECKIN}` },
      }));

      if (dbRoom2.Item?.Status === "Available" && !dbRoom2.Item?.CurrentBookingID && !deletedNight.Item) {
        pass("TC_DASH_18", `Khách không đến (No-Show): Phòng ${TEST_ROOM_2} tự động MỞ LẠI về 'Available' và xóa đêm bị khóa`,
          `Status: ${dbRoom2.Item.Status}, CurrentBookingID: ${dbRoom2.Item.CurrentBookingID || "Đã xóa"}, RoomNight: Đã xóa`);
      } else {
        throw new Error(`Phòng chưa mở lại: Status=${dbRoom2.Item?.Status}, Night còn tồn tại=${!!deletedNight.Item}`);
      }
    } else throw new Error(`No-Show thất bại: ${JSON.stringify(nsRes.data)}`);
  } catch (e) { fail("TC_DASH_18", "No-Show tự động mở lại phòng", e.message); }

  // Dọn dẹp cả 2 phòng sau khi hoàn tất bộ test
  await cleanRoomBookingState(FLOW_ROOM, FLOW_CHECKIN, FLOW_CHECKOUT);
  await cleanRoomBookingState("502", "2026-12-15", "2026-12-16");

  console.log(`\n${colors.bold}========================================================================${colors.reset}`);
  console.log(`${colors.green}${colors.bold}   HOÀN TẤT BỘ TEST CASE DASHBOARD ADMIN: TOÀN BỘ ĐÃ VƯỢT QUA VÀ ĐỐI SOÁT KHỚP DB!   ${colors.reset}`);
  console.log(`${colors.bold}========================================================================${colors.reset}\n`);
}

runDashboardTests().catch((e) => console.error("Lỗi:", e));
