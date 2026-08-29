import type { Group, Member } from "./types";

export function normalizeMemberName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] +
          (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

export function memberNameSimilarity(leftName: string, rightName: string): number {
  const left = normalizeMemberName(leftName);
  const right = normalizeMemberName(rightName);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftTokens = new Set(left.split(" "));
  const rightTokens = new Set(right.split(" "));
  const sharedTokens = [...leftTokens].filter((token) => rightTokens.has(token));
  const tokenScore = sharedTokens.length /
    Math.max(leftTokens.size, rightTokens.size);
  const shorterTokens = leftTokens.size <= rightTokens.size
    ? leftTokens
    : rightTokens;
  const longerTokens = leftTokens.size <= rightTokens.size
    ? rightTokens
    : leftTokens;
  const isMeaningfulSubset =
    [...shorterTokens].every((token) => longerTokens.has(token)) &&
    [...shorterTokens].some((token) => token.length >= 4);
  const distanceScore = 1 - editDistance(left, right) /
    Math.max(left.length, right.length);
  return Math.max(tokenScore, distanceScore, isMeaningfulSubset ? 0.8 : 0);
}

export function findSimilarPendingMember(
  group: Group,
  visitorName: string,
): Member | undefined {
  const ownerId = group.adminId ?? group.members[0]?.id;
  return group.members
    .filter(
      (member) =>
        !member.uid && member.id !== ownerId && member.uid !== ownerId,
    )
    .map((member) => ({
      member,
      score: memberNameSimilarity(visitorName, member.name),
    }))
    .filter(({ score }) => score >= 0.72)
    .sort((left, right) => right.score - left.score)[0]?.member;
}
