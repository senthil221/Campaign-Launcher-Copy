const DEFAULT_ACCOUNTS_URL = "https://server.smartlead.ai/api/email-account/get-total-email-accounts";

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
  const reputation = typeof reputationRaw === "string"
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

  const limit = Math.min(Math.max(Number(req.query.limit || process.env.SMARTLEAD_TAG_FETCH_LIMIT || 100), 10), 100);
  const maxPages = Math.min(Math.max(Number(req.query.maxPages || process.env.SMARTLEAD_TAG_MAX_PAGES || 120), 1), 500);
  const endpoint = process.env.SMARTLEAD_INTERNAL_ACCOUNTS_URL || DEFAULT_ACCOUNTS_URL;
  const authHeader = jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  async function fetchPage(offset) {
    const url = new URL(endpoint);
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(limit));

    let upstream;
    for (let attempt = 0; attempt < 2; attempt++) {
      upstream = await fetch(url, {
        headers: { Authorization: authHeader, Accept: "application/json" },
      });
      if (upstream.status !== 429) break;
      const retryAfter = Number(upstream.headers.get("Retry-After") || 65);
      await sleep(Math.min(retryAfter, 65) * 1000);
    }

    if (!upstream.ok) {
      const text = await upstream.text();
      const err = new Error("Smartlead JWT account fetch failed.");
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
    const BATCH = 10; // concurrent pages per round
    let offset = 0;
    let done = false;

    while (!done && offset < maxPages * limit) {
      // Build a batch of up to BATCH offsets
      const offsets = [];
      for (let i = 0; i < BATCH && offset < maxPages * limit; i++, offset += limit) {
        offsets.push(offset);
      }

      const pages = await Promise.all(offsets.map(fetchPage));

      for (const pageAccounts of pages) {
        all.push(...pageAccounts);
        if (pageAccounts.length < limit) { done = true; break; }
      }
    }

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
          tagMap.set(name, { name, count: 0, domains: 0, accounts: [], _ids: new Set(), _domains: new Set() });
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
  } catch (error) {
    const status = error.status || 500;
    return json(res, status, {
      error: error instanceof Error ? error.message : "Unknown server error while fetching Smartlead tags.",
      ...(error.detail ? { detail: error.detail } : {}),
    });
  }
}
