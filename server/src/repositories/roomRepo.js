const { GetCommand, QueryCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE, queryAll, countAll } = require("../config/db");

const roomKey = (roomId) => ({ PK: "HOTEL#MAIN", SK: "ROOM#" + roomId });
const floorKey = (floor, roomId) => `FLOOR#${String(floor).padStart(2, "0")}#ROOM#${roomId}`;

// AP3 — Sơ đồ toàn bộ phòng: PK=HOTEL#MAIN, begins_with(SK, ROOM#)
function listRooms() {
  return queryAll({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": "ROOM#" },
  });
}

// AP3 — Đếm tổng số phòng: PK=HOTEL#MAIN, begins_with(SK, ROOM#), Select=COUNT
function countRooms() {
  return countAll({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": "ROOM#" },
  });
}

// AP3 — Một phòng theo khóa: GetItem PK=HOTEL#MAIN, SK=ROOM#<id>
async function getRoom(roomId) {
  const r = await ddb.send(new GetCommand({ TableName: TABLE, Key: roomKey(roomId) }));
  return r.Item || null;
}

// AP4 — Phòng theo trạng thái: GSI3 GSI3PK=ROOMSTATUS#<status>
function roomsByStatus(status) {
  return queryAll({
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk",
    ExpressionAttributeValues: { ":pk": "ROOMSTATUS#" + status },
  });
}

// AP5 — Phòng đã bị chiếm trong đêm X theo loại: GSI1 GSI1PK=NIGHT#<date>, begins_with(GSI1SK, ROOMTYPE#<type>)
function nightsOn(date, roomTypeId) {
  return queryAll({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :t)",
    ExpressionAttributeValues: { ":pk": "NIGHT#" + date, ":t": roomTypeId ? `ROOMTYPE#${roomTypeId}#` : "ROOMTYPE#" },
  });
}

// AP6 — Lịch đêm của 1 phòng trong khoảng ngày: PK=ROOM#<id>, SK BETWEEN NIGHT#d1 AND NIGHT#d2
function roomNightsBetween(roomId, d1, d2) {
  return queryAll({
    KeyConditionExpression: "PK = :pk AND SK BETWEEN :a AND :b",
    ExpressionAttributeValues: { ":pk": "ROOM#" + roomId, ":a": "NIGHT#" + d1, ":b": "NIGHT#" + d2 },
  });
}

// AP6 — Phòng có RoomNight nào không: PK=ROOM#<id>, begins_with(SK, NIGHT#), Limit 1
async function hasRoomNight(roomId) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE, Limit: 1, ProjectionExpression: "PK",
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "ROOM#" + roomId, ":sk": "NIGHT#" },
  }));
  return (r.Items || []).length > 0;
}

// AP13 — Lịch booking của 1 phòng (chỉ cần biết có hay không): GSI1 GSI1PK=ROOM#<id>, begins_with(GSI1SK, CHECKIN#), Limit 1
async function hasBooking(roomId) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE, IndexName: "GSI1", Limit: 1,
    KeyConditionExpression: "GSI1PK = :pk AND begins_with(GSI1SK, :sk)",
    ExpressionAttributeValues: { ":pk": "ROOM#" + roomId, ":sk": "CHECKIN#" },
  }));
  return (r.Items || []).length > 0;
}

// AP22 — Nhật ký đổi trạng thái của 1 phòng: PK=ROOM#<id>, begins_with(SK, LOG#), mới nhất trước
function listLogs(roomId) {
  return queryAll({
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "ROOM#" + roomId, ":sk": "LOG#" },
    ScanIndexForward: false,
  });
}

// AP3 (ghi) — Tạo phòng: TransactWrite Put Room attribute_not_exists(PK) + Hotel ADD TotalRooms 1
async function createRoom(room, now) {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            ...roomKey(room.RoomID), EntityType: "Room",
            GSI3PK: "ROOMSTATUS#" + room.Status, GSI3SK: floorKey(room.Floor, room.RoomID),
            ...room, Version: 1, CreatedAt: now, UpdatedAt: now,
          },
        },
      },
      {
        Update: {
          TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "METADATA" },
          UpdateExpression: "SET UpdatedAt = :t ADD TotalRooms :one",
          ExpressionAttributeValues: { ":t": now, ":one": 1 },
        },
      },
    ],
  }));
}

// AP3 + AP22 (ghi) — Sửa phòng có khóa lạc quan theo Version; đổi Status thì cập nhật GSI3PK và Put RoomStatusLog cùng transaction
async function updateRoom({ roomId, version, set, remove, statusChange, now }) {
  const names = {}, values = { ":v": version, ":t": now, ":one": 1 };
  const sets = ["#UpdatedAt = :t"];
  names["#UpdatedAt"] = "UpdatedAt";
  Object.entries(set).forEach(([k, v], i) => {
    names["#f" + i] = k;
    values[":f" + i] = v;
    sets.push(`#f${i} = :f${i}`);
  });
  let condition = "attribute_exists(PK) AND #Version = :v";
  names["#Version"] = "Version";
  if (statusChange) {
    names["#Status"] = "Status";
    values[":ns"] = statusChange.to;
    values[":g"] = "ROOMSTATUS#" + statusChange.to;
    values[":occ"] = "Occupied";
    sets.push("#Status = :ns", "GSI3PK = :g");
    condition += " AND #Status <> :occ";
  }
  const removes = (remove || []).map((k, i) => { names["#r" + i] = k; return "#r" + i; });
  let expr = "SET " + sets.join(", ");
  if (removes.length) expr += " REMOVE " + removes.join(", ");
  expr += " ADD #Version :one";

  const tx = [{
    Update: {
      TableName: TABLE, Key: roomKey(roomId),
      UpdateExpression: expr, ConditionExpression: condition,
      ExpressionAttributeNames: names, ExpressionAttributeValues: values,
    },
  }];
  if (statusChange) {
    const log = statusChange.log;
    tx.push({
      Put: {
        TableName: TABLE,
        ConditionExpression: "attribute_not_exists(PK)",
        Item: {
          PK: "ROOM#" + roomId, SK: `LOG#${now}#${log.LogID}`, EntityType: "RoomStatusLog",
          ...log, RoomID: roomId, ChangedAt: now, CreatedAt: now,
        },
      },
    });
  }
  await ddb.send(new TransactWriteCommand({ TransactItems: tx }));
}

// AP3 + AP22 (ghi) — Xóa phòng chưa có lịch sử: Delete Room (không Occupied) + các log + Hotel ADD TotalRooms -1
async function deleteRoom(roomId, logKeys, now) {
  const tx = [
    {
      Delete: {
        TableName: TABLE, Key: roomKey(roomId),
        ConditionExpression: "attribute_exists(PK) AND #s <> :occ",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: { ":occ": "Occupied" },
      },
    },
    ...logKeys.map((Key) => ({ Delete: { TableName: TABLE, Key } })),
    {
      Update: {
        TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "METADATA" },
        UpdateExpression: "SET UpdatedAt = :t ADD TotalRooms :minus",
        ExpressionAttributeValues: { ":t": now, ":minus": -1 },
      },
    },
  ];
  await ddb.send(new TransactWriteCommand({ TransactItems: tx }));
}

module.exports = {
  listRooms, countRooms, getRoom, roomsByStatus, nightsOn, roomNightsBetween,
  hasRoomNight, hasBooking, listLogs, createRoom, updateRoom, deleteRoom,
};
