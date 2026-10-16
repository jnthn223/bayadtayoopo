import type { CurrentUser, Group, Member } from "./types";

export interface DirectContact {
  key: string;
  uid?: string;
  directGroupId?: string;
  member: Member;
  sharedGroupNames: string[];
}

export function directLedgerId(uidA: string, uidB: string): string {
  return `direct_${[uidA, uidB].sort().join("_")}`;
}

export function getDirectContact(
  group: Group,
  userId: string,
): Member | undefined {
  if (group.kind !== "direct") return undefined;
  return group.members.find(
    (member) => member.uid !== userId && member.id !== userId,
  );
}

export function getDirectContacts(
  groups: Group[],
  userId: string,
): DirectContact[] {
  const contacts = new Map<string, DirectContact>();
  for (const group of groups) {
    for (const member of group.members) {
      if (!member.uid || member.uid === userId || member.removedAt) continue;
      const existing = contacts.get(member.uid);
      if (existing) {
        if (group.kind !== "direct" && !existing.sharedGroupNames.includes(group.name)) {
          existing.sharedGroupNames.push(group.name);
        }
      } else {
        contacts.set(member.uid, {
          key: member.uid,
          uid: member.uid,
          member,
          sharedGroupNames: group.kind === "direct" ? [] : [group.name],
        });
      }
    }
  }
  for (const group of groups) {
    if (group.kind !== "direct" || ["declined", "withdrawn"].includes(group.directStatus ?? "")) continue;
    const member = getDirectContact(group, userId);
    if (!member || member.uid || member.removedAt) continue;
    if (group.directContactUid && contacts.has(group.directContactUid)) continue;
    contacts.set(`temporary:${member.id}`, {
      key: `temporary:${member.id}`,
      directGroupId: group.id,
      member,
      sharedGroupNames: [],
    });
  }
  return [...contacts.values()].sort((a, b) =>
    a.member.name.localeCompare(b.member.name),
  );
}

export function createDirectLedger(
  user: CurrentUser,
  contact: Member,
  currency: string,
  now = new Date().toISOString(),
): Group {
  const contactKey = contact.uid ?? contact.id;
  const participantUids = [user.id];
  const placeholderId = `pending_${crypto.randomUUID()}`;
  return {
    id: directLedgerId(user.id, contactKey),
    name: `${user.name} & ${contact.name}`,
    kind: "direct",
    participantUids,
    directContactUid: contact.uid,
    directStatus: "draft",
    directRequestedBy: user.id,
    directRequestedAt: now,
    currency,
    adminId: user.id,
    adminIds: [user.id],
    members: [
      {
        id: user.id,
        uid: user.id,
        name: user.name,
        color: user.color,
        avatarSeed: user.avatarSeed,
        profileImageVersion: user.profileImageVersion,
        joinedAt: now,
      },
      {
        ...contact,
        id: placeholderId,
        uid: undefined,
        joinedAt: contact.joinedAt ?? now,
        claimCode: contact.claimCode ?? crypto.randomUUID(),
        claimedFromPlaceholder: undefined,
      },
    ],
    expenses: [],
    createdAt: now,
  };
}
