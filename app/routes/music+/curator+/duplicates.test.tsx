/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { parseString } from "set-cookie-parser";
import { afterEach, expect, test, vi } from "vitest";
import { loader as rootLoader } from "#app/root.tsx";
import { getSessionExpirationDate, sessionKey } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { authSessionStorage } from "#app/utils/session.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { consoleError } from "#tests/setup/setup-test-env.ts";
import { default as DuplicatesPage, loader, ErrorBoundary } from "./duplicates.tsx";

afterEach(() => {
  vi.unstubAllGlobals();
});

async function createSession(role?: "admin" | "curator") {
  const user = await prisma.user.create({
    select: { id: true },
    data: {
      ...createUser(),
      ...(role
        ? {
            roles: {
              connectOrCreate: {
                where: { name: role },
                create: { name: role },
              },
            },
          }
        : {}),
    },
  });
  const session = await prisma.session.create({
    select: { id: true },
    data: {
      expirationDate: getSessionExpirationDate(),
      userId: user.id,
    },
  });

  const authSession = await authSessionStorage.getSession();
  authSession.set(sessionKey, session.id);
  const setCookieHeader = await authSessionStorage.commitSession(authSession);
  const parsedCookie = parseString(setCookieHeader)!;
  return new URLSearchParams({
    [parsedCookie.name]: parsedCookie.value,
  }).toString();
}

function trustedOrigin() {
  const configured = process.env.SITE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  return `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

function stubDuplicateFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      return handler(url, init);
    }),
  );
}

function renderDuplicatesPage(cookieHeader: string) {
  const App = createRoutesStub([
    {
      id: "root",
      path: "/",
      loader: async (args) => {
        args.request.headers.set("cookie", cookieHeader);
        return rootLoader({ ...args, context: args.context });
      },
      HydrateFallback: () => <div>Loading...</div>,
      children: [
        {
          path: "music/curator/duplicates",
          Component: DuplicatesPage,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/music/curator/duplicates"]} />);
}

const emptyGroups = { exact: [], fuzzy: [] };

test("a signed-in non-curator sees the curators-only 403", async () => {
  consoleError.mockImplementation(() => {});
  const cookieHeader = await createSession();
  const fetchMock = vi.fn(async () =>
    Response.json(
      { error: "Forbidden", message: "Only curators and admins can edit track metadata" },
      { status: 403 },
    ),
  );
  vi.stubGlobal("fetch", fetchMock);

  renderDuplicatesPage(cookieHeader);

  await screen.findByRole("heading", { name: "Curators only" }, { timeout: 5000 });
  expect(screen.queryByText(/your library is clean/i)).toBeNull();
  expect(screen.queryByText(/no duplicates found/i)).toBeNull();
  expect(fetchMock).not.toHaveBeenCalled();
});

test("a failed duplicate lookup shows an error instead of a clean library", async () => {
  consoleError.mockImplementation(() => {});
  const cookieHeader = await createSession("curator");
  stubDuplicateFetch(
    async () => new Response("Failed to fetch artist duplicates", { status: 500 }),
  );

  renderDuplicatesPage(cookieHeader);

  await screen.findByRole("heading", { name: "Could not load duplicates" }, { timeout: 5000 });
  expect(screen.queryByText(/your library is clean/i)).toBeNull();
  expect(screen.queryByText(/no duplicates found/i)).toBeNull();
});

test("a duplicate payload without exact and fuzzy groups is an error", async () => {
  consoleError.mockImplementation(() => {});
  const cookieHeader = await createSession("curator");
  stubDuplicateFetch(async () =>
    Response.json({
      error: "Forbidden",
      message: "Only curators and admins can edit track metadata",
    }),
  );

  renderDuplicatesPage(cookieHeader);

  await screen.findByRole("heading", { name: "Could not load duplicates" }, { timeout: 5000 });
  expect(screen.queryByText(/your library is clean/i)).toBeNull();
});

test("an empty duplicate result still says no duplicates were found", async () => {
  const cookieHeader = await createSession("curator");
  stubDuplicateFetch(async () => Response.json(emptyGroups));

  renderDuplicatesPage(cookieHeader);

  await screen.findByRole("heading", { name: "No duplicates found" }, { timeout: 5000 });
  expect(screen.getByText(/your library is clean/i)).toBeTruthy();
});

test("duplicate groups from a successful lookup are shown", async () => {
  const cookieHeader = await createSession("admin");
  stubDuplicateFetch(async (url) => {
    if (url.includes("/albums")) {
      return Response.json({
        exact: [
          {
            normalizedName: "abbey road",
            artistId: "artist-1",
            artistName: "The Beatles",
            albums: [
              { id: "album-1", name: "Abbey Road", year: 1969, trackCount: 17 },
              { id: "album-2", name: "Abbey Road", year: null, trackCount: 1 },
            ],
            totalTracks: 18,
          },
        ],
        fuzzy: [],
      });
    }
    return Response.json({
      exact: [
        {
          normalizedName: "the beatles",
          artists: [
            { id: "artist-1", name: "The Beatles", trackCount: 10, albumCount: 2 },
            { id: "artist-2", name: "Beatles", trackCount: 1, albumCount: 0 },
          ],
          totalTracks: 11,
        },
      ],
      fuzzy: [],
    });
  });

  renderDuplicatesPage(cookieHeader);

  await screen.findByRole("heading", { name: "Exact Duplicate Artists" }, { timeout: 5000 });
  expect(screen.getByText("The Beatles / Beatles")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Exact Duplicate Albums" })).toBeTruthy();
  expect(screen.getByText(/Abbey Road by The Beatles/)).toBeTruthy();
  expect(screen.queryByText(/your library is clean/i)).toBeNull();
});

test("duplicate lookups use a trusted origin and only the session cookie", async () => {
  const cookieHeader = await createSession("curator");
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
    Response.json(emptyGroups),
  );
  vi.stubGlobal("fetch", fetchMock);

  const request = new Request("http://evil.example/music/curator/duplicates", {
    headers: {
      cookie: `${cookieHeader}; theme=dark`,
      authorization: "Bearer leaked-token",
      "x-forwarded-host": "evil.example",
    },
  });

  await loader({ request } as never);

  expect(fetchMock).toHaveBeenCalledTimes(2);
  const urls = fetchMock.mock.calls.map((call) => String(call[0]));
  expect(urls.sort()).toEqual(
    [
      `${trustedOrigin()}/api/curator/duplicates/albums`,
      `${trustedOrigin()}/api/curator/duplicates/artists`,
    ].sort(),
  );

  for (const call of fetchMock.mock.calls) {
    const headers = new Headers((call[1] as RequestInit | undefined)?.headers);
    expect(headers.get("cookie")).toBe(cookieHeader);
    expect(headers.get("authorization")).toBeNull();
    expect(headers.get("x-forwarded-host")).toBeNull();
  }
});
