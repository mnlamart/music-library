/**
 * @vitest-environment jsdom
 *
 * Unit tests for the database-quality admin page.
 */
import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { parseString } from "set-cookie-parser";
import { test, expect, beforeEach } from "vitest";
import { loader as rootLoader } from "#app/root.tsx";
import { getSessionExpirationDate, sessionKey } from "#app/utils/auth.server.ts";
import { prisma } from "#app/utils/db.server.ts";
import { authSessionStorage } from "#app/utils/session.server.ts";
import { createUser } from "#tests/db-utils.ts";
import { consoleError } from "#tests/setup/setup-test-env.ts";
import { default as DatabaseQualityRoute, loader, ErrorBoundary } from "./database-quality.tsx";

async function createAdminSession() {
  const user = await prisma.user.create({
    select: { id: true, username: true, name: true },
    data: {
      ...createUser(),
      roles: {
        connectOrCreate: {
          where: { name: "admin" },
          create: { name: "admin" },
        },
      },
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

async function createTestData() {
  const artist = await prisma.artist.create({
    data: {
      name: "Test Artist",
      normalizedName: "test-artist",
    },
  });

  const service = await prisma.service.create({
    data: {
      name: "test-service",
      displayName: "Test Service",
      baseUrl: "https://test.com",
    },
  });

  await prisma.track.createMany({
    data: [
      {
        title: "Complete Track",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "complete-1",
        duration: 180000,
        year: 2020,
        genre: "Rock",
        lyrics: "Test lyrics",
      },
      {
        title: "Track With Audio",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "audio-1",
        duration: 200000,
        year: 2021,
      },
      {
        title: "No Duration",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "no-duration-1",
        year: 2019,
      },
      {
        title: "Unknown",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "placeholder-1",
        duration: 150000,
      },
      {
        title: "Too Short",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "short-1",
        duration: 2000,
      },
      {
        title: "Invalid Year",
        artistId: artist.id,
        serviceId: service.id,
        externalId: "invalid-year-1",
        duration: 180000,
        year: 1800,
      },
    ],
  });

  const trackWithAudio = await prisma.track.findFirst({
    where: { externalId: "audio-1" },
  });
  if (trackWithAudio) {
    await prisma.trackAudioFile.create({
      data: {
        trackId: trackWithAudio.id,
        serviceId: service.id,
        objectKey: "test/audio-file.mp3",
        contentHash: "abc123",
        format: "mp3",
        fileSize: 5000000,
      },
    });
  }
}

beforeEach(async () => {
  await createTestData();
});

test("The database-quality admin page renders with health score", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  await screen.findByRole(
    "heading",
    { level: 1, name: /database quality & health/i },
    { timeout: 5000 },
  );
  await screen.findByText(/overall health score/i, {}, { timeout: 5000 });
});

test("The database-quality admin page shows completeness metrics", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  await screen.findByText(/data completeness breakdown/i, {}, { timeout: 5000 });
  await screen.findByText(/audio files/i, {}, { timeout: 5000 });
  await screen.findByText(/cover images/i, {}, { timeout: 5000 });
  await screen.findByText(/duration info/i, {}, { timeout: 5000 });
  await screen.findByText(/album metadata/i, {}, { timeout: 5000 });
  await screen.findByText(/year info/i, {}, { timeout: 5000 });
  await screen.findByText(/genre tags/i, {}, { timeout: 5000 });
  await screen.findByText(/lyrics/i, {}, { timeout: 5000 });
});

test("The database-quality admin page has tab navigation", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  const buttons = await screen.findAllByRole("link", {}, { timeout: 5000 });
  const buttonTexts = buttons.map((b) => b.textContent?.toLowerCase());

  expect(buttonTexts.some((t) => t?.includes("overview"))).toBeTruthy();
  expect(buttonTexts.some((t) => t?.includes("metadata"))).toBeTruthy();
  expect(buttonTexts.some((t) => t?.includes("storage"))).toBeTruthy();
  expect(buttonTexts.some((t) => t?.includes("duplicates"))).toBeTruthy();
  expect(buttonTexts.some((t) => t?.includes("integrity"))).toBeTruthy();
});

test("The database-quality metadata tab shows issues", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality?tab=metadata"]} />);

  await screen.findByText(/issue breakdown/i, {}, { timeout: 5000 });
  await screen.findByText(/placeholder titles/i, {}, { timeout: 5000 });
  await screen.findByText(/suspicious durations/i, {}, { timeout: 5000 });
  await screen.findByText(/missing essential data/i, {}, { timeout: 5000 });
  await screen.findByText(/invalid years/i, {}, { timeout: 5000 });
});

test("The database-quality storage tab shows statistics", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality?tab=storage"]} />);

  await screen.findByText(/total storage/i, {}, { timeout: 5000 });
  await screen.findByText(/storage by format/i, {}, { timeout: 5000 });
  await screen.findByText(/deduplication effectiveness/i, {}, { timeout: 5000 });
  await screen.findByText(/top 10 largest files/i, {}, { timeout: 5000 });
});

test("The database-quality duplicates tab links to duplicates page", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality?tab=duplicates"]} />);

  await screen.findByText(/duplicate detection/i, {}, { timeout: 5000 });
  await screen.findByText(/view duplicate tracks/i, {}, { timeout: 5000 });
});

test("The database-quality integrity tab shows confidence message", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality?tab=integrity"]} />);

  await screen.findByText(/referential integrity/i, {}, { timeout: 5000 });
  await screen.findByText(/protected by database constraints/i, {}, { timeout: 5000 });
  await screen.findByText(/confidence note/i, {}, { timeout: 5000 });
});

test("The database-quality page shows refresh button", async () => {
  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  await screen.findByRole("button", { name: /refresh metrics/i }, { timeout: 5000 });
});

test("Non-admin users get 403 error", async () => {
  consoleError.mockImplementation(() => {});

  const user = await prisma.user.create({
    select: { id: true, username: true, name: true },
    data: createUser(),
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
  const cookieHeader = new URLSearchParams({
    [parsedCookie.name]: parsedCookie.value,
  }).toString();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  await screen.findByText(/you must be an admin/i, {}, { timeout: 5000 });
});

test("The database-quality page handles empty database", async () => {
  await prisma.trackAudioFile.deleteMany({});
  await prisma.track.deleteMany({});

  const cookieHeader = await createAdminSession();

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
          path: "admin/database-quality",
          Component: DatabaseQualityRoute,
          ErrorBoundary,
          loader: async (args) => {
            args.request.headers.set("cookie", cookieHeader);
            return loader({ ...args, context: args.context });
          },
        },
      ],
    },
  ]);

  render(<App initialEntries={["/admin/database-quality"]} />);

  await screen.findByRole(
    "heading",
    { level: 1, name: /database quality & health/i },
    { timeout: 5000 },
  );
  await screen.findByText(/overall health score/i, {}, { timeout: 5000 });
});
