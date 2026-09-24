// seed.js — tạo bảng HotelBookingTable (3 GSI, On-demand, Streams, TTL) và nạp dữ liệu mẫu (docx mục 10.2).
//   DynamoDB Local:  DDB_ENDPOINT=http://localhost:8000 AWS_REGION=local node seed.js
//   AWS thật:        AWS_REGION=ap-southeast-1 node seed.js
// Nếu không đặt biến môi trường, script đọc server/.env.
const fs = require("fs");
const path = require("path");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "server", ".env") });
const {
  DynamoDBClient, CreateTableCommand, DescribeTableCommand, DeleteTableCommand,
  UpdateTimeToLiveCommand, BatchWriteItemCommand, waitUntilTableExists, waitUntilTableNotExists,
} = require("@aws-sdk/client-dynamodb");

const TABLE = process.env.TABLE || "HotelBookingTable";
const DATA_FILE = path.join(__dirname, "Database", "HotelBookingTable.json");
const endpoint = process.env.DDB_ENDPOINT;
const client = new DynamoDBClient({
  region: process.env.AWS_REGION || "ap-southeast-1",
  ...(endpoint ? { endpoint, credentials: { accessKeyId: "local", secretAccessKey: "local" } } : {}),
});

// BK002314 là đơn Pending demo TTL: đặt lại ExpiresAt = lúc nạp + 15 phút (docx mục 9.3)
const TTL_DEMO_BOOKING = "BK002314";
// Bộ đếm sinh mã: tên COUNTER -> [attribute chứa mã, tiền tố]
const COUNTERS = { CUSTOMER: ["CustomerID", "C"], BOOKING: ["BookingID", "BK"], PAYMENT: ["PaymentID", "P"], LOG: ["LogID", "L"] };
const COUNTER_ENTITY = { CUSTOMER: "Customer", BOOKING: "Booking", PAYMENT: "Payment", LOG: "RoomStatusLog" };

async function tableExists() {
  try { await client.send(new DescribeTableCommand({ TableName: TABLE })); return true; }
  catch (e) { if (e.name === "ResourceNotFoundException") return false; throw e; }
}

