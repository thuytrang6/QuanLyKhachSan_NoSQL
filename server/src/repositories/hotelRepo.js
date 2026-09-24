const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE, queryAll } = require("../config/db");

// AP1 — Thông tin khách sạn: GetItem PK=HOTEL#MAIN, SK=METADATA
async function getHotel() {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "METADATA" } }));
  return r.Item || null;
}

// AP2 — Danh sách loại phòng: PK=HOTEL#MAIN, begins_with(SK, ROOMTYPE#)
function listRoomTypes() {
  return queryAll({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": "ROOMTYPE#" },
  });
}

// AP2 — Một loại phòng theo khóa: GetItem PK=HOTEL#MAIN, SK=ROOMTYPE#<id>
async function getRoomType(roomTypeId) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "ROOMTYPE#" + roomTypeId } }));
  return r.Item || null;
}

// AP25 — Bảng giá theo mùa của 1 loại phòng: PK=HOTEL#MAIN, begins_with(SK, RATE#<type>#)
function listRates(roomTypeId) {
  return queryAll({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": `RATE#${roomTypeId}#` },
  });
}

// AP27 — Kiểm tra voucher: GetItem PK=VOUCHER#<code>, SK=METADATA
async function getVoucher(code) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: { PK: "VOUCHER#" + code, SK: "METADATA" } }));
  return r.Item || null;
}

module.exports = { getHotel, listRoomTypes, getRoomType, listRates, getVoucher };
