import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  getDocs,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Group } from "../app/components/types";

const LOCAL_GROUPS_KEY = "splitwise_groups";

function groupsCollection(uid: string) {
  return collection(db, "users", uid, "groups");
}

export function subscribeToUserGroups(
  uid: string,
  onChange: (groups: Group[]) => void,
  onError?: (error: Error) => void,
) {
  return onSnapshot(
    groupsCollection(uid),
    (snapshot) => {
      const groups = snapshot.docs.map((d) => d.data() as Group);
      groups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onChange(groups);
    },
    (err) => onError?.(err),
  );
}

export async function saveGroup(uid: string, group: Group): Promise<void> {
  await setDoc(doc(groupsCollection(uid), group.id), group);
}

export async function migrateLocalGroupsToFirestore(uid: string): Promise<void> {
  const raw = localStorage.getItem(LOCAL_GROUPS_KEY);
  if (!raw) return;

  const existing = await getDocs(groupsCollection(uid));
  if (!existing.empty) return;

  try {
    const groups: Group[] = JSON.parse(raw);
    await Promise.all(groups.map((g) => saveGroup(uid, g)));
    localStorage.removeItem(LOCAL_GROUPS_KEY);
  } catch {
    // Ignore corrupt local data
  }
}
