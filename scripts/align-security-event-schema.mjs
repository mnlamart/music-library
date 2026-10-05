/**
 * Manual repair for a database that applied `20260926120000_add_security_events`
 * before that file was rewritten. Prisma does not rewrite an applied migration,
 * so those databases still have `type` / `userAgent` and no `eventType` or
 * `perpetual`. Production was repaired in place. Fresh databases already match
 * the current file.
 *
 * Do not call this from LiteFS or any other boot path. `/scripts` is excluded
 * from the production image, and a failing boot command stops the machine.
 * Run it by hand against a restored pre-repair database:
 *
 *   DATABASE_PATH=/path/to/sqlite.db node ./scripts/align-security-event-schema.mjs
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

export const SECURITY_EVENT_MIGRATION_NAME = "20260926120000_add_security_events";

const MIGRATION_SQL = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "../prisma/migrations/20260926120000_add_security_events/migration.sql",
);

function tableExists(db, name) {
  return Boolean(
    db
      .prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(name),
  );
}

function columnNames(db) {
  return new Set(
    db
      .prepare("SELECT name FROM pragma_table_info('SecurityEvent')")
      .all()
      .map((row) => row.name),
  );
}

function mergedMetadata(metadata, userAgent) {
  if (typeof userAgent !== "string" || userAgent.length === 0) return metadata ?? null;
  if (metadata == null || metadata === "") return JSON.stringify({ userAgent });
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      if (!("userAgent" in parsed)) parsed.userAgent = userAgent;
      return JSON.stringify(parsed);
    }
  } catch {
    // Keep the original metadata when it is not a JSON object.
  }
  return metadata;
}

function updateChecksum(db, checksum) {
  if (!checksum || !tableExists(db, "_prisma_migrations")) return;
  db.prepare("UPDATE _prisma_migrations SET checksum = ? WHERE migration_name = ?").run(
    checksum,
    SECURITY_EVENT_MIGRATION_NAME,
  );
}

function rebuild(db) {
  const rows = db.prepare("SELECT * FROM SecurityEvent").all();
  const userStmt = tableExists(db, "User")
    ? db.prepare("SELECT 1 AS present FROM User WHERE id = ?")
    : null;

  const previousForeignKeys = db.pragma("foreign_keys", { simple: true });
  db.pragma("foreign_keys = OFF");
  try {
    const write = db.transaction(() => {
      db.exec("DROP TABLE IF EXISTS SecurityEvent_new");
      db.exec(`
        CREATE TABLE "SecurityEvent_new" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "eventType" TEXT NOT NULL,
          "ipHash" TEXT,
          "userId" TEXT,
          "targetUserId" TEXT,
          "metadata" TEXT,
          "perpetual" INTEGER NOT NULL DEFAULT 0,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "SecurityEvent_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
        );
      `);
      const insert = db.prepare(`
        INSERT INTO "SecurityEvent_new" (
          "id", "eventType", "ipHash", "userId", "targetUserId", "metadata", "perpetual", "createdAt"
        ) VALUES (?, ?, ?, ?, NULL, ?, 0, ?)
      `);
      for (const row of rows) {
        const userId = row.userId && userStmt?.get(row.userId) ? row.userId : null;
        insert.run(
          row.id,
          row.type,
          row.ipHash,
          userId,
          mergedMetadata(row.metadata, row.userAgent),
          row.createdAt,
        );
      }
      db.exec('DROP TABLE "SecurityEvent"');
      db.exec('ALTER TABLE "SecurityEvent_new" RENAME TO "SecurityEvent"');
      db.exec('CREATE INDEX "SecurityEvent_eventType_idx" ON "SecurityEvent"("eventType")');
      db.exec('CREATE INDEX "SecurityEvent_ipHash_idx" ON "SecurityEvent"("ipHash")');
      db.exec('CREATE INDEX "SecurityEvent_userId_idx" ON "SecurityEvent"("userId")');
      db.exec('CREATE INDEX "SecurityEvent_createdAt_idx" ON "SecurityEvent"("createdAt")');
      db.exec('CREATE INDEX "SecurityEvent_perpetual_idx" ON "SecurityEvent"("perpetual")');
    });
    write();
  } finally {
    db.pragma(`foreign_keys = ${previousForeignKeys ? "ON" : "OFF"}`);
  }
  return rows.length;
}

/**
 * @param {import("better-sqlite3").Database} db
 * @param {{ checksum?: string }} [options]
 */
export function alignSecurityEventSchema(db, options = {}) {
  if (!tableExists(db, "SecurityEvent")) return { status: "missing" };

  const names = columnNames(db);
  if (names.has("eventType") && names.has("perpetual")) {
    updateChecksum(db, options.checksum);
    return { status: "current" };
  }
  if (!names.has("type")) {
    throw new Error(`SecurityEvent schema is unrecognized: ${[...names].join(", ")}`);
  }

  const rows = rebuild(db);
  updateChecksum(db, options.checksum);
  return { status: "rebuilt", rows };
}

function databasePathFromEnv() {
  if (process.env.DATABASE_PATH) return process.env.DATABASE_PATH;
  const url = process.env.DATABASE_URL ?? "";
  if (url.startsWith("file:")) return url.slice("file:".length).split("?")[0];
  throw new Error("DATABASE_PATH is not set");
}

function migrationChecksum() {
  return createHash("sha256").update(fs.readFileSync(MIGRATION_SQL)).digest("hex");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const db = new Database(databasePathFromEnv(), { fileMustExist: true });
  try {
    const result = alignSecurityEventSchema(db, { checksum: migrationChecksum() });
    console.log(`SecurityEvent schema ${result.status}`);
  } finally {
    db.close();
  }
}
