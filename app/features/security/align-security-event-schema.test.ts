import Database from "better-sqlite3";
import { describe, expect, test } from "vitest";
import {
  SECURITY_EVENT_MIGRATION_NAME,
  alignSecurityEventSchema,
} from "../../../scripts/align-security-event-schema.mjs";

const CHECKSUM = "new-checksum";

function columnNames(db: InstanceType<typeof Database>): string[] {
  return db
    .prepare("SELECT name FROM pragma_table_info('SecurityEvent')")
    .all()
    .map((row) => (row as { name: string }).name);
}

function createMigrationsTable(db: InstanceType<typeof Database>, checksum: string) {
  db.exec(`
    CREATE TABLE _prisma_migrations (
      id TEXT PRIMARY KEY,
      checksum TEXT NOT NULL,
      migration_name TEXT NOT NULL
    );
  `);
  db.prepare("INSERT INTO _prisma_migrations (id, checksum, migration_name) VALUES (?, ?, ?)").run(
    "mig-1",
    checksum,
    SECURITY_EVENT_MIGRATION_NAME,
  );
}

describe("alignSecurityEventSchema", () => {
  test("rebuilds the applied migration shape and keeps existing rows", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE User (id TEXT PRIMARY KEY);
      INSERT INTO User (id) VALUES ('user-1');
      CREATE TABLE SecurityEvent (
        id TEXT NOT NULL PRIMARY KEY,
        type TEXT NOT NULL,
        userId TEXT,
        ipHash TEXT NOT NULL,
        userAgent TEXT,
        metadata TEXT,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO SecurityEvent (id, type, userId, ipHash, userAgent, metadata, createdAt)
      VALUES
        ('evt-1', 'login_failed', 'user-1', 'abc123', 'Mozilla', '{"reason":"invalid"}', '2026-09-01 00:00:00'),
        ('evt-2', 'login_success', 'missing-user', 'def456', NULL, NULL, '2026-09-02 00:00:00');
    `);
    createMigrationsTable(db, "old-checksum");

    const result = alignSecurityEventSchema(db, { checksum: CHECKSUM });

    expect(result).toEqual({ status: "rebuilt", rows: 2 });
    expect(columnNames(db)).toEqual([
      "id",
      "eventType",
      "ipHash",
      "userId",
      "targetUserId",
      "metadata",
      "perpetual",
      "createdAt",
    ]);

    const rows = db
      .prepare(
        "SELECT id, eventType, ipHash, userId, targetUserId, metadata, perpetual, createdAt FROM SecurityEvent ORDER BY id",
      )
      .all() as Array<Record<string, unknown>>;
    expect(rows).toEqual([
      {
        id: "evt-1",
        eventType: "login_failed",
        ipHash: "abc123",
        userId: "user-1",
        targetUserId: null,
        metadata: JSON.stringify({ reason: "invalid", userAgent: "Mozilla" }),
        perpetual: 0,
        createdAt: "2026-09-01 00:00:00",
      },
      {
        id: "evt-2",
        eventType: "login_success",
        ipHash: "def456",
        userId: null,
        targetUserId: null,
        metadata: null,
        perpetual: 0,
        createdAt: "2026-09-02 00:00:00",
      },
    ]);
    expect(
      db
        .prepare("SELECT checksum FROM _prisma_migrations WHERE migration_name = ?")
        .get(SECURITY_EVENT_MIGRATION_NAME),
    ).toEqual({ checksum: CHECKSUM });

    const again = alignSecurityEventSchema(db, { checksum: CHECKSUM });
    expect(again).toEqual({ status: "current" });
    expect(db.prepare("SELECT COUNT(*) AS count FROM SecurityEvent").get()).toEqual({ count: 2 });
    db.close();
  });

  test("leaves the current schema in place and updates a stale checksum", () => {
    const db = new Database(":memory:");
    db.exec(`
      CREATE TABLE User (id TEXT PRIMARY KEY);
      INSERT INTO User (id) VALUES ('user-1');
      CREATE TABLE SecurityEvent (
        id TEXT NOT NULL PRIMARY KEY,
        eventType TEXT NOT NULL,
        ipHash TEXT,
        userId TEXT,
        targetUserId TEXT,
        metadata TEXT,
        perpetual INTEGER NOT NULL DEFAULT 0,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT SecurityEvent_userId_fkey FOREIGN KEY (userId) REFERENCES User (id) ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT SecurityEvent_targetUserId_fkey FOREIGN KEY (targetUserId) REFERENCES User (id) ON DELETE SET NULL ON UPDATE CASCADE
      );
      INSERT INTO SecurityEvent (id, eventType, userId, targetUserId, metadata, perpetual)
      VALUES ('evt-9', 'account_created', 'user-1', 'user-1', '{"username":"kody"}', 1);
    `);
    createMigrationsTable(db, "old-checksum");

    expect(alignSecurityEventSchema(db, { checksum: CHECKSUM })).toEqual({ status: "current" });
    expect(
      db.prepare("SELECT id, eventType, perpetual, metadata FROM SecurityEvent").get(),
    ).toEqual({
      id: "evt-9",
      eventType: "account_created",
      perpetual: 1,
      metadata: '{"username":"kody"}',
    });
    expect(
      db
        .prepare("SELECT checksum FROM _prisma_migrations WHERE migration_name = ?")
        .get(SECURITY_EVENT_MIGRATION_NAME),
    ).toEqual({ checksum: CHECKSUM });
    db.close();
  });

  test("does nothing when the table is absent", () => {
    const db = new Database(":memory:");
    expect(alignSecurityEventSchema(db)).toEqual({ status: "missing" });
    db.close();
  });
});
