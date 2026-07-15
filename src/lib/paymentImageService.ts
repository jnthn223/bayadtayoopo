import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import { db, finishFirestoreWrite } from "./firebase";

const MAX_DATA_URL_LENGTH = 700_000;
const MAX_DIMENSION = 1200;

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number,
): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Unable to process image"))),
      type,
      quality,
    ),
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Unable to read image"));
    reader.readAsDataURL(blob);
  });
}

async function compressImage(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file");

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to process image");
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();

  let dataUrl = await blobToDataUrl(await canvasToBlob(canvas, "image/webp", 0.82));
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    dataUrl = await blobToDataUrl(await canvasToBlob(canvas, "image/jpeg", 0.62));
  }
  if (dataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error("Image is too detailed. Choose a smaller image or screenshot.");
  }
  return dataUrl;
}

export async function savePaymentImage(
  groupId: string,
  imageId: string,
  ownerUid: string,
  kind: "qr-code" | "payment-proof",
  file: File,
): Promise<void> {
  const dataUrl = await compressImage(file);
  await finishFirestoreWrite(
    setDoc(doc(db, "groups", groupId, "paymentImages", imageId), {
      dataUrl,
      ownerUid,
      kind,
      createdAt: new Date().toISOString(),
    }),
  );
}

export async function loadPaymentImage(groupId: string, imageId: string): Promise<string> {
  const snapshot = await getDoc(
    doc(db, "groups", groupId, "paymentImages", imageId),
  );
  const image = snapshot.data();
  if (!snapshot.exists() || typeof image?.dataUrl !== "string") {
    throw new Error("Image is unavailable");
  }
  return image.dataUrl;
}

export async function deletePaymentImage(groupId: string, imageId: string): Promise<void> {
  await finishFirestoreWrite(
    deleteDoc(doc(db, "groups", groupId, "paymentImages", imageId)),
  );
}
