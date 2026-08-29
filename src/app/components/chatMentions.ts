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
  const names = [...new Set(members.map((member) => member.name.trim()).filter(Boolean))]
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
      memberIds: members
        .filter(
          (member) => member.name.trim().toLocaleLowerCase() === mentionedName,
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
