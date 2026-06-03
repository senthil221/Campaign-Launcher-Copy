export interface SmartleadTagAccount {
  id: number;
  email: string;
  domain: string;
  fromName: string;
  dailyLimit: number | null;
  dailySent: number | null;
  reputation: number | null;
  status: string;
}

export interface SmartleadTag {
  name: string;
  count: number;
  domains: number;
  accounts: SmartleadTagAccount[];
}

export interface SmartleadTagsResponse {
  fetchedAt: string;
  totalAccounts: number;
  totalTags: number;
  tags: SmartleadTag[];
}

export async function fetchSmartleadTags(refresh = false): Promise<SmartleadTagsResponse> {
  const url = refresh ? "/api/smartlead-tags?refresh=1" : "/api/smartlead-tags";
  const res = await fetch(url, { cache: refresh ? "no-store" : "default" });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error || data?.message || `Tag fetch failed with HTTP ${res.status}`;
    const detail = data?.detail ? ` — ${data.detail}` : "";
    throw new Error(`${message}${detail}`);
  }

  return data as SmartleadTagsResponse;
}
