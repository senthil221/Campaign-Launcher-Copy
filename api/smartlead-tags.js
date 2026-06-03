// Returns the list of tag names + counts in a single fast API call.
// Account details are NOT loaded here — use /api/smartlead-tag-accounts?tagId=X for that.

const TAGS_URL = "https://server.smartlead.ai/api/v1/email-account-tags";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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

  try {
    const url = new URL(TAGS_URL);
    url.searchParams.set("api_key", apiKey);

    const upstream = await fetch(url, { headers: { Accept: "application/json" } });

    if (!upstream.ok) {
      const text = await upstream.text();
      return json(res, upstream.status, {
        error: `Tag fetch failed with HTTP ${upstream.status}`,
        detail: text.slice(0, 500),
      });
    }

    const payload = await upstream.json();
    const raw = Array.isArray(payload) ? payload : (payload?.data ?? []);

    const tags = raw
      .map((t) => ({
        id: t.id,
        name: String(t.name || "").trim(),
        count: t.count ?? t.email_account_count ?? null,
      }))
      .filter((t) => t.name)
      .sort((a, b) => (b.count ?? 0) - (a.count ?? 0) || a.name.localeCompare(b.name));

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=7200");
    return json(res, 200, {
      fetchedAt: new Date().toISOString(),
      totalTags: tags.length,
      tags,
    });
  } catch (err) {
    return json(res, 500, {
      error: err instanceof Error ? err.message : "Unknown error fetching tags.",
    });
  }
}
