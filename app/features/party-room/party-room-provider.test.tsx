/**
 * @vitest-environment jsdom
 */
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeActiveRoomCode } from "./api.client.ts";
import { PartyRoomProvider, usePartyRoom } from "./party-room-provider.tsx";

vi.mock("#app/utils/user.ts", () => ({
  useOptionalUser: () => null,
}));

function LeaveOnMount() {
  const { leave } = usePartyRoom();
  useEffect(() => {
    void leave();
  }, [leave]);
  return null;
}

describe("PartyRoomProvider leave before snapshot", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    sessionStorage.clear();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("POSTs leave using the sessionStorage code while GET snapshot is still in flight", async () => {
    writeActiveRoomCode("AB3K9Q");
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${url}`);
      if (url.includes("/leave")) {
        return new Response(JSON.stringify({ left: true, remaining: 0 }), { status: 200 });
      }
      // Keep the snapshot GET pending so roomCodeRef stays null (guest join race).
      await new Promise(() => {});
      return new Response("{}", { status: 200 });
    }) as typeof fetch;

    render(
      <PartyRoomProvider>
        <LeaveOnMount />
      </PartyRoomProvider>,
    );

    await waitFor(() => {
      expect(calls).toContain("POST /api/rooms/AB3K9Q/leave");
    });
  });
});
