// Bỏ các field khóa (PK/SK/GSI) và PasswordHash trước khi trả về client
const HIDDEN = new Set(["PK", "SK", "GSI1PK", "GSI1SK", "GSI2PK", "GSI2SK", "GSI3PK", "GSI3SK", "PasswordHash"]);

function clean(item) {
  if (!item) return item;
  return Object.fromEntries(Object.entries(item).filter(([k]) => !HIDDEN.has(k)));
}

module.exports = { clean };
