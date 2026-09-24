const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE, queryAll, countAll } = require("../config/db");

// AP23 — Doanh thu theo tháng: GSI3 GSI3PK=INVMONTH#<yyyy-mm> (phân trang LastEvaluatedKey)
function invoicesByMonth(ym, fields) {
  return queryAll({
    IndexName: "GSI3",
    KeyConditionExpression: "GSI3PK = :pk",
    ExpressionAttributeValues: { ":pk": "INVMONTH#" + ym },
    ...(fields ? { ProjectionExpression: fields.map((_, i) => "#p" + i).join(", "),
      ExpressionAttributeNames: Object.fromEntries(fields.map((f, i) => ["#p" + i, f])) } : {}),
  });
}

// AP5 — Số đêm phòng đã Booked trong đêm X: GSI1 GSI1PK=NIGHT#<date>, filter Status=Booked, Select=COUNT
function countBookedNights(date) {
  return countAll({
    IndexName: "GSI1",
    KeyConditionExpression: "GSI1PK = :pk",
    FilterExpression: "#s = :b",
    ExpressionAttributeNames: { "#s": "Status" },
    ExpressionAttributeValues: { ":pk": "NIGHT#" + date, ":b": "Booked" },
  });
}

// AP28 — Đánh giá mới nhất: PK=HOTEL#MAIN, begins_with(SK, REVIEW#), ScanIndexForward=false
async function latestReviews(limit) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE, Limit: limit, ScanIndexForward: false,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: { ":pk": "HOTEL#MAIN", ":sk": "REVIEW#" },
  }));
  return r.Items || [];
}

module.exports = { invoicesByMonth, countBookedNights, latestReviews };
