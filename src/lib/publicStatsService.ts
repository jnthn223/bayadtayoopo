export interface PublicStats {
  userCount: number;
  groupCount: number;
  expenseCount: number;
  updatedAt: string;
}

export async function loadPublicStats(): Promise<PublicStats | null> {
  const baseUrl = import.meta.env.VITE_PUBLIC_STATS_API_URL?.trim();
  if (!baseUrl) return null;
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/stats`);
  if (!response.ok) return null;
  const data = await response.json();
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
