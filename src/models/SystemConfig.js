import { db } from "./db.js";

export async function getSystemConfig(key) {
  const record = await db.systemConfig.findUnique({ where: { key } });
  return record ? record.value : null;
}

export async function setSystemConfig(key, value) {
  await db.systemConfig.upsert({
    where: { key },
    update: { value, updatedAt: new Date() },
    create: { key, value },
  });
}