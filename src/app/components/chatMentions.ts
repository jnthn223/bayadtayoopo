import type { Member } from "./types";

export interface MentionRange {
  start: number;
  end: number;
  query: string;
}

export interface ChatTextPart {
  text: string;
  memberIds: string[];
}

export function getMentionDisplayText(part: ChatTextPart, members: Member[]): string {
  if (part.memberIds.length === 0) return part.text;
  const member = members.find((candidate) => candidate.id === part.memberIds[0]);
  return `@${member?.groupNickname?.trim() || member?.name?.trim() || part.text.replace(/^@/, "")}`;
}

export function getChatDisplayText(text: string, members: Member[]): string {
  return parseChatMentions(text, members)
    .map((part) => getMentionDisplayText(part, members))
    .join("");
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMentionRange(
  text: string,
  cursor = text.length,
): MentionRange | null {
  const beforeCursor = text.slice(0, cursor);
  const match = beforeCursor.match(/(^|\s)@([^@\n]{0,60})$/);
  if (!match) return null;
  const query = match[2];
  return {
    start: cursor - query.length - 1,
    end: cursor,
    query,
  };
}

export function insertMention(
  text: string,
  range: MentionRange,
  memberName: string,
) {
  const insertion = `@${memberName} `;
  return {
    text: `${text.slice(0, range.start)}${insertion}${text.slice(range.end)}`,
    cursor: range.start + insertion.length,
  };
}

export function parseChatMentions(
  text: string,
  members: Member[],
): ChatTextPart[] {
  if (typeof text !== "string") return [{ text: "", memberIds: [] }];
  const safeMembers = Array.isArray(members)
    ? members.filter((member) => typeof member?.name === "string")
    : [];
  const names = [...new Set(safeMembers.flatMap((member) => [member.groupNickname?.trim(), member.name.trim()]).filter(Boolean) as string[])]
    .sort((a, b) => b.length - a.length);
  if (names.length === 0) return [{ text, memberIds: [] }];

  const regex = new RegExp(
    `(^|\\s)(@(?:${names.map(escapeRegExp).join("|")}))(?=$|[\\s.,!?;:])`,
    "gi",
  );
  const parts: ChatTextPart[] = [];
  let cursor = 0;

  for (const match of text.matchAll(regex)) {
    const index = match.index ?? 0;
    const leadingSpace = match[1] ?? "";
    const token = match[2];
    const tokenStart = index + leadingSpace.length;
    if (tokenStart > cursor) {
      parts.push({ text: text.slice(cursor, tokenStart), memberIds: [] });
    }
    const mentionedName = token.slice(1).toLocaleLowerCase();
    parts.push({
      text: token,
      memberIds: safeMembers
        .filter(
          (member) =>
            member.name.trim().toLocaleLowerCase() === mentionedName ||
            member.groupNickname?.trim().toLocaleLowerCase() === mentionedName,
        )
        .map((member) => member.id),
    });
    cursor = tokenStart + token.length;
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), memberIds: [] });
  }
  return parts.length > 0 ? parts : [{ text, memberIds: [] }];
}

export function getMentionedMemberIds(text: string, members: Member[]) {
  return [
    ...new Set(
      parseChatMentions(text, members).flatMap((part) => part.memberIds),
    ),
  ];
}
