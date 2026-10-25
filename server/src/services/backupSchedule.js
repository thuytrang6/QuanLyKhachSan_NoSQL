const fs = require("fs");
const path = require("path");
const backupService = require("./backup");
const backupRepo = require("../repositories/backupRepo");
const { isoNow } = require("../utils/time");

const CONFIG_FILE = path.join(backupRepo.BACKUP_DIR, "schedule-config.json");

// Mốc gốc: 02:00 Chủ nhật 04/01/2026 giờ Việt Nam. Các chu kỳ 6/12/24/168h đều chia hết 1 tuần,
// nên lần chạy luôn rơi đúng 02:00 (thêm 08h, 14h, 20h với chu kỳ ngắn), chu kỳ tuần rơi đúng Chủ nhật.
const ANCHOR_MS = Date.parse("2026-01-04T02:00:00+07:00");

const FREQUENCY_LABELS = {
  6: "Mỗi 6 giờ (02h, 08h, 14h, 20h)",
  12: "Mỗi 12 giờ (02h, 14h)",
  24: "Hàng ngày (02:00)",
  168: "Hàng tuần (02:00 Chủ nhật)",
};

// Mốc chạy kế tiếp sau thời điểm `from` theo chu kỳ đã chọn
function computeNextRunAt(frequencyHours, from = Date.now()) {
  const period = frequencyHours * 3600 * 1000;
  const k = Math.floor((from - ANCHOR_MS) / period) + 1;
  return new Date(ANCHOR_MS + k * period).toISOString();
}

const DEFAULT_CONFIG = {
  enabled: true,
  frequencyHours: 168, // Mặc định hàng tuần, 02:00 sáng Chủ nhật
  frequencyLabel: FREQUENCY_LABELS[168],
  lastRunAt: null,
  nextRunAt: computeNextRunAt(168),
  retentionDays: 7, // Lưu giữ các bản sao lưu trong 7 ngày
};

function readConfig() {
  backupRepo.ensureBackupDir();
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(cfg) {
  backupRepo.ensureBackupDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2), "utf8");
}

let timer = null;

async function checkAndRunScheduledBackup() {
  const cfg = readConfig();
  if (!cfg.enabled) return;

  const now = Date.now();
  const nextTime = cfg.nextRunAt ? new Date(cfg.nextRunAt).getTime() : 0;

  if (now >= nextTime) {
    console.log("[Scheduler] Đang thực hiện sao lưu tự động theo lịch định kỳ...");
    try {
      const res = await backupService.createBackup();
      console.log(`[Scheduler] Sao lưu tự động thành công: ${res.filename} (${res.totalItems} items)`);
      cfg.lastRunAt = isoNow();
      cfg.nextRunAt = computeNextRunAt(cfg.frequencyHours, now);
      saveConfig(cfg);
    } catch (err) {
      console.error("[Scheduler] Lỗi khi sao lưu tự động:", err.message);
    }
  }
}

function initScheduler() {
  if (timer) clearInterval(timer);
  // Kiểm tra mỗi phút một lần
  timer = setInterval(checkAndRunScheduledBackup, 60 * 1000);
  console.log("[Scheduler] Đã kích hoạt tiến trình kiểm tra sao lưu tự động theo lịch (mỗi 1 phút).");
}

function getSchedule() {
  return readConfig();
}

function updateSchedule({ enabled, frequencyHours, retentionDays }) {
  const cfg = readConfig();
  if (enabled !== undefined) cfg.enabled = Boolean(enabled);
  if (frequencyHours !== undefined) {
    const h = Number(frequencyHours);
    if (FREQUENCY_LABELS[h]) {
      cfg.frequencyHours = h;
      cfg.frequencyLabel = FREQUENCY_LABELS[h];
    }
  }
  // Luôn tính lại theo mốc cố định, kể cả khi chỉ bật lại lịch (tránh chạy bù ngay lập tức)
  cfg.nextRunAt = computeNextRunAt(cfg.frequencyHours);
  if (retentionDays !== undefined) cfg.retentionDays = Number(retentionDays) || 7;
  saveConfig(cfg);
  return cfg;
}

module.exports = {
  computeNextRunAt,
  initScheduler,
  getSchedule,
  updateSchedule,
};
