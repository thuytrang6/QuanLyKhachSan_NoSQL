// query-db.js — Công cụ truy vấn trực tiếp DynamoDB để demo cho Giảng viên
// Cách dùng:
//   node query-db.js room 501           -> Xem chi tiết phòng 501 trong DB
//   node query-db.js booking BK002317   -> Xem thông tin đơn đặt phòng và các đêm bị khóa
//   node query-db.js nights 501         -> Xem tất cả các đêm đã bị đặt của phòng 501
//   node query-db.js check-deleted 999  -> Kiểm tra phòng 999 xem đã bị xóa khỏi DB chưa
//   node query-db.js hotel              -> Xem thông tin khách sạn và tổng số phòng TotalRooms

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "server", ".env") });
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, GetCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const TABLE = process.env.TABLE || "HotelBookingTable";
const endpoint = process.env.DDB_ENDPOINT || "http://localhost:8000";
const rawClient = new DynamoDBClient({
  region: process.env.AWS_REGION || "local",
  ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
});
const ddb = DynamoDBDocumentClient.from(rawClient, { marshallOptions: { removeUndefinedValues: true } });

const [, , command, param] = process.argv;

async function main() {
  if (!command) {
    console.log(`
[HƯỚNG DẪN TRUY VẤN DYNAMODB CHO GIẢNG VIÊN]:
  node query-db.js room <mã_phòng>          Tra cứu phòng (Ví dụ: node query-db.js room 501)
  node query-db.js booking <mã_đơn>         Tra cứu đơn đặt phòng (Ví dụ: node query-db.js booking BK002317)
  node query-db.js nights <mã_phòng>        Tra cứu các đêm phòng bị chiếm
  node query-db.js check-deleted <mã_phòng> Chứng minh phòng đã bị xóa khỏi DB
  node query-db.js hotel                    Xem thông tin khách sạn và TotalRooms
    `);
    process.exit(0);
  }

  console.log(`\n======================================================`);
  console.log(`TRUY VẤN BẢNG: ${TABLE} (@ ${endpoint})`);
  console.log(`======================================================\n`);

  if (command === "room") {
    const roomId = param || "501";
    console.log(`Thao tác DynamoDB: GetItem PK="HOTEL#MAIN", SK="ROOM#${roomId}"\n`);
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: `ROOM#${roomId}` },
    }));
    if (res.Item) {
      console.log(`TÌM THẤY PHÒNG ${roomId} TRONG DYNAMODB:`);
      console.log(JSON.stringify(res.Item, null, 2));
    } else {
      console.log(`KHÔNG TÌM THẤY phòng ${roomId} trong DB (Item không tồn tại hoặc đã bị xóa).`);
    }
  } else if (command === "booking") {
    const bookingId = param;
    if (!bookingId) {
      console.log("Vui lòng nhập mã đơn đặt phòng. Ví dụ: node query-db.js booking BK002317");
      return;
    }
    console.log(`Thao tác 1: GetItem PK="BOOKING#${bookingId}", SK="METADATA"\n`);
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: `BOOKING#${bookingId}`, SK: "METADATA" },
    }));
    if (res.Item) {
      console.log(`TÌM THẤY ĐƠN ĐẶT PHÒNG ${bookingId}:`);
      console.log(JSON.stringify(res.Item, null, 2));

      // Lấy thêm các đêm phòng liên kết
      console.log(`\nThao tác 2: Query GSI1 tìm các đêm phòng bị chiếm của đơn này...`);
      const nights = await ddb.send(new QueryCommand({
        TableName: TABLE,
        IndexName: "GSI1",
        KeyConditionExpression: "GSI1PK = :pk",
        ExpressionAttributeValues: { ":pk": `NIGHT#${res.Item.CheckInDate}` },
      }));
      const matched = (nights.Items || []).filter(n => n.BookingID === bookingId);
      console.log(`Chi tiết các đêm (RoomNight):`, JSON.stringify(matched, null, 2));
    } else {
      console.log(`KHÔNG TÌM THẤY đơn đặt phòng ${bookingId}.`);
    }
  } else if (command === "nights") {
    const roomId = param || "501";
    console.log(`Thao tác: Query PK="ROOM#${roomId}", SK begins_with "NIGHT#"\n`);
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE,
      KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
      ExpressionAttributeValues: { ":pk": `ROOM#${roomId}`, ":sk": "NIGHT#" },
    }));
    console.log(`TÌM THẤY ${(res.Items || []).length} ĐÊM PHÒNG BỊ CHIẾM CỦA PHÒNG ${roomId}:`);
    console.log(JSON.stringify(res.Items || [], null, 2));
  } else if (command === "check-deleted") {
    const roomId = param || "999";
    console.log(`Thao tác: GetItem PK="HOTEL#MAIN", SK="ROOM#${roomId}"\n`);
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: `ROOM#${roomId}` },
    }));
    if (!res.Item) {
      console.log(`CHỨNG MINH THÀNH CÔNG: Phòng ${roomId} HOÀN TOÀN KHÔNG CÒN TỒN TẠI trong DynamoDB!`);
      console.log(`Kết quả trả về: res.Item === undefined (Đã xóa vĩnh viễn)`);
    } else {
      console.log(`Phòng ${roomId} vẫn còn tồn tại trong DB:`, res.Item);
    }
  } else if (command === "hotel") {
    const res = await ddb.send(new GetCommand({
      TableName: TABLE,
      Key: { PK: "HOTEL#MAIN", SK: "METADATA" },
    }));
    console.log(`THÔNG TIN KHÁCH SẠN VÀ TỔNG SỐ PHÒNG:`);
    console.log({
      HotelName: res.Item?.HotelName,
      TotalRooms: res.Item?.TotalRooms,
      Policies: res.Item?.Policies,
    });
  }
}

main().catch(console.error);
