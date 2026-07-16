// Firestore-backed group service.
// Data model:
//   /users/{uid}        → { groupIds: string[] }
//   /groups/{groupId}   → { data: JSON<Group>, memberIds: string[] }

import {
  arrayRemove,
  arrayUnion,
  doc,
  getDoc,
  onSnapshot,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db, finishFirestoreWrite } from "./firebase";
import type { Group, Member, UserProfile } from "../app/components/types";
import { compactGroupHistory } from "../app/components/groupMerge";
import { MEMBER_COLORS, generateId } from "../app/components/utils";

// ─── User document ─────────────────────────────────────────────────────────

async function getUserGroupIds(uid: string): Promise<string[]> {
  const snapshot = await getDoc(doc(db, "users", uid));
  return (snapshot.data()?.groupIds as string[] | undefined) ?? [];
}

async function getUserDocument(
  uid: string,
): Promise<Record<string, unknown>> {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.data() ?? {};
}

async function addGroupIdToUser(uid: string, groupId: string): Promise<void> {
  await finishFirestoreWrite(
    setDoc(
      doc(db, "users", uid),
      { groupIds: arrayUnion(groupId) },
      { merge: true },
    ),
  );
}

export async function loadOrCreateUserProfile(uid: string): Promise<UserProfile> {
  const user = await getUserDocument(uid);
  const avatarSeed =
    typeof user.avatarSeed === "string"
      ? user.avatarSeed
      : crypto.randomUUID();

  if (typeof user.avatarSeed !== "string") {
    await finishFirestoreWrite(
      setDoc(doc(db, "users", uid), { avatarSeed }, { merge: true }),
    );
  }

  return {
    name: typeof user.name === "string" ? user.name : undefined,
    color: typeof user.color === "string" ? user.color : undefined,
    avatarSeed,
  };
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  await finishFirestoreWrite(
    setDoc(doc(db, "users", uid), profile, { merge: true }),
  );
}

// ─── Group document ────────────────────────────────────────────────────────

function packGroup(group: Group): Record<string, unknown> {
  const compactGroup = compactGroupHistory(group);
  const admin = compactGroup.members.find(
    (m) => m.id === compactGroup.adminId || m.uid === compactGroup.adminId,
  );
  const firstMember = compactGroup.members[0];

  return {
    data: JSON.stringify(compactGroup),
    memberIds: compactGroup.members.flatMap((member) =>
      member.uid && member.claimedFromPlaceholder
        ? [member.uid, member.id]
        : [member.uid ?? member.id],
    ),
    adminUid: admin?.uid ?? admin?.id ?? firstMember?.uid ?? firstMember?.id,
    deleted: false,
    updatedAt: new Date().toISOString(),
  };
}

function unpackGroup(doc: Record<string, unknown>): Group | null {
  try {
    return JSON.parse(doc.data as string) as Group;
  } catch {
    return null;
  }
}

export function subscribeGroup(
  groupId: string,
  onChange: (group: Group | null) => void,
  onError?: (error: Error) => void,
): () => void {
  return onSnapshot(
    doc(db, "groups", groupId),
    (snapshot) => {
      if (!snapshot.exists() || snapshot.data().deleted) {
        onChange(null);
        return;
      }

      onChange(unpackGroup(snapshot.data()));
    },
    (error) => onError?.(error),
  );
}

// ─── Public API ────────────────────────────────────────────────────────────

/** Save a group to Firestore and register it for the current user. */
export async function saveGroup(group: Group, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(doc(db, "groups", group.id), packGroup(group));
  batch.set(
    doc(db, "users", uid),
    { groupIds: arrayUnion(group.id) },
    { merge: true },
  );
  await finishFirestoreWrite(batch.commit());
}

/** Load all groups the current user is a member of. */
export async function loadUserGroups(uid: string): Promise<Group[]> {
  const groupIds = await getUserGroupIds(uid);
  if (groupIds.length === 0) return [];

  const snapshots = await Promise.all(
    groupIds.map((id) => getDoc(doc(db, "groups", id))),
  );

  return snapshots
    .map((snapshot) =>
      snapshot.exists() && !snapshot.data().deleted
        ? unpackGroup(snapshot.data())
        : null,
    )
    .filter(
      (group): group is Group =>
        group !== null &&
        group.members.some((member) => member.id === uid || member.uid === uid),
    );
}

/** Fetch a single group by ID (for join flow). */
export async function fetchGroup(groupId: string): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, "groups", groupId));
  if (!snapshot.exists() || snapshot.data().deleted) return null;
  return unpackGroup(snapshot.data());
}

/**
 * Join a group: add the current user as a member (if not already),
 * write back to Firestore, and register the group under the user.
 */
export async function joinGroup(
  groupId: string,
  uid: string,
  memberName: string,
  memberColor: string,
  avatarSeed?: string,
  claimMemberId?: string,
  claimCode?: string,
): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, "groups", groupId));
  if (!snapshot.exists() || snapshot.data().deleted) return null;

  const group = unpackGroup(snapshot.data());
  if (!group) return null;

  const alreadyMember = group.members.some((m) => (m.uid ?? m.id) === uid);
  if (!alreadyMember) {
    if (claimMemberId) {
      const placeholder = group.members.find(
        (member) =>
          member.id === claimMemberId &&
          !member.uid &&
          member.claimCode === claimCode,
      );
      if (!placeholder) throw new Error("This personal invite is invalid or already claimed");
      group.members = group.members.map((member) =>
        member.id === placeholder.id
          ? {
              ...member,
              uid,
              name: memberName,
              color: memberColor,
              avatarSeed,
              claimCode: undefined,
              claimedFromPlaceholder: true,
            }
          : member,
      );
    } else {
      const newMember: Member = {
        id: generateId(),
        uid,
        name: memberName,
        color: memberColor,
        avatarSeed,
      };
      group.members = [...group.members, newMember];
    }
    await finishFirestoreWrite(
      setDoc(doc(db, "groups", group.id), packGroup(group)),
    );
  }

  await addGroupIdToUser(uid, group.id);
  return group;
}

/** Delete a group and unregister it from the user. */
export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  const batch = writeBatch(db);
  batch.set(
    doc(db, "users", uid),
    { groupIds: arrayRemove(groupId) },
    { merge: true },
  );
  batch.set(doc(db, "groups", groupId), { deleted: true }, { merge: true });
  await finishFirestoreWrite(batch.commit());
}

/** Poll for fresh group data from Firestore. */
export async function pollGroup(groupId: string): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, "groups", groupId));
  if (!snapshot.exists() || snapshot.data().deleted) return null;
  return unpackGroup(snapshot.data());
}
