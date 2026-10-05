import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Last matching Dockerfile.dockerignore pattern wins, same as Docker's ignore rules.
 * Enough to tell whether a startup script survives the production build context.
 */
function dockerignoreExcludes(ignoreFile: string, relativePath: string): boolean {
  const normalized = relativePath.replace(/^\.\//, "").replaceAll("\\", "/");
  let excluded = false;

  for (const rawLine of ignoreFile.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    const pattern = (negated ? line.slice(1) : line).trim();
    if (dockerPatternMatches(pattern, normalized)) excluded = !negated;
  }

  return excluded;
}

function dockerPatternMatches(pattern: string, filePath: string): boolean {
  const directoryOnly = pattern.endsWith("/");
  let source = pattern;
  let anchored = false;
  if (source.startsWith("/")) {
    anchored = true;
    source = source.slice(1);
  }
  if (directoryOnly) source = source.slice(0, -1);

  const body = source
    .split("/")
    .map((segment) => {
      if (segment === "**") return ".*";
      return segment
        .replaceAll(/[.+^${}()|[\]\\]/g, "\\$&")
        .replaceAll("*", "[^/]*")
        .replaceAll("?", "[^/]");
    })
    .join("/");

  const file = anchored ? `^${body}$` : `(^|/)${body}$`;
  if (new RegExp(file).test(filePath)) return true;
  if (directoryOnly || source.endsWith("/**")) return false;
  const children = anchored ? `^${body}/` : `(^|/)${body}/`;
  return new RegExp(children).test(`${filePath}/`);
}

function startupScripts(litefs: string): string[] {
  return [...litefs.matchAll(/^\s*-\s+cmd:\s+node\s+\.\/(\S+)/gm)].map((match) => match[1] ?? "");
}

describe("production image startup scripts", () => {
  test("ships every node script LiteFS runs before the server starts", () => {
    const ignoreFile = fs.readFileSync(
      path.join(repoRoot, "other/Dockerfile.dockerignore"),
      "utf8",
    );
    const litefs = fs.readFileSync(path.join(repoRoot, "other/litefs.yml"), "utf8");
    const dockerfile = fs.readFileSync(path.join(repoRoot, "other/Dockerfile"), "utf8");
    const scripts = startupScripts(litefs);

    expect(scripts).toContain("scripts/align-security-event-schema.mjs");
    for (const script of scripts) {
      expect(dockerignoreExcludes(ignoreFile, script), script).toBe(false);
      expect(fs.existsSync(path.join(repoRoot, script)), script).toBe(true);
      expect(dockerfile, script).toContain(script);
    }
  });
});
