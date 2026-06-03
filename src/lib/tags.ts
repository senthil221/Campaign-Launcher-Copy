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
  activeCount: number;
  domains: number;
  accounts: SmartleadTagAccount[];
}

export function isActiveAccount(a: SmartleadTagAccount): boolean {
  return !/paused|stopped|disconnect|error|reconnect|failure|smtp/i.test(a.status);
}

export interface SmartleadTagsResponse {
  fetchedAt: string;
  totalAccounts: number;
  totalTags: number;
  tags: SmartleadTag[];
}

const LIMIT = 100;
const BATCH = 5;           // concurrent pages per round
const BATCH_DELAY_MS = 400; // pause between rounds to stay under rate limit
const MAX_RETRIES = 3;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function normalizeTagName(mapping: Record<string, unknown>): string {
  return String(
    (mapping?.tag as Record<string, unknown>)?.name ||
    (mapping?.email_account_tag as Record<string, unknown>)?.name ||
    (mapping?.emailAccountTag as Record<string, unknown>)?.name ||
    mapping?.name ||
    mapping?.tag_name ||
    ""
  ).trim();
}

function normalizeAccount(raw: Record<string, unknown>): SmartleadTagAccount {
  const email = String(raw.from_email || raw.email || raw.username || "");
  const domain = email.includes("@") ? email.split("@").pop()! : "";
  const repRaw = (raw?.warmup_details as Record<string, unknown>)?.warmup_reputation ?? raw?.warmup_reputation ?? null;
  const reputation =
    typeof repRaw === "string" ? Number((repRaw as string).replace("%", ""))
    : typeof repRaw === "number" ? repRaw
    : null;

  return {
    id: Number(raw.id),
    email,
    domain,
    fromName: String(raw.from_name || ""),
    dailyLimit: (raw.message_per_day ?? raw.daily_limit ?? raw.max_email_per_day ?? null) as number | null,
    dailySent: (raw.daily_sent_count ?? raw.sent_count ?? null) as number | null,
    reputation,
    status: [raw.warmup_status, raw.connection_status, raw.status]
      .filter(Boolean)
      .join("|"),
  };
}

async function fetchPage(offset: number, attempt = 0): Promise<Record<string, unknown>[]> {
  const res = await fetch(`/api/smartlead-tags?offset=${offset}`, { cache: "no-store" });

  if (res.status === 429) {
    if (attempt >= MAX_RETRIES) throw new Error("Rate limited by Smartlead — too many requests.");
    // honour Retry-After if present, otherwise back off exponentially (10s, 20s, 40s)
    const retryAfter = res.headers.get("Retry-After");
    const waitMs = retryAfter ? Number(retryAfter) * 1000 : 10_000 * Math.pow(2, attempt);
    await sleep(waitMs);
    return fetchPage(offset, attempt + 1);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => null);
    const msg = data?.error || data?.message || `Fetch failed with HTTP ${res.status}`;
    const detail = data?.detail ? ` — ${data.detail}` : "";
    throw new Error(`${msg}${detail}`);
  }

  const payload = await res.json();
  const accounts = payload?.data?.email_accounts || payload?.email_accounts || payload?.data || [];
  return Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);
}

export async function fetchSmartleadTags(
  _refresh = false,
  onProgress?: (loaded: number) => void
): Promise<SmartleadTagsResponse> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  let done = false;

  while (!done) {
    const offsets: number[] = [];
    for (let i = 0; i < BATCH; i++, offset += LIMIT) offsets.push(offset);

    const pages = await Promise.all(offsets.map((o) => fetchPage(o)));

    for (const page of pages) {
      all.push(...page);
      if (page.length < LIMIT) { done = true; break; }
    }

    onProgress?.(all.length);
    if (!done) await sleep(BATCH_DELAY_MS);
  }

  // Build tag map
  const tagMap = new Map<string, { name: string; accounts: SmartleadTagAccount[]; _ids: Set<number>; _domains: Set<string> }>();

  for (const raw of all) {
    const account = normalizeAccount(raw);
    if (!Number.isFinite(account.id)) continue;

    const mappings = Array.isArray(raw.email_account_tag_mappings)
      ? (raw.email_account_tag_mappings as Record<string, unknown>[])
      : Array.isArray(raw.tags)
        ? (raw.tags as Record<string, unknown>[])
        : [];

    for (const mapping of mappings) {
      const name = normalizeTagName(mapping);
      if (!name) continue;

      if (!tagMap.has(name)) {
        tagMap.set(name, { name, accounts: [], _ids: new Set(), _domains: new Set() });
      }

      const tag = tagMap.get(name)!;
      if (tag._ids.has(account.id)) continue;

      tag._ids.add(account.id);
      if (account.domain) tag._domains.add(account.domain);
      tag.accounts.push(account);
    }
  }

  const tags: SmartleadTag[] = [...tagMap.values()]
    .map((t) => ({
      name: t.name,
      count: t.accounts.length,
      activeCount: t.accounts.filter(isActiveAccount).length,
      domains: t._domains.size,
      accounts: t.accounts.sort((a, b) => a.email.localeCompare(b.email)),
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

  return {
    fetchedAt: new Date().toISOString(),
    totalAccounts: all.length,
    totalTags: tags.length,
    tags,
  };
}
