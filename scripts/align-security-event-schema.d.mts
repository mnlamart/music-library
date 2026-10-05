import type Database from "better-sqlite3";

export const SECURITY_EVENT_MIGRATION_NAME: string;
export function alignSecurityEventSchema(
  db: Database,
  options?: { checksum?: string },
): { status: "missing" } | { status: "current" } | { status: "rebuilt"; rows: number };
