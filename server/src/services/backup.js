const fs = require("fs");
const path = require("path");
const backupRepo = require("../repositories/backupRepo");
const { isoNow } = require("../utils/time");
const { badRequest, notFound } = require("../utils/errors");

// Định dạng kích thước file
function formatBytes(bytes) {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Tạo bản sao lưu mới từ DynamoDB hiện tại
async function createBackup() {
  backupRepo.ensureBackupDir();
  const items = await backupRepo.scanAllItems();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `backup-${timestamp}.json`;
  const filePath = path.join(backupRepo.BACKUP_DIR, filename);

  const backupData = {
    backupId: `BKP-${timestamp}`,
    createdAt: isoNow(),
    totalItems: items.length,
    description: `Sao lưu tự động ${items.length} items từ HotelBookingTable`,
    items,
  };

  fs.writeFileSync(filePath, JSON.stringify(backupData, null, 2), "utf8");

  const stat = fs.statSync(filePath);
  return {
    filename,
    backupId: backupData.backupId,
    createdAt: backupData.createdAt,
    totalItems: items.length,
    sizeBytes: stat.size,
    sizeFormatted: formatBytes(stat.size),
  };
}

// Liệt kê các bản sao lưu đã có
async function listBackups() {
  backupRepo.ensureBackupDir();
  const files = fs.readdirSync(backupRepo.BACKUP_DIR).filter((f) => f.endsWith(".json"));

  const list = files.map((filename) => {
    const filePath = path.join(backupRepo.BACKUP_DIR, filename);
    const stat = fs.statSync(filePath);
    let meta = { totalItems: 0, description: "Bản sao lưu", createdAt: stat.mtime.toISOString() };
    try {
      const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
      meta.totalItems = content.totalItems || (Array.isArray(content.items) ? content.items.length : 0);
      meta.createdAt = content.createdAt || meta.createdAt;
      meta.description = content.description || meta.description;
      meta.backupId = content.backupId;
    } catch {
      // nếu file không đọc được JSON đầy đủ
    }

    return {
      filename,
      backupId: meta.backupId || filename,
      createdAt: meta.createdAt,
      totalItems: meta.totalItems,
      sizeBytes: stat.size,
      sizeFormatted: formatBytes(stat.size),
      description: meta.description,
      isOriginal: false,
    };
  });

  // Kiểm tra file mẫu gốc
  if (fs.existsSync(backupRepo.ORIGINAL_DATA_FILE)) {
    const stat = fs.statSync(backupRepo.ORIGINAL_DATA_FILE);
    list.unshift({
      filename: "HotelBookingTable.json",
      backupId: "ORIGINAL_SEED_DATA",
      createdAt: "2026-09-24T10:00:00Z",
      totalItems: 18135,
      sizeBytes: stat.size,
      sizeFormatted: formatBytes(stat.size),
      description: "Dữ liệu mẫu ban đầu của đồ án (mốc 24/09/2026)",
      isOriginal: true,
    });
  }

  // Sắp xếp mới nhất lên đầu (trừ bản gốc)
  return list.sort((a, b) => (b.isOriginal ? -1 : 0) || b.createdAt.localeCompare(a.createdAt));
}

// Khôi phục từ file backup
async function restoreBackup(filename) {
  if (filename === "HotelBookingTable.json") {
    return resetToOriginalSeed();
  }

  const filePath = path.join(backupRepo.BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw notFound(`Không tìm thấy file sao lưu ${filename}`);
  }

  const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const items = Array.isArray(content) ? content : content.items;
  if (!items || !items.length) {
    throw badRequest("Bản sao lưu không chứa dữ liệu hợp lệ");
  }

  await backupRepo.batchWriteItems(items);

  return {
    success: true,
    message: `Đã khôi phục thành công ${items.length} items từ bản sao lưu ${filename}`,
    totalItems: items.length,
    restoredAt: isoNow(),
  };
}

// Khôi phục về dữ liệu mẫu gốc HotelBookingTable.json
async function resetToOriginalSeed() {
  const items = await backupRepo.readOriginalDataItems();
  await backupRepo.batchWriteItems(items);

  return {
    success: true,
    message: `Đã khôi phục thành công ${items.length} items từ dữ liệu mẫu gốc ban đầu`,
    totalItems: items.length,
    restoredAt: isoNow(),
  };
}

// Khôi phục từ dữ liệu JSON upload lên
async function restoreFromUploadedJson(data) {
  let items = [];
  if (Array.isArray(data)) {
    items = data;
  } else if (data && Array.isArray(data.items)) {
    items = data.items;
  } else if (data && Array.isArray(data.Items)) {
    items = data.Items;
  } else if (typeof data === "string") {
    const lines = data.split("\n").map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      try {
        const p = JSON.parse(l);
        items.push(p.Item || p);
      } catch {}
    }
  } else {
    throw badRequest("Dữ liệu JSON không đúng định dạng chứa danh sách items");
  }

  // Chuẩn hóa unwrap nếu bên trong là { Item: ... }
  items = items.map((it) => (it && it.Item ? it.Item : it));

  if (items.length === 0) {
    throw badRequest("File sao lưu không chứa item nào");
  }

  await backupRepo.batchWriteItems(items);

  // Lưu lại một bản sao trong server/backups
  backupRepo.ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `uploaded-${timestamp}.json`;
  const filePath = path.join(backupRepo.BACKUP_DIR, filename);
  fs.writeFileSync(filePath, JSON.stringify({
    backupId: `UPLOAD-${timestamp}`,
    createdAt: isoNow(),
    totalItems: items.length,
    description: `Khôi phục từ file tải lên (${items.length} items)`,
    items,
  }, null, 2), "utf8");

  return {
    success: true,
    message: `Đã khôi phục thành công ${items.length} items từ file tải lên`,
    totalItems: items.length,
    savedFilename: filename,
    restoredAt: isoNow(),
  };
}

// Xóa file backup
async function deleteBackup(filename) {
  if (filename === "HotelBookingTable.json") {
    throw badRequest("Không thể xóa file dữ liệu mẫu gốc");
  }

  const filePath = path.join(backupRepo.BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    throw notFound(`Không tìm thấy file sao lưu ${filename}`);
  }

  fs.unlinkSync(filePath);
  return { success: true, filename };
}

module.exports = {
  createBackup,
  listBackups,
  restoreBackup,
  resetToOriginalSeed,
  restoreFromUploadedJson,
  deleteBackup,
};
