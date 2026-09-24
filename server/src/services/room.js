// Quản lý phòng cho admin — docx 6.3, 6.5, 7.4
const roomRepo = require("../repositories/roomRepo");
const hotelRepo = require("../repositories/hotelRepo");
const counters = require("../repositories/counterRepo");
const { isoNow } = require("../utils/time");
const { notFound, conflict, isTxCanceled } = require("../utils/errors");
const { clean } = require("../utils/clean");

const ROOM_STATUSES = ["Available", "Occupied", "Cleaning", "Maintenance", "OutOfOrder"];
const VERSION_MSG = "Dữ liệu đã bị người khác sửa, tải lại";

// Danh sách phòng cho admin: AP3 lấy toàn bộ phòng (1 item collection nhỏ), lọc rồi chia trang ở server.
// Không dùng Limit + LastEvaluatedKey vì bộ lọc tầng/loại/trạng thái chạy sau Limit -> các trang sẽ lệch số dòng
// và không biết tổng số trang.
async function listRooms({ floor, roomTypeId, status, page = 1, pageSize = 10 } = {}) {
  const rooms = await roomRepo.listRooms();
  const filtered = rooms
    .filter((r) => (floor == null || r.Floor === floor)
      && (!roomTypeId || r.RoomTypeID === roomTypeId)
      && (!status || r.Status === status))
    .sort((a, b) => a.Floor - b.Floor || a.RoomID.localeCompare(b.RoomID, undefined, { numeric: true }));
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const current = Math.min(page, totalPages); // trang vượt quá (vd. vừa xóa phòng cuối trang) -> về trang cuối
  return {
    items: filtered.slice((current - 1) * pageSize, current * pageSize).map(clean),
    total,
    page: current,
    pageSize,
    totalPages,
    floors: [...new Set(rooms.map((r) => r.Floor))].sort((a, b) => a - b), // cho dropdown lọc tầng
  };
}

async function getRoom(roomId) {
  const room = await roomRepo.getRoom(roomId);
  if (!room) throw notFound(`Không tìm thấy phòng ${roomId}`);
  return clean(room);
}

// Tạo phòng: sao chép RoomTypeName, Capacity, BasePrice, BedType, AreaM2 từ RoomType; Status Available, Version 1
async function createRoom(input) {
  const roomType = await hotelRepo.getRoomType(input.RoomTypeID);
  if (!roomType) throw notFound(`Không tìm thấy loại phòng ${input.RoomTypeID}`);
  const room = {
    RoomID: input.RoomNumber,
    RoomNumber: input.RoomNumber,
    Floor: input.Floor,
    RoomTypeID: roomType.RoomTypeID,
    RoomTypeName: roomType.Name,
    Capacity: roomType.Capacity,
    BasePrice: roomType.BasePrice,
    BedType: roomType.BedType,
    AreaM2: roomType.AreaM2,
    View: input.View,
    Amenities: input.Amenities,
    Images: input.Images.length ? input.Images : roomType.Images,
    Status: "Available",
  };
  try {
    await roomRepo.createRoom(room, isoNow());
  } catch (e) {
    if (isTxCanceled(e)) throw conflict(`Phòng ${room.RoomID} đã tồn tại`, "ROOM_EXISTS");
    throw e;
  }
  return getRoom(room.RoomID);
}

// Sửa phòng: khóa lạc quan theo Version; không đổi Status khi Occupied; đổi Status thì ghi RoomStatusLog cùng transaction
async function updateRoom(roomId, input, staff) {
  const room = await roomRepo.getRoom(roomId);
  if (!room) throw notFound(`Không tìm thấy phòng ${roomId}`);
  if (room.Version !== input.Version) throw conflict(VERSION_MSG, "VERSION_CONFLICT");

  const changingStatus = input.Status && input.Status !== room.Status;
  if (changingStatus && room.Status === "Occupied") {
    throw conflict(`Phòng ${roomId} đang có khách (Occupied), không thể đổi trạng thái`, "ROOM_OCCUPIED");
  }
  const newStatus = changingStatus ? input.Status : room.Status;
  const set = { View: input.View, Amenities: input.Amenities, Images: input.Images };
  const remove = [];
  if (newStatus === "Maintenance" && input.MaintenanceNote) set.MaintenanceNote = input.MaintenanceNote;
  else if (newStatus !== "Maintenance" && room.MaintenanceNote) remove.push("MaintenanceNote");

  let statusChange = null;
  if (changingStatus) {
    statusChange = {
      to: newStatus,
      log: {
        LogID: await counters.nextLogId(),
        FromStatus: room.Status,
        ToStatus: newStatus,
        ChangedByStaffID: staff.id,
        Reason: input.Reason || (newStatus === "Maintenance" && input.MaintenanceNote) || `Quản lý đổi trạng thái sang ${newStatus}`,
      },
    };
  }
  try {
    await roomRepo.updateRoom({ roomId, version: input.Version, set, remove, statusChange, now: isoNow() });
  } catch (e) {
    if (!isTxCanceled(e)) throw e;
    const latest = await roomRepo.getRoom(roomId);
    if (latest && latest.Version === input.Version && latest.Status === "Occupied") {
      throw conflict(`Phòng ${roomId} vừa chuyển sang Occupied, không thể đổi trạng thái`, "ROOM_OCCUPIED");
    }
    throw conflict(VERSION_MSG, "VERSION_CONFLICT");
  }
  return getRoom(roomId);
}