async function createTable() {
  const gsi = (n) => ({
    IndexName: `GSI${n}`,
    KeySchema: [{ AttributeName: `GSI${n}PK`, KeyType: "HASH" }, { AttributeName: `GSI${n}SK`, KeyType: "RANGE" }],
    Projection: { ProjectionType: "ALL" },
  });
  await client.send(new CreateTableCommand({
    TableName: TABLE,
    BillingMode: "PAY_PER_REQUEST",
    AttributeDefinitions: ["PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "GSI3PK", "GSI3SK"]
      .map((AttributeName) => ({ AttributeName, AttributeType: "S" })),
    KeySchema: [{ AttributeName: "PK", KeyType: "HASH" }, { AttributeName: "SK", KeyType: "RANGE" }],
    GlobalSecondaryIndexes: [gsi(1), gsi(2), gsi(3)],
    StreamSpecification: { StreamEnabled: true, StreamViewType: "NEW_AND_OLD_IMAGES" },
  }));
  await waitUntilTableExists({ client, maxWaitTime: 120 }, { TableName: TABLE });
  try {
    await client.send(new UpdateTimeToLiveCommand({
      TableName: TABLE, TimeToLiveSpecification: { Enabled: true, AttributeName: "ExpiresAt" },
    }));
  } catch (e) { console.warn("  (bỏ qua) Không bật được TTL:", e.message); }
}

async function readItems() {
  const items = [];
  const maxSeq = { CUSTOMER: 0, BOOKING: 0, PAYMENT: 0, LOG: 0 };
  const exp = Math.floor(Date.now() / 1000) + 15 * 60;
  const rl = readline.createInterface({ input: fs.createReadStream(DATA_FILE, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const item = JSON.parse(line).Item;
    const entity = item.EntityType && item.EntityType.S;
    for (const [name, [attr]] of Object.entries(COUNTERS)) {
      if (entity === COUNTER_ENTITY[name] && item[attr]) {
        maxSeq[name] = Math.max(maxSeq[name], parseInt(item[attr].S.replace(/\D/g, ""), 10));
      }
    }
    const isDemoBooking = item.PK.S === `BOOKING#${TTL_DEMO_BOOKING}` && item.SK.S === "METADATA";
    const isDemoNight = entity === "RoomNight" && item.BookingID && item.BookingID.S === TTL_DEMO_BOOKING;
    if ((isDemoBooking || isDemoNight) && item.ExpiresAt) item.ExpiresAt = { N: String(exp) };
    items.push(item);
  }
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  for (const [name, seq] of Object.entries(maxSeq)) {
    items.push({
      PK: { S: "COUNTER" }, SK: { S: name }, EntityType: { S: "Counter" },
      Seq: { N: String(seq) }, CreatedAt: { S: now }, UpdatedAt: { S: now },
    });
  }
  return { items, maxSeq };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function writeBatch(batch) {
  let requests = batch.map((Item) => ({ PutRequest: { Item } }));
  for (let attempt = 0; requests.length; attempt++) {
    const res = await client.send(new BatchWriteItemCommand({ RequestItems: { [TABLE]: requests } }));
    requests = (res.UnprocessedItems && res.UnprocessedItems[TABLE]) || [];
    if (requests.length) await sleep(Math.min(2000, 100 * 2 ** attempt));
  }
}

// Chặn chạy 2 lệnh seed cùng lúc: DynamoDB Local (lưu đĩa) bị kẹt khóa nếu hai tiến trình cùng xóa/ghi bảng
const LOCK_FILE = path.join(__dirname, ".seed.lock");
function acquireLock() {
  try {
    fs.writeFileSync(LOCK_FILE, String(process.pid), { flag: "wx" });
  } catch {
    const pid = Number(fs.readFileSync(LOCK_FILE, "utf8"));
    let alive = false;
    try { process.kill(pid, 0); alive = true; } catch { /* tiến trình cũ đã chết */ }
    if (alive) {
      console.error(`Đang có một lệnh seed khác chạy (PID ${pid}). Đợi lệnh đó xong rồi hãy chạy lại.`);
      process.exit(1);
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid));
  }
  const release = () => { try { fs.unlinkSync(LOCK_FILE); } catch { /* đã xóa */ } };
  process.on("exit", release);
  process.on("SIGINT", () => process.exit(130));
}

async function main() {
  acquireLock();
  console.log(`Bảng: ${TABLE} @ ${endpoint || "AWS " + (process.env.AWS_REGION || "ap-southeast-1")}`);
  if (await tableExists()) {
    if (endpoint) {
      console.log("Bảng đã tồn tại trên DynamoDB Local -> xóa và tạo lại để dữ liệu sạch.");
      await client.send(new DeleteTableCommand({ TableName: TABLE }));
      await waitUntilTableNotExists({ client, maxWaitTime: 120 }, { TableName: TABLE });
      await createTable();
    } else {
      console.log("Bảng đã tồn tại trên AWS -> ghi đè item.");
    }
  } else {
    console.log("Tạo bảng (3 GSI, On-demand, Streams, TTL ExpiresAt)...");
    await createTable();
  }

  const { items, maxSeq } = await readItems();
  console.log(`Đọc ${items.length} item (gồm ${Object.keys(maxSeq).length} COUNTER: ${JSON.stringify(maxSeq)}).`);

  const batches = [];
  for (let i = 0; i < items.length; i += 25) batches.push(items.slice(i, i + 25));
  let done = 0, next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const b = batches[next++];
      await writeBatch(b);
      done += b.length;
      if (done % 2000 < 25 || done === items.length) process.stdout.write(`\r  Đã ghi ${done}/${items.length}`);
    }
  };
  await Promise.all(Array.from({ length: 8 }, worker));
  console.log(`\nXong. ${TTL_DEMO_BOOKING} giữ chỗ tới ${new Date(Date.now() + 15 * 60e3).toISOString()}.`);
}

main().catch((e) => { console.error("Seed thất bại:", e); process.exit(1); });
