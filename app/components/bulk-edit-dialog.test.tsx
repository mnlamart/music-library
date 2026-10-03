/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router";
import { beforeEach, expect, test, vi } from "vitest";
import { toast } from "#app/components/ui/use-toast.ts";
import { BulkEditDialog } from "./bulk-edit-dialog";

const mockSubmit = vi.fn();

const mockFetcher = {
  state: "idle" as "idle" | "submitting" | "loading",
  data: undefined as
    | {
        success?: boolean;
        updated?: number;
        updatedCount?: number;
        error?: string;
        errors?: Array<{ trackId: string; error: string }>;
      }
    | undefined,
  submit: mockSubmit,
};

vi.mock("react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router")>();
  return {
    ...actual,
    useFetcher: () => mockFetcher,
  };
});

vi.mock("#app/components/artist-autocomplete", () => ({
  ArtistAutocomplete: () => <div>Artist</div>,
}));

vi.mock("#app/components/ui/use-toast.ts", () => ({
  toast: vi.fn(),
}));

beforeEach(() => {
  mockFetcher.state = "idle";
  mockFetcher.data = undefined;
  mockSubmit.mockReset();
  vi.mocked(toast).mockReset();
});

function renderDialog(
  props: Partial<{
    trackIds: string[];
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
  }> = {},
) {
  const onClose = props.onClose ?? vi.fn();
  const onSuccess = props.onSuccess ?? vi.fn();
  const router = createMemoryRouter(
    [
      {
        path: "/",
        element: (
          <BulkEditDialog
            trackIds={props.trackIds ?? ["track-1", "track-2"]}
            open={props.open ?? true}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        ),
      },
    ],
    { initialEntries: ["/"] },
  );

  return { ...render(<RouterProvider router={router} />), onClose, onSuccess };
}

test("submits JSON to the bulk-edit API instead of FormData", async () => {
  const user = userEvent.setup();
  renderDialog();

  await user.type(screen.getByLabelText("Genre"), "Jazz");
  await user.type(screen.getByLabelText(/Bulk Edit Reason/), "Fix genre tags");
  await user.click(screen.getByRole("button", { name: /Apply to 2 Tracks/ }));

  expect(mockSubmit).toHaveBeenCalledTimes(1);
  const [payload, options] = mockSubmit.mock.calls[0] ?? [];

  expect(payload).not.toBeInstanceOf(FormData);
  expect(payload).toEqual({
    trackIds: ["track-1", "track-2"],
    changes: { genre: "Jazz" },
    comment: "Fix genre tags",
  });
  expect(options).toMatchObject({
    method: "POST",
    action: "/api/metadata/tracks/bulk-edit",
    encType: "application/json",
  });
});

test("does not send unsupported albumName in the changes payload", async () => {
  const user = userEvent.setup();
  renderDialog();

  const albumInput = screen.getByLabelText("Album");
  expect(albumInput).toBeDisabled();

  await user.type(screen.getByLabelText("Year"), "1999");
  await user.type(screen.getByLabelText(/Bulk Edit Reason/), "Set year");
  await user.click(screen.getByRole("button", { name: /Apply to 2 Tracks/ }));

  const [payload] = mockSubmit.mock.calls[0] ?? [];
  expect(payload.changes).toEqual({ year: 1999 });
  expect(payload.changes).not.toHaveProperty("albumName");
});

test("toasts using updatedCount from the API response", () => {
  const onSuccess = vi.fn();
  const onClose = vi.fn();
  mockFetcher.data = { success: true, updatedCount: 2 };

  renderDialog({ onSuccess, onClose });

  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Success",
      description: "2 track(s) updated successfully",
    }),
  );
  expect(onSuccess).toHaveBeenCalledTimes(1);
  expect(onClose).toHaveBeenCalledTimes(1);
});

test("shows an error toast when the API rejects the request", () => {
  mockFetcher.data = { error: "Invalid JSON body" };

  renderDialog();

  expect(toast).toHaveBeenCalledWith(
    expect.objectContaining({
      title: "Error",
      description: "Invalid JSON body",
      variant: "destructive",
    }),
  );
});
