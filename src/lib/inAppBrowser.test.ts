import { describe, expect, it } from "vitest";
import { detectInAppBrowser } from "./inAppBrowser";

describe("in-app browser detection", () => {
  it("detects Messenger on iOS", () => {
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) [FBAN/MessengerForiOS;FBAV/500.0]",
      ),
    ).toEqual({ appName: "Messenger", isIOS: true });
  });

  it("detects Instagram and generic Android webviews", () => {
    expect(detectInAppBrowser("Mozilla/5.0 (Linux; Android 15) Instagram 350.0")).toEqual({
      appName: "Instagram",
      isIOS: false,
    });
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9 Build/AP3A; wv) Version/4.0 Chrome/130 Mobile",
      ),
    ).toEqual({ appName: "this in-app browser", isIOS: false });
  });

  it("does not flag Safari or regular Chrome", () => {
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBeNull();
    expect(
      detectInAppBrowser(
        "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36",
      ),
    ).toBeNull();
  });
});
