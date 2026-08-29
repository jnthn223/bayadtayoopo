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
import { normalizeNotificationPreferences } from "../app/components/notifications";

// ─── User document ─────────────────────────────────────────────────────────

async function getUserGroupIds(uid: string): Promise<string[]> {
  const snapshot = await getDoc(doc(db, "users", uid));
  const groupIds = snapshot.data()?.groupIds;
  if (Array.isArray(groupIds)) {
    return [...new Set(groupIds.filter((id): id is string => typeof id === "string"))];
  }

  // Firestore rules require every user document to have this array. Repair
  // accounts whose document was deleted or manually recreated without it.
  // The empty array transform is atomic, so it cannot overwrite a group ID
  // being added by a concurrent invite/join flow.
  await finishFirestoreWrite(
    setDoc(doc(db, "users", uid), { groupIds: arrayUnion() }, { merge: true }),
  );
  return [];
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
  const now = new Date().toISOString();
  const avatarSeed =
    typeof user.avatarSeed === "string"
      ? user.avatarSeed
      : crypto.randomUUID();
  const notificationReadAt =
    typeof user.notificationReadAt === "string"
      ? user.notificationReadAt
      : now;

  const profileRepairs: Record<string, unknown> = {};
  if (!Array.isArray(user.groupIds)) profileRepairs.groupIds = arrayUnion();
  if (typeof user.avatarSeed !== "string") profileRepairs.avatarSeed = avatarSeed;
  if (typeof user.notificationReadAt !== "string") {
    profileRepairs.notificationReadAt = notificationReadAt;
  }

  if (Object.keys(profileRepairs).length > 0) {
    await finishFirestoreWrite(
      setDoc(
        doc(db, "users", uid),
        profileRepairs,
        { merge: true },
      ),
    );
  }

  return {
    name: typeof user.name === "string" ? user.name : undefined,
    color: typeof user.color === "string" ? user.color : undefined,
    avatarSeed,
    profileImageVersion:
      typeof user.profileImageVersion === "string"
        ? user.profileImageVersion
        : undefined,
    notificationReadAt,
    notificationPreferences: normalizeNotificationPreferences(
      typeof user.notificationPreferences === "object" &&
        user.notificationPreferences !== null
        ? (user.notificationPreferences as UserProfile["notificationPreferences"])
        : undefined,
    ),
  };
}

export async function saveUserProfile(uid: string, profile: UserProfile): Promise<void> {
  const definedProfile = Object.fromEntries(
    Object.entries(profile).filter(([, value]) => value !== undefined),
  );
  await finishFirestoreWrite(
    setDoc(doc(db, "users", uid), definedProfile, { merge: true }),
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

  // A deleted group can remain in another member's user document. Firestore
  // correctly rejects that group's read, but it must not prevent the user's
  // other groups from loading.
  const snapshots = await Promise.all(
    groupIds.map(async (id) => {
      try {
        return { id, snapshot: await getDoc(doc(db, "groups", id)) };
      } catch {
        // Continue loading the account even when a single reference is stale.
        return { id, snapshot: null };
      }
    }),
  );

  const staleGroupIds = snapshots.flatMap(({ id, snapshot }) => {
    // Do not remove a reference after a transient network/cache failure.
    if (!snapshot) return [];
    if (!snapshot.exists() || snapshot.data().deleted) return [id];
    const group = unpackGroup(snapshot.data());
    return group?.members.some(
      (member) => member.id === uid || member.uid === uid,
    )
      ? []
      : [id];
  });
  if (staleGroupIds.length > 0) {
    // A group is shared, but each user owns their own reference list. Clean up
    // deleted/missing references as soon as that account next opens the app.
    void finishFirestoreWrite(
      setDoc(
        doc(db, "users", uid),
        { groupIds: arrayRemove(...staleGroupIds) },
        { merge: true },
      ),
    ).catch((error) => console.warn("Unable to clean stale group references", error));
  }

  return snapshots
    .map(({ snapshot }) =>
      snapshot?.exists() && !snapshot.data().deleted
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
  profileImageVersion?: string,
  claimMemberId?: string,
  claimCode?: string,
  requestedPendingMemberId?: string,
): Promise<Group | null> {
  const snapshot = await getDoc(doc(db, "groups", groupId));
  if (!snapshot.exists() || snapshot.data().deleted) return null;

  const group = unpackGroup(snapshot.data());
  if (!group) return null;

  const alreadyMember = group.members.some((m) => (m.uid ?? m.id) === uid);
  if (!alreadyMember) {
    if (claimMemberId) {
      const joinedAt = new Date().toISOString();
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
              profileImageVersion,
              claimCode: undefined,
              claimedFromPlaceholder: true,
              joinedAt,
            }
          : member,
      );
    } else {
      const joinedAt = new Date().toISOString();
      const requestedPendingMember = requestedPendingMemberId
        ? group.members.find(
          (member) => member.id === requestedPendingMemberId && !member.uid,
        )
        : undefined;
      if (requestedPendingMember && group.autoApproveSimilarNameClaims) {
        group.members = group.members.map((member) =>
          member.id === requestedPendingMember.id
            ? {
                ...member,
                uid,
                name: memberName,
                color: memberColor,
                avatarSeed,
                profileImageVersion,
                claimCode: undefined,
                claimedFromPlaceholder: true,
                joinedAt,
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
          profileImageVersion,
          joinedAt,
        };
        group.members = [...group.members, newMember];
        if (requestedPendingMember) {
          group.memberClaimRequests = [
            ...(group.memberClaimRequests ?? []),
            {
              id: generateId(),
              pendingMemberId: requestedPendingMember.id,
              requestingMemberId: newMember.id,
              pendingMemberName: requestedPendingMember.name,
              requestingMemberName: newMember.name,
              status: "pending",
              requestedAt: joinedAt,
            },
          ];
        }
      }
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
