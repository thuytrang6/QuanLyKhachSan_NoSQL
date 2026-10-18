const fs = require("fs");
const path = require("path");
const readline = require("readline");
const { ScanCommand } = require("@aws-sdk/lib-dynamodb");
const { BatchWriteItemCommand } = require("@aws-sdk/client-dynamodb");
const { marshall, unmarshall } = require("@aws-sdk/util-dynamodb");
const { ddb, TABLE } = require("../config/db");

const BACKUP_DIR = path.join(__dirname, "..", "..", "backups");
const ORIGINAL_DATA_FILE = path.join(__dirname, "..", "..", "..", "Database", "HotelBookingTable.json");

function ensureBackupDir() {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

// Quét toàn bộ bảng để sao lưu
async function scanAllItems() {
  const items = [];
  let ExclusiveStartKey;
  do {
    const res = await ddb.send(new ScanCommand({
      TableName: TABLE,
      ExclusiveStartKey,
    }));
    if (res.Items && res.Items.length) {
      items.push(...res.Items);
    }
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

// Ghi lô items vào DynamoDB
async function batchWriteItems(items) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const BATCH_SIZE = 25;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const chunk = items.slice(i, i + BATCH_SIZE);
    let requests = chunk.map((item) => ({
      PutRequest: {
        Item: item.M ? item : marshall(item, { removeUndefinedValues: true }),
      },
    }));

    for (let attempt = 0; requests.length > 0; attempt++) {
      const res = await ddb.send(new BatchWriteItemCommand({
        RequestItems: { [TABLE]: requests },
      }));
      requests = (res.UnprocessedItems && res.UnprocessedItems[TABLE]) || [];
      if (requests.length) {
        await sleep(Math.min(2000, 100 * 2 ** attempt));
      }
    }
  }
}

// Đọc file dữ liệu gốc HotelBookingTable.json
async function readOriginalDataItems() {
  if (!fs.existsSync(ORIGINAL_DATA_FILE)) {
    throw new Error("Không tìm thấy file dữ liệu mẫu HotelBookingTable.json");
  }
  const items = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(ORIGINAL_DATA_FILE, "utf8"),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line);
    if (parsed.Item) {
      items.push(parsed.Item);
    }
  }
  return items;
}

module.exports = {
  BACKUP_DIR,
  ORIGINAL_DATA_FILE,
  ensureBackupDir,
  scanAllItems,
  batchWriteItems,
  readOriginalDataItems,
};
