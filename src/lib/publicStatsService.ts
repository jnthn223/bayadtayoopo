import { doc, getDoc } from "firebase/firestore";
import { db } from "./firebase";

export interface PublicStats {
  userCount: number;
  groupCount: number;
  expenseCount: number;
  updatedAt: string;
}

export async function loadPublicStats(): Promise<PublicStats | null> {
  const snapshot = await getDoc(doc(db, "publicStats", "overview"));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (
    !Number.isFinite(data.userCount) ||
    !Number.isFinite(data.groupCount) ||
    !Number.isFinite(data.expenseCount)
  ) {
    return null;
  }
  return {
    userCount: data.userCount,
    groupCount: data.groupCount,
    expenseCount: data.expenseCount,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
  };
}
