import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db, finishFirestoreWrite } from "./firebase";

const PROFILE_IMAGE_SIZE = 128;
const MAX_DATA_URL_LENGTH = 40_000;
const imageCache = new Map<string, Promise<string | undefined>>();

function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  type: string,
  quality: number,
): string {
  return canvas.toDataURL(type, quality);
}

async function loadImage(file: File): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = objectUrl;
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export async function compressAvatarImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose a photo from your device.");
  }

  const image = await loadImage(file);
  const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
  if (!sourceSize) throw new Error("That photo could not be read.");

  const sourceX = (image.naturalWidth - sourceSize) / 2;
  const sourceY = (image.naturalHeight - sourceSize) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = PROFILE_IMAGE_SIZE;
  canvas.height = PROFILE_IMAGE_SIZE;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Your browser could not resize that photo.");

  context.drawImage(
    image,
    sourceX,
    sourceY,
    sourceSize,
    sourceSize,
    0,
    0,
    PROFILE_IMAGE_SIZE,
    PROFILE_IMAGE_SIZE,
  );

  let dataUrl = canvasToDataUrl(canvas, "image/webp", 0.52);
  if (!dataUrl.startsWith("data:image/webp") || dataUrl.length > MAX_DATA_URL_LENGTH) {
    dataUrl = canvasToDataUrl(canvas, "image/jpeg", 0.42);
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("That photo is too detailed. Try a simpler or cropped photo.");
  }
  return dataUrl;
}

export async function saveProfileImage(uid: string, file: File): Promise<string> {
  const dataUrl = await compressAvatarImage(file);
  const updatedAt = `${new Date().toISOString()}-${crypto.randomUUID()}`;
  await finishFirestoreWrite(
    setDoc(doc(db, "profileImages", uid), {
      dataUrl,
      ownerUid: uid,
      updatedAt,
    }),
  );
  clearProfileImageCache(uid);
  return updatedAt;
}

export async function loadProfileImage(
  uid: string,
  version: string,
): Promise<string | undefined> {
  const cacheKey = `${uid}:${version}`;
  const existing = imageCache.get(cacheKey);
  if (existing) return existing;

  const request = getDoc(doc(db, "profileImages", uid))
    .then((snapshot) => {
      const data = snapshot.data();
      return data?.updatedAt === version && typeof data.dataUrl === "string"
        ? data.dataUrl
        : undefined;
    })
    .catch(() => undefined);
  imageCache.set(cacheKey, request);
  return request;
}

export async function deleteProfileImage(uid: string): Promise<void> {
  await finishFirestoreWrite(deleteDoc(doc(db, "profileImages", uid)));
  clearProfileImageCache(uid);
}

export function clearProfileImageCache(uid: string): void {
  for (const key of imageCache.keys()) {
    if (key.startsWith(`${uid}:`)) imageCache.delete(key);
  }
}
