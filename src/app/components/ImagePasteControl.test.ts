import { describe, expect, it, vi } from "vitest";
import { imageFilesFromClipboardItems } from "./ImagePasteControl";

describe("imageFilesFromClipboardItems", () => {
  it("keeps only image files from a mixed clipboard", () => {
    const image = new File(["image"], "receipt.png", { type: "image/png" });
    const textFile = new File(["text"], "notes.txt", { type: "text/plain" });

    const result = imageFilesFromClipboardItems([
      { kind: "string", type: "text/plain", getAsFile: vi.fn(() => null) },
      { kind: "file", type: "text/plain", getAsFile: vi.fn(() => textFile) },
      { kind: "file", type: "image/png", getAsFile: vi.fn(() => image) },
    ]);

    expect(result).toEqual([image]);
  });

  it("ignores an image item when the browser cannot provide its file", () => {
    expect(
      imageFilesFromClipboardItems([
        { kind: "file", type: "image/png", getAsFile: () => null },
      ]),
    ).toEqual([]);
  });
});
