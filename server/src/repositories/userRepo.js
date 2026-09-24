const { GetCommand, QueryCommand, TransactWriteCommand } = require("@aws-sdk/lib-dynamodb");
const { ddb, TABLE } = require("../config/db");

// AP11 — Đăng nhập khách hàng / nhân viên: GSI2 GSI2PK=EMAIL#<email>, GSI2SK=PROFILE
async function findByEmail(email) {
  const r = await ddb.send(new QueryCommand({
    TableName: TABLE, IndexName: "GSI2",
    KeyConditionExpression: "GSI2PK = :pk AND GSI2SK = :sk",
    ExpressionAttributeValues: { ":pk": "EMAIL#" + email, ":sk": "PROFILE" },
  }));
  return (r.Items && r.Items[0]) || null;
}

// AP12 — Kiểm tra email đã tồn tại: GetItem PK=UNIQUE#EMAIL#<email>, SK=UNIQUE
async function emailExists(email) {
  const r = await ddb.send(new GetCommand({
    TableName: TABLE, Key: { PK: "UNIQUE#EMAIL#" + email, SK: "UNIQUE" }, ProjectionExpression: "PK",
  }));
  return !!r.Item;
}

// AP12 (ghi) — Đăng ký: TransactWrite Put Customer + Put UniqueEmail với attribute_not_exists(PK)
async function createCustomer(customer, now) {
  await ddb.send(new TransactWriteCommand({
    TransactItems: [
      {
        Put: {
          TableName: TABLE,
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            PK: "CUSTOMER#" + customer.CustomerID, SK: "PROFILE", EntityType: "Customer",
            GSI2PK: "EMAIL#" + customer.Email, GSI2SK: "PROFILE",
            ...customer, CreatedAt: now, UpdatedAt: now,
          },
        },
      },
      {
        Put: {
          TableName: TABLE,
          ConditionExpression: "attribute_not_exists(PK)",
          Item: {
            PK: "UNIQUE#EMAIL#" + customer.Email, SK: "UNIQUE", EntityType: "UniqueEmail",
            Email: customer.Email, OwnerType: "Customer", OwnerID: customer.CustomerID, CreatedAt: now,
          },
        },
      },
    ],
  }));
}

module.exports = { findByEmail, emailExists, createCustomer };
