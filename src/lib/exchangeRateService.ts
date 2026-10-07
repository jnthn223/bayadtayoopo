export interface ExchangeRateSuggestion {
  rate: number;
  date: string;
}

export async function fetchExchangeRate(
  from: string,
  to: string,
  date: string,
): Promise<ExchangeRateSuggestion> {
  const url = new URL(
    `https://api.frankfurter.dev/v2/rate/${encodeURIComponent(from)}/${encodeURIComponent(to)}`,
  );
  if (date) url.searchParams.set("date", date);
  const response = await fetch(url);
  if (!response.ok) throw new Error("No online rate is available for this currency pair.");
  const data = (await response.json()) as { rate?: number; date?: string };
  if (!Number.isFinite(data.rate) || !data.date) {
    throw new Error("The rate service returned an invalid response.");
  }
  return { rate: data.rate!, date: data.date };
}