// Xóa phòng: chỉ khi không có booking (AP13) và không có RoomNight (AP6)
async function deleteRoom(roomId) {
  const room = await roomRepo.getRoom(roomId);
  if (!room) throw notFound(`Không tìm thấy phòng ${roomId}`);
  const [hasBooking, hasNight] = await Promise.all([roomRepo.hasBooking(roomId), roomRepo.hasRoomNight(roomId)]);
  if (hasBooking || hasNight) {
    throw conflict(`Phòng ${roomId} đã có lịch sử đặt phòng nên không thể xóa. Hãy chuyển trạng thái sang OutOfOrder để ngừng khai thác.`, "ROOM_HAS_HISTORY");
  }
  if (room.Status === "Occupied") throw conflict(`Phòng ${roomId} đang có khách, không thể xóa`, "ROOM_OCCUPIED");
  const logs = await roomRepo.listLogs(roomId);
  try {
    await roomRepo.deleteRoom(roomId, logs.map((l) => ({ PK: l.PK, SK: l.SK })), isoNow());
  } catch (e) {
    if (isTxCanceled(e)) throw conflict(VERSION_MSG, "VERSION_CONFLICT");
    throw e;
  }
  return { RoomID: roomId, deleted: true };
}

async function listLogs(roomId) {
  const [room, logs] = await Promise.all([roomRepo.getRoom(roomId), roomRepo.listLogs(roomId)]);
  if (!room) throw notFound(`Không tìm thấy phòng ${roomId}`);
  return { room: clean(room), logs: logs.map(clean) };
}

// Bảng trạng thái phòng hiện tại: AP4 cho từng trạng thái, gom theo tầng
async function statusBoard() {
  const lists = await Promise.all(ROOM_STATUSES.map((s) => roomRepo.roomsByStatus(s)));
  const rooms = lists.flat().map(clean);
  const counts = Object.fromEntries(ROOM_STATUSES.map((s, i) => [s, lists[i].length]));
  const floors = {};
  rooms.forEach((r) => { (floors[r.Floor] = floors[r.Floor] || []).push(r); });
  return {
    counts,
    total: rooms.length,
    floors: Object.keys(floors).map(Number).sort((a, b) => b - a).map((f) => ({
      floor: f,
      rooms: floors[f].sort((a, b) => a.RoomID.localeCompare(b.RoomID, undefined, { numeric: true })),
    })),
  };
}

async function listRoomTypes() {
  const types = await hotelRepo.listRoomTypes();
  return types.map(clean);
}

// Thông tin khách sạn công khai (AP1) — tên, địa chỉ, giờ nhận/trả phòng, chính sách
async function hotelInfo() {
  const h = await hotelRepo.getHotel();
  if (!h) throw notFound("Chưa có dữ liệu khách sạn, hãy chạy npm run seed");
  const { HotelName, Address, City, Phone, Email, StarRating, CheckInTime, CheckOutTime, Policies, Amenities, RatingAvg, ReviewCount, TotalRooms } = h;
  return { HotelName, Address, City, Phone, Email, StarRating, CheckInTime, CheckOutTime, Policies, Amenities, RatingAvg, ReviewCount, TotalRooms };
}

module.exports = { hotelInfo, ROOM_STATUSES, listRooms, getRoom, createRoom, updateRoom, deleteRoom, listLogs, statusBoard, listRoomTypes };
