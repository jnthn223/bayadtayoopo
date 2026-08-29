export interface RequiredShareLink {
  label: string;
  url: string;
}

export function ensureRequiredShareLinks(
  message: string,
  links: RequiredShareLink[],
): string {
  const trimmed = message.trim();
  const missingLines = links
    .filter(({ url }) => !trimmed.includes(url))
    .map(({ label, url }) => `${label}: ${url}`);

  return [trimmed, ...missingLines].filter(Boolean).join("\n\n");
}
