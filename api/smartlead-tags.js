// Fetches all email accounts via Smartlead JWT, groups them by tag.
// Parallel batches of 10 keep 22k accounts well within the 60s timeout.
// Response is cached 30min on Vercel CDN — most loads are instant.

const ACCOUNTS_URL = "https://server.smartlead.ai/api/email-account/get-total-email-accounts";
const LIMIT = 100;
const BATCH = 10;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function normalizeTagName(mapping) {
  return (
    mapping?.tag?.name ||
    mapping?.email_account_tag?.name ||
    mapping?.emailAccountTag?.name ||
    mapping?.name ||
    mapping?.tag_name ||
    ""
  ).toString().trim();
}

function normalizeAccount(account) {
  const email = String(account.from_email || account.email || account.username || "");
  const domain = email.includes("@") ? email.split("@").pop() : "";
  const reputationRaw = account?.warmup_details?.warmup_reputation ?? account?.warmup_reputation ?? null;
  const reputation =
    typeof reputationRaw === "string"
      ? Number(reputationRaw.replace("%", ""))
      : typeof reputationRaw === "number"
        ? reputationRaw
        : null;

  return {
    id: Number(account.id),
    email,
    domain,
    fromName: account.from_name || "",
    dailyLimit: account.message_per_day ?? account.daily_limit ?? account.max_email_per_day ?? null,
    dailySent: account.daily_sent_count ?? account.sent_count ?? null,
    reputation,
    status: account.warmup_status || account.status || account.connection_status || "",
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return json(res, 405, { error: "Method not allowed" });
  }

  const jwt = process.env.SMARTLEAD_JWT || process.env.SMARTLEAD_BEARER_TOKEN;
  if (!jwt) {
    return json(res, 500, { error: "Missing SMARTLEAD_JWT in Vercel environment variables." });
  }

  const authHeader = jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchPage(offset) {
    const url = new URL(ACCOUNTS_URL);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(LIMIT));

    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      upstream = await fetch(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });
      if (upstream.status !== 429) break;
      const wait = Number(upstream.headers.get("Retry-After") || 65);
      await sleep(Math.min(wait, 65) * 1000);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      const err = new Error("Smartlead account fetch failed.");
      err.status = upstream.status;
      err.detail = text.slice(0, 500);
      throw err;
    }

    const payload = await upstream.json();
    const accounts = payload?.data?.email_accounts || payload?.email_accounts || payload?.data || [];
    return Array.isArray(accounts) ? accounts : [accounts].filter(Boolean);
  }

  try {
    const all = [];
    let offset = 0;
    let done = false;

    while (!done) {
      const offsets = [];
      for (let i = 0; i < BATCH; i++, offset += LIMIT) {
        offsets.push(offset);
      }

      const pages = await Promise.all(offsets.map(fetchPage));

      for (const page of pages) {
        all.push(...page);
        if (page.length < LIMIT) { done = true; break; }
      }
    }

    // Group by tag
    const tagMap = new Map();

    for (const account of all) {
      const normalized = normalizeAccount(account);
      if (!Number.isFinite(normalized.id)) continue;

      const mappings = Array.isArray(account.email_account_tag_mappings)
        ? account.email_account_tag_mappings
        : Array.isArray(account.tags)
          ? account.tags
          : [];

      for (const mapping of mappings) {
        const name = normalizeTagName(mapping);
        if (!name) continue;

        if (!tagMap.has(name)) {
          tagMap.set(name, { name, accounts: [], _ids: new Set(), _domains: new Set() });
        }

        const tag = tagMap.get(name);
        if (tag._ids.has(normalized.id)) continue;

        tag._ids.add(normalized.id);
        if (normalized.domain) tag._domains.add(normalized.domain);
        tag.accounts.push(normalized);
      }
    }

    const tags = [...tagMap.values()]
      .map((tag) => ({
        name: tag.name,
        count: tag.accounts.length,
        domains: tag._domains.size,
        accounts: tag.accounts.sort((a, b) => a.email.localeCompare(b.email)),
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=7200");
    return json(res, 200, {
      fetchedAt: new Date().toISOString(),
      totalAccounts: all.length,
      totalTags: tags.length,
      tags,
    });
  } catch (err) {
    return json(res, err.status || 500, {
      error: err instanceof Error ? err.message : "Unknown error fetching tags.",
      ...(err.detail ? { detail: err.detail } : {}),
    });
  }
}
