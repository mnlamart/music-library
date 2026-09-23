import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { data } from "react-router";
import { type Route } from "./+types/debug-log";

const LOG_PATH = "/opt/cursor/logs/debug.log";

/**
 * Temporary debug ingest for agent instrumentation (browser → NDJSON file).
 * Remove after the duplicate-dialog investigation.
 */
export async function action({ request }: Route.ActionArgs) {
  try {
    const payload = await request.json();
    mkdirSync(dirname(LOG_PATH), { recursive: true });
    writeFileSync(LOG_PATH, `${JSON.stringify(payload)}\n`, { flag: "a" });
    return data({ ok: true });
  } catch {
    return data({ ok: false }, { status: 500 });
  }
}
