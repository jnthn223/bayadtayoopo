// Firestore-backed group service.
// Data model:
//   /users/{uid}        → { groupIds: string[] }
//   /groups/{groupId}   → { data: JSON<Group>, memberIds: string[] }

import { doc as fsDoc, onSnapshot } from "firebase/firestore";
import { fsGet, fsSet, fsUpdate, fsGetMultiple } from "./firebaseRest";
import { getValidIdToken } from "./auth";
import { db } from "./firebase";
import type { Group, Member, UserProfile } from "../app/components/types";
import { compactGroupHistory } from "../app/components/groupMerge";
import { MEMBER_COLORS, generateId } from "../app/components/utils";

// ─── Helpers ───────────────────────────────────────────────────────────────

async function token(): Promise<string> {
  const t = await getValidIdToken();
  if (!t) throw new Error("Not authenticated");
  return t;
}

// ─── User document ─────────────────────────────────────────────────────────

async function getUserGroupIds(uid: string, idToken: string): Promise<string[]> {
  const doc = await fsGet(`users/${uid}`, idToken);
  return (doc?.groupIds as string[] | undefined) ?? [];
}

async function getUserDocument(
  uid: string,
  idToken: string,
): Promise<Record<string, unknown>> {
  return (await fsGet(`users/${uid}`, idToken)) ?? {};
}

async function addGroupIdToUser(uid: string, groupId: string, idToken: string): Promise<void> {
  const user = await getUserDocument(uid, idToken);
  const existing = (user.groupIds as string[] | undefined) ?? [];
  if (existing.includes(groupId)) return;
  await fsSet(`users/${uid}`, { ...user, groupIds: [...existing, groupId] }, idToken);
}

async function removeGroupIdFromUser(uid: string, groupId: string, idToken: string): Promise<void> {
  const user = await getUserDocument(uid, idToken);
  const existing = (user.groupIds as string[] | undefined) ?? [];
  await fsSet(
    `users/${uid}`,
    { ...user, groupIds: existing.filter((id) => id !== groupId) },
    idToken,
  );
}

export async function loadUserProfile(uid: string): Promise<UserProfile> {
  const user = await getUserDocument(uid, await token());
  return {
    name: typeof user.name === "string" ? user.name : undefined,
    color: typeof user.color === "string" ? user.color : undefined,
    avatarSeed:
      typeof user.avatarSeed === "string" ? user.avatarSeed : undefined,
  };
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  const idToken = await token();
  const user = await getUserDocument(uid, idToken);
  await fsSet(`users/${uid}`, { ...user, ...profile, groupIds: user.groupIds ?? [] }, idToken);
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
    fsDoc(db, "groups", groupId),
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
  const idToken = await token();
  await fsSet(`groups/${group.id}`, packGroup(group), idToken);
  await addGroupIdToUser(uid, group.id, idToken);
}

/** Load all groups the current user is a member of. */
export async function loadUserGroups(uid: string): Promise<Group[]> {
  const idToken = await token();
  const groupIds = await getUserGroupIds(uid, idToken);
  if (groupIds.length === 0) return [];

  const paths = groupIds.map((id) => `groups/${id}`);
  const docs = await fsGetMultiple(paths, idToken);

  return docs
    .map((doc) => (doc ? unpackGroup(doc) : null))
    .filter((g): g is Group => g !== null);
}

/** Fetch a single group by ID (for join flow). */
export async function fetchGroup(groupId: string): Promise<Group | null> {
  const idToken = await token();
  const doc = await fsGet(`groups/${groupId}`, idToken);
  return doc ? unpackGroup(doc) : null;
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
  const idToken = await token();
  const doc = await fsGet(`groups/${groupId}`, idToken);
  if (!doc) return null;

  const group = unpackGroup(doc);
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
    await fsSet(`groups/${group.id}`, packGroup(group), idToken);
  }

  await addGroupIdToUser(uid, group.id, idToken);
  return group;
}

/** Delete a group and unregister it from the user. */
export async function deleteGroup(groupId: string, uid: string): Promise<void> {
  const idToken = await token();
  await removeGroupIdFromUser(uid, groupId, idToken);
  // Mark group as deleted (soft delete — we don't have DELETE in basic Firestore REST without admin)
  await fsUpdate(`groups/${groupId}`, { deleted: true }, idToken);
}

/** Poll for fresh group data from Firestore. */
export async function pollGroup(groupId: string): Promise<Group | null> {
  const idToken = await token();
  const doc = await fsGet(`groups/${groupId}`, idToken);
  if (!doc || doc.deleted) return null;
  return unpackGroup(doc);
}
