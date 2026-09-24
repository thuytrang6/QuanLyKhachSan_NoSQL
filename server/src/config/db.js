const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand } = require("@aws-sdk/lib-dynamodb");

const endpoint = process.env.DDB_ENDPOINT;
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
  ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
});
const ddb = DynamoDBDocumentClient.from(client, { marshallOptions: { removeUndefinedValues: true } });
const TABLE = process.env.TABLE || "HotelBookingTable";

// Query có phân trang: gom mọi trang theo LastEvaluatedKey
async function queryAll(params) {
  const items = [];
  let ExclusiveStartKey;
  do {
    const r = await ddb.send(new QueryCommand({ TableName: TABLE, ...params, ExclusiveStartKey }));
    items.push(...(r.Items || []));
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Query Select=COUNT có phân trang: cộng Count của mọi trang
async function countAll(params) {
  let count = 0, ExclusiveStartKey;
  do {
    const r = await ddb.send(new QueryCommand({ TableName: TABLE, ...params, Select: "COUNT", ExclusiveStartKey }));
    count += r.Count || 0;
    ExclusiveStartKey = r.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return count;
}

module.exports = { ddb, TABLE, queryAll, countAll };
