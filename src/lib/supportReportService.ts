import { getValidIdToken } from "./auth";

export type SupportReportType = "bug" | "feedback";

export interface SupportReportInput {
  type: SupportReportType;
  subject: string;
  description: string;
  screenshot?: File;
  group?: { id: string; name: string };
}

function supportApiUrl(): string {
  const baseUrl =
    import.meta.env.VITE_SUPPORT_API_URL?.trim() ||
    import.meta.env.VITE_PUBLIC_STATS_API_URL?.trim();
  if (!baseUrl) {
    throw new Error("Support is not configured yet. Email support@whythough.space instead.");
  }
  return `${baseUrl.replace(/\/$/, "")}/support-report`;
}

async function appVersion(): Promise<string> {
  try {
    const response = await fetch("/version.json", { cache: "no-store" });
    if (!response.ok) return "Unknown";
    const version = await response.json();
    return typeof version.buildId === "string" ? version.buildId : "Unknown";
  } catch {
    return "Unknown";
  }
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That screenshot could not be read."));
    };
    image.src = url;
  });
}

async function compressScreenshot(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a PNG, JPG, or WebP screenshot.");
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error("That screenshot is too large. Choose one under 12 MB.");
  }

  const image = await loadImage(file);
  const maxDimension = 1400;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not prepare that screenshot.");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  for (const quality of [0.8, 0.68, 0.56]) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= 1_400_000) return dataUrl;
  }
  throw new Error("That screenshot is still too large after compression.");
}

export async function submitSupportReport(input: SupportReportInput): Promise<string> {
  const token = await getValidIdToken();
  if (!token) throw new Error("Please sign in again before sending your report.");

  const screenshotDataUrl = input.screenshot
    ? await compressScreenshot(input.screenshot)
    : undefined;
  const response = await fetch(supportApiUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: input.type,
      subject: input.subject,
      description: input.description,
      screenshotDataUrl,
      context: {
        appVersion: await appVersion(),
        page: window.location.pathname,
        userAgent: navigator.userAgent,
        groupId: input.group?.id,
        groupName: input.group?.name,
      },
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : "We couldn’t send your report. Please try again.",
    );
  }
  return typeof result.reference === "string" ? result.reference : "Sent";
}
