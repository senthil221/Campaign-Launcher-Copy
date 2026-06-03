// Fetches email accounts for a single tag by ID, paginated in parallel.
// Called only when the user selects a tag — not on initial load.

const ACCOUNTS_URL = "https://server.smartlead.ai/api/v1/email-accounts";
const LIMIT = 100;
const BATCH = 10;

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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

  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "Missing SMARTLEAD_API_KEY in Vercel environment variables." });
  }

  const tagId = req.query.tagId;
  if (!tagId) {
    return json(res, 400, { error: "Missing tagId query parameter." });
  }

  async function fetchPage(offset) {
    const url = new URL(ACCOUNTS_URL);
    url.searchParams.set("api_key", apiKey);
    url.searchParams.set("tag_id", String(tagId));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("limit", String(LIMIT));

    const upstream = await fetch(url, { headers: { Accept: "application/json" } });

    if (!upstream.ok) {
      const text = await upstream.text();
      const err = new Error(`Account fetch failed with HTTP ${upstream.status}`);
      err.status = upstream.status;
      err.detail = text.slice(0, 500);
      throw err;
    }

    const payload = await upstream.json();
    const accounts = payload?.data ?? payload ?? [];
    return Array.isArray(accounts) ? accounts : [];
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

    const seen = new Set();
    const accounts = [];
    const domains = new Set();

    for (const raw of all) {
      const a = normalizeAccount(raw);
      if (!Number.isFinite(a.id) || seen.has(a.id)) continue;
      seen.add(a.id);
      if (a.domain) domains.add(a.domain);
      accounts.push(a);
    }

    accounts.sort((a, b) => a.email.localeCompare(b.email));

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=7200");
    return json(res, 200, {
      tagId: Number(tagId),
      totalAccounts: accounts.length,
      totalDomains: domains.size,
      accounts,
    });
  } catch (err) {
    return json(res, err.status || 500, {
      error: err instanceof Error ? err.message : "Unknown error fetching tag accounts.",
      ...(err.detail ? { detail: err.detail } : {}),
    });
  }
}
