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

// Lightweight tag — returned by /api/smartlead-tags (no accounts array)
export interface SmartleadTag {
  id: number;
  name: string;
  count: number | null;
}

export interface SmartleadTagsResponse {
  fetchedAt: string;
  totalTags: number;
  tags: SmartleadTag[];
}

// Full account data for a selected tag — returned by /api/smartlead-tag-accounts
export interface TagAccountsResponse {
  tagId: number;
  totalAccounts: number;
  totalDomains: number;
  accounts: SmartleadTagAccount[];
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

export async function fetchTagAccounts(tagId: number): Promise<TagAccountsResponse> {
  const res = await fetch(`/api/smartlead-tag-accounts?tagId=${tagId}`, { cache: "no-store" });
  const data = await res.json().catch(() => null);

  if (!res.ok) {
    const message = data?.error || data?.message || `Account fetch failed with HTTP ${res.status}`;
    const detail = data?.detail ? ` — ${data.detail}` : "";
    throw new Error(`${message}${detail}`);
  }

  return data as TagAccountsResponse;
}
