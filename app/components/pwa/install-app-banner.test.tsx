/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InstallAppBanner } from "./install-app-banner.tsx";

const pwa = vi.hoisted(() => ({
  visible: true,
  dismiss: vi.fn(),
  install: vi.fn(async () => true),
  isIos: false,
  isAndroid: true,
  canInstallNatively: true,
}));

vi.mock("#app/hooks/use-pwa-install.ts", () => ({
  usePwaInstall: () => pwa,
}));

function bannerRoot() {
  const region = screen.getByRole("region", { name: "Install app" });
  const banner = region.parentElement;
  if (!banner) throw new Error("Install banner wrapper missing");
  return banner;
}

describe("InstallAppBanner", () => {
  beforeEach(() => {
    pwa.visible = true;
    pwa.dismiss = vi.fn();
    pwa.install = vi.fn(async () => true);
    pwa.canInstallNatively = true;
  });

  test("renders nothing after the prompt is dismissed", () => {
    pwa.visible = false;
    const { container } = render(<InstallAppBanner playerVisible={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  test("stacks above the mobile nav and rests on the desktop viewport edge", () => {
    render(<InstallAppBanner playerVisible={false} />);

    const banner = bannerRoot();
    expect(banner).toHaveAttribute("data-testid", "install-app-banner");
    expect(banner).toHaveClass("fixed");
    expect(banner).toHaveClass("z-51");
    expect(banner.className).not.toMatch(/(?:^|\s)z-30(?:\s|$)/);
    expect(banner.className).toContain(
      "bottom-[calc(var(--bottom-bar-height,4rem)+env(safe-area-inset-bottom))]",
    );
    expect(banner).toHaveClass("md:bottom-0");
    expect(banner.style.bottom).toBe("");
  });

  test("stacks above the mini player and the desktop player while playback is open", () => {
    render(<InstallAppBanner playerVisible />);

    const banner = bannerRoot();
    expect(banner).toHaveClass("z-51");
    expect(banner.className).toContain("--toast-bottom-offset");
    expect(banner.className).toContain("--player-error-height");
    expect(banner.className).not.toContain("4.5rem");
    expect(banner).not.toHaveClass("md:bottom-0");
    expect(banner.style.bottom).not.toBe("4.5rem");
    expect(banner.style.bottom).not.toBe("0");
  });

  test("Not now dismisses the fixed banner", async () => {
    const user = userEvent.setup();
    render(<InstallAppBanner playerVisible={false} />);

    await user.click(screen.getByRole("button", { name: "Not now" }));
    expect(pwa.dismiss).toHaveBeenCalledOnce();
  });
});
