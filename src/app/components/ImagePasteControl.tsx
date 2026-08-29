import { useEffect, useRef, useState } from "react";
import { ClipboardPaste } from "lucide-react";

interface ClipboardImageItem {
  kind: string;
  type: string;
  getAsFile: () => File | null;
}

export function imageFilesFromClipboardItems(
  items: ArrayLike<ClipboardImageItem>,
): File[] {
  return Array.from(items)
    .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
    .map((item) => item.getAsFile())
    .filter((file): file is File => !!file);
}

async function readClipboardImages(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    throw new Error("Clipboard image access is not supported by this browser.");
  }

  const clipboardItems = await navigator.clipboard.read();
  const files: File[] = [];
  for (const clipboardItem of clipboardItems) {
    for (const type of clipboardItem.types.filter((itemType) =>
      itemType.startsWith("image/"),
    )) {
      const blob = await clipboardItem.getType(type);
      const extension = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      files.push(
        new File([blob], `pasted-image-${Date.now()}.${extension}`, {
          type,
          lastModified: Date.now(),
        }),
      );
    }
  }
  return files;
}

interface Props {
  enabled: boolean;
  onImages: (files: File[]) => void;
  onError?: (message: string) => void;
  disabled?: boolean;
  label?: string;
}

export function ImagePasteControl({
  enabled,
  onImages,
  onError,
  disabled = false,
  label = "Paste image",
}: Props) {
  const onImagesRef = useRef(onImages);
  const onErrorRef = useRef(onError);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    onImagesRef.current = onImages;
    onErrorRef.current = onError;
  }, [onImages, onError]);

  useEffect(() => {
    if (!enabled || disabled) return;

    const handlePaste = (event: ClipboardEvent) => {
      const files = imageFilesFromClipboardItems(event.clipboardData?.items ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      onImagesRef.current(files);
      onErrorRef.current?.("");
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [enabled, disabled]);

  async function pasteFromClipboard() {
    setReading(true);
    try {
      const files = await readClipboardImages();
      if (files.length === 0) {
        onError?.("There is no image in your clipboard.");
        return;
      }
      onImages(files);
      onError?.("");
    } catch {
      onError?.(
        "Clipboard access was blocked. Allow clipboard access, or press Ctrl+V / Command+V.",
      );
    } finally {
      setReading(false);
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <button
        type="button"
        disabled={disabled || reading}
        onClick={() => void pasteFromClipboard()}
        className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-2.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-accent/80 disabled:opacity-50"
      >
        <ClipboardPaste size={14} />
        {reading ? "Pasting…" : label}
      </button>
      <span className="text-[11px] text-muted-foreground">
        or press Ctrl+V / Command+V
      </span>
    </div>
  );
}
