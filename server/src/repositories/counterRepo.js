const { UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../config/db");
const { isoNow } = require("../utils/time");

// Bổ sung ngoài mục 5 (yêu cầu đề bài): sinh mã kế tiếp — UpdateItem PK=COUNTER, SK=<name>, ADD Seq 1, ReturnValues UPDATED_NEW
async function nextId(name, prefix, width) {
  const r = await ddb.send(new UpdateCommand({
    TableName: TABLE,
    Key: { PK: "COUNTER", SK: name },
    UpdateExpression: "SET EntityType = if_not_exists(EntityType, :e), UpdatedAt = :t ADD Seq :one",
    ExpressionAttributeValues: { ":one": 1, ":e": "Counter", ":t": isoNow() },
    ReturnValues: "UPDATED_NEW",
  }));
  return prefix + String(r.Attributes.Seq).padStart(width, "0");
}

module.exports = {
  nextCustomerId: () => nextId("CUSTOMER", "C", 4),
  nextBookingId: () => nextId("BOOKING", "BK", 6),
  nextPaymentId: () => nextId("PAYMENT", "P", 6),
  nextLogId: () => nextId("LOG", "L", 6),
};
