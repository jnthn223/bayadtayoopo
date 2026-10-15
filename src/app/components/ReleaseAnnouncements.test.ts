import { describe, expect, it } from "vitest";
import {
  announcementIsAvailable,
  CURRENT_RELEASE_ANNOUNCEMENT,
} from "./ReleaseAnnouncements";

describe("release announcement targeting", () => {
  it("shows the test release to the selected account", () => {
    expect(
      announcementIsAvailable(
        CURRENT_RELEASE_ANNOUNCEMENT,
        "APLACADORJONATHAN0@gmail.com",
      ),
    ).toBe(true);
  });

  it("keeps the test release hidden from other accounts", () => {
    expect(
      announcementIsAvailable(
        CURRENT_RELEASE_ANNOUNCEMENT,
        "someone@example.com",
      ),
    ).toBe(false);
  });
});
