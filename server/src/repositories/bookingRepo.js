const { TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE, queryAll, countAll } = require("../config/db");

const bookingKey = (id) => ({ PK: "BOOKING#" + id, SK: "METADATA" });
const nightKey = (roomId, date) => ({ PK: "ROOM#" + roomId, SK: "NIGHT#" + date });

// Thứ tự thao tác trong transaction tạo booking — service dùng để biết điều kiện nào thất bại
const CREATE_TX = { BOOKING: 0, ROOM: 1, FIRST_NIGHT: 2 };

// AP7 — Đặt phòng không trùng lịch (docx 13.4): TransactWrite Put Booking Pending + Put RoomNight Held từng đêm + Update Voucher
async function createOnlineBooking(b, { now, nowSec, expiresAt }) {
  const k = `CHECKIN#${b.CheckInDate}#${b.BookingID}`;
  const tx = [
    {
      Put: {
        TableName: TABLE,
        ConditionExpression: "attribute_not_exists(PK)",
        Item: {
          ...bookingKey(b.BookingID), EntityType: "Booking",
          GSI1PK: "ROOM#" + b.RoomID, GSI1SK: k,
          GSI2PK: "CUSTOMER#" + b.CustomerID, GSI2SK: `BOOKING#${b.CheckInDate}#${b.BookingID}`,
          GSI3PK: "BKSTATUS#Pending", GSI3SK: k,
          ...b, BookingChannel: "Online", ProcessedByStaffID: null, Status: "Pending",
          PaidAmount: 0, BalanceDue: b.TotalPrice, ExpiresAt: expiresAt, Version: 1, CreatedAt: now, UpdatedAt: now,
        },
      },
    },
    {
      // Phòng vẫn còn và không bị ngừng khai thác (tránh xung đột với thao tác xóa/bảo trì của admin)
      ConditionCheck: {
        TableName: TABLE, Key: { PK: "HOTEL#MAIN", SK: "ROOM#" + b.RoomID },
        ConditionExpression: "attribute_exists(PK) AND NOT (#s IN (:m, :o))",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: { ":m": "Maintenance", ":o": "OutOfOrder" },
      },
    },
  ];
  for (const n of b.NightlyRates) {
    tx.push({
      Put: {
        TableName: TABLE,
        // đêm chưa ai giữ, hoặc chỉ là Held đã hết hạn mà TTL chưa kịp xóa
        ConditionExpression: "attribute_not_exists(PK) OR (#s = :held AND ExpiresAt < :now)",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: { ":held": "Held", ":now": nowSec },
        Item: {
          ...nightKey(b.RoomID, n.Date), EntityType: "RoomNight",
          GSI1PK: "NIGHT#" + n.Date, GSI1SK: `ROOMTYPE#${b.RoomTypeID}#ROOM#${b.RoomID}`,
          RoomID: b.RoomID, RoomTypeID: b.RoomTypeID, Date: n.Date, BookingID: b.BookingID,
          Price: n.Price, Status: "Held", ExpiresAt: expiresAt, CreatedAt: now,
        },
      },
    });
  }
  if (b.VoucherCode) {
    tx.push({
      Update: {
        TableName: TABLE, Key: { PK: "VOUCHER#" + b.VoucherCode, SK: "METADATA" },
        UpdateExpression: "SET UpdatedAt = :t ADD UsedCount :one",
        ConditionExpression: "IsActive = :true AND UsedCount < UsageLimit",
        ExpressionAttributeValues: { ":one": 1, ":true": true, ":t": now },
      },
    });
  }
  await ddb.send(new TransactWriteCommand({ TransactItems: tx }));
}

// AP8 — Toàn bộ hồ sơ 1 booking (Booking, Payment, Surcharge, Service, Invoice): PK=BOOKING#<id>
function getBookingCollection(bookingId) {
  return queryAll({
    KeyConditionExpression: "PK = :pk",
    ExpressionAttributeValues: { ":pk": "BOOKING#" + bookingId },
  });
}

// AP10 — Lịch sử đặt phòng của khách: GSI2 GSI2PK=CUSTOMER#<id>, begins_with(GSI2SK, BOOKING#), mới nhất trước
function listByCustomer(customerId) {
  return queryAll({
    IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk AND begins_with(GSI2SK, :sk)",
    ExpressionAttributeValues: { ":pk": "CUSTOMER#" + customerId, ":sk": "BOOKING#" },
    ScanIndexForward: false,
  });
}

// AP14/15/17 — Booking theo trạng thái: GSI3 GSI3PK=BKSTATUS#<status> [, begins_with(GSI3SK, CHECKIN#<date>)]
function listByStatus(status, checkInDate) {
  return queryAll({
    IndexName: "GSI3",
    KeyConditionExpression: checkInDate ? "GSI3PK = :pk AND begins_with(GSI3SK, :sk)" : "GSI3PK = :pk",
    ExpressionAttributeValues: { ":pk": "BKSTATUS#" + status, ...(checkInDate ? { ":sk": "CHECKIN#" + checkInDate } : {}) },
  });
}

