import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db, finishFirestoreWrite } from "./firebase";
import { compressAvatarImage } from "./profileImageService";

const imageCache = new Map<string, Promise<string | undefined>>();

export async function saveGroupImage(
  groupId: string,
  uploaderUid: string,
  file: File,
): Promise<string> {
  const dataUrl = await compressAvatarImage(file);
  const updatedAt = `${new Date().toISOString()}-${crypto.randomUUID()}`;
  await finishFirestoreWrite(
    setDoc(doc(db, "groups", groupId, "groupImages", "avatar"), {
      dataUrl,
      uploaderUid,
      updatedAt,
    }),
  );
  clearGroupImageCache(groupId);
  return updatedAt;
}

export async function loadGroupImage(
  groupId: string,
  version: string,
): Promise<string | undefined> {
  const cacheKey = `${groupId}:${version}`;
  const existing = imageCache.get(cacheKey);
  if (existing) return existing;

  const request = getDoc(doc(db, "groups", groupId, "groupImages", "avatar"))
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

export async function deleteGroupImage(groupId: string): Promise<void> {
  await finishFirestoreWrite(
    deleteDoc(doc(db, "groups", groupId, "groupImages", "avatar")),
  );
  clearGroupImageCache(groupId);
}

function clearGroupImageCache(groupId: string): void {
  for (const key of imageCache.keys()) {
    if (key.startsWith(`${groupId}:`)) imageCache.delete(key);
  }
}
