import { expect, test } from "vitest";
import {
  buildRoomJoinPath,
  buildRoomJoinUrl,
  generateRoomCode,
  isValidRoomCode,
  parseRoomCodeInput,
} from "./codes.ts";
import { ROOM_CODE_CHARSET, ROOM_CODE_LENGTH } from "./constants.ts";

test("generateRoomCode uses charset and fixed length", () => {
  const code = generateRoomCode();
  expect(code).toHaveLength(ROOM_CODE_LENGTH);
  for (const char of code) {
    expect(ROOM_CODE_CHARSET).toContain(char);
  }
});

test("generateRoomCode is deterministic with a stubbed RNG", () => {
  let i = 0;
  const sequence = [0, 0.5, 0.999, 0.25, 0.75, 0.1];
  const code = generateRoomCode(6, () => sequence[i++]!);
  expect(code).toHaveLength(6);
  expect(isValidRoomCode(code)).toBe(true);
});

test("isValidRoomCode rejects wrong length and bad chars", () => {
  expect(isValidRoomCode("ABCDEF")).toBe(true);
  expect(isValidRoomCode("ABCDE")).toBe(false);
  expect(isValidRoomCode("ABCDEFG")).toBe(false);
  expect(isValidRoomCode("ABCDE0")).toBe(false); // 0 excluded
  expect(isValidRoomCode("ABCDEO")).toBe(false); // O excluded
  expect(isValidRoomCode("ABCDEI")).toBe(false); // I excluded
  expect(isValidRoomCode("abcdef")).toBe(false); // lowercase
});

test("parseRoomCodeInput accepts raw codes and join URLs", () => {
  expect(parseRoomCodeInput("AB3K9Q")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("  AB3K9Q  ")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("https://music.example/rooms/AB3K9Q")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("https://music.example/rooms/AB3K9Q?src=qr")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("/rooms/AB3K9Q")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("rooms/AB3K9Q")).toBe("AB3K9Q");
  expect(parseRoomCodeInput("not-a-code")).toBeNull();
  expect(parseRoomCodeInput("")).toBeNull();
});

test("buildRoomJoinUrl builds absolute join URLs", () => {
  expect(buildRoomJoinPath("AB3K9Q")).toBe("/rooms/AB3K9Q");
  expect(buildRoomJoinUrl("https://music.example", "AB3K9Q")).toBe(
    "https://music.example/rooms/AB3K9Q",
  );
  expect(buildRoomJoinUrl("https://music.example/", "AB3K9Q")).toBe(
    "https://music.example/rooms/AB3K9Q",
  );
});