// AP14/15/17 — Đếm booking theo trạng thái: GSI3 GSI3PK=BKSTATUS#<status>, Select=COUNT
function countByStatus(status) {
  return countAll({
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk",
    ExpressionAttributeValues: { ":pk": "BKSTATUS#" + status },
  });
}

const paymentItem = (p) => ({
  PK: "BOOKING#" + p.BookingID, SK: "PAYMENT#" + p.PaymentID, EntityType: "Payment",
  GSI3PK: "PAYDATE#" + p.PayDate, GSI3SK: `${p.PaidAt}#${p.PaymentID}`,
  PaymentID: p.PaymentID, BookingID: p.BookingID, PaymentType: p.PaymentType, Amount: p.Amount,
  PaymentMethod: p.PaymentMethod, PaymentStatus: p.PaymentStatus, PaidAt: p.PaidAt,
  ReceivedByStaffID: null, TransactionRef: p.TransactionRef, CreatedAt: p.PaidAt,
});

// AP7 + AP8 + AP9 — Thanh toán cọc (docx 8.2): Put Payment Deposit + Booking Pending→Confirmed + RoomNight Held→Booked
async function confirmDeposit(booking, payment, { now, nowSec }) {
  const tx = [
    { Put: { TableName: TABLE, ConditionExpression: "attribute_not_exists(PK)", Item: paymentItem(payment) } },
    {
      Update: {
        TableName: TABLE, Key: bookingKey(booking.BookingID),
        UpdateExpression: "SET #s = :cf, GSI3PK = :g, PaidAmount = :paid, BalanceDue = :bal, UpdatedAt = :t REMOVE ExpiresAt ADD Version :one",
        ConditionExpression: "#s = :p AND ExpiresAt > :now AND CustomerID = :c",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: {
          ":cf": "Confirmed", ":p": "Pending", ":g": "BKSTATUS#Confirmed", ":paid": payment.Amount,
          ":bal": booking.TotalPrice - payment.Amount, ":t": now, ":one": 1, ":now": nowSec, ":c": booking.CustomerID,
        },
      },
    },
    ...booking.NightlyRates.map((n) => ({
      Update: {
        TableName: TABLE, Key: nightKey(booking.RoomID, n.Date),
        UpdateExpression: "SET #s = :b, UpdatedAt = :t REMOVE ExpiresAt",
        ConditionExpression: "BookingID = :bk AND #s = :held",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: { ":b": "Booked", ":held": "Held", ":bk": booking.BookingID, ":t": now },
      },
    })),
  ];
  await ddb.send(new TransactWriteCommand({ TransactItems: tx }));
}

// AP7 + AP8 (docx 7.5) — Hủy booking Confirmed: Booking→Cancelled + Delete RoomNight + UsedCount−1 [+ Put Payment Refund]
async function cancelConfirmed(booking, { reason, refund, now }) {
  const refundAmount = refund ? refund.Amount : 0;
  const tx = [
    {
      Update: {
        TableName: TABLE, Key: bookingKey(booking.BookingID),
        UpdateExpression:
          "SET #s = :c, GSI3PK = :g, CancelledAt = :t, CancelReason = :r, CancelledBy = :by, RefundAmount = :ra, " +
          "PaidAmount = PaidAmount - :ra, BalanceDue = :zero, UpdatedAt = :t ADD Version :one",
        ConditionExpression: "#s = :cf AND Version = :v AND CustomerID = :cid",
        ExpressionAttributeNames: { "#s": "Status" },
        ExpressionAttributeValues: {
          ":c": "Cancelled", ":cf": "Confirmed", ":g": "BKSTATUS#Cancelled", ":t": now, ":r": reason,
          ":by": "Customer", ":ra": refundAmount, ":zero": 0, ":one": 1, ":v": booking.Version, ":cid": booking.CustomerID,
        },
      },
    },
    ...booking.NightlyRates.map((n) => ({
      Delete: {
        TableName: TABLE, Key: nightKey(booking.RoomID, n.Date),
        ConditionExpression: "BookingID = :bk",
        ExpressionAttributeValues: { ":bk": booking.BookingID },
      },
    })),
  ];
  if (booking.VoucherCode) {
    tx.push({
      Update: {
        TableName: TABLE, Key: { PK: "VOUCHER#" + booking.VoucherCode, SK: "METADATA" },
        UpdateExpression: "SET UpdatedAt = :t ADD UsedCount :minus",
        ConditionExpression: "attribute_exists(PK) AND UsedCount > :zero",
        ExpressionAttributeValues: { ":minus": -1, ":zero": 0, ":t": now },
      },
    });
  }
  if (refund) tx.push({ Put: { TableName: TABLE, ConditionExpression: "attribute_not_exists(PK)", Item: paymentItem(refund) } });
  await ddb.send(new TransactWriteCommand({ TransactItems: tx }));
}

module.exports = {
  CREATE_TX, createOnlineBooking, getBookingCollection, listByCustomer, listByStatus, countByStatus, confirmDeposit, cancelConfirmed,
};
