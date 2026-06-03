// Single-page proxy — JWT stays server-side, client handles pagination.
// Each call returns one page of raw accounts (max 100). No aggregation here.

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
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

  const offset = Math.max(0, Number(req.query.offset || 0));
  const url = new URL("https://server.smartlead.ai/api/email-account/get-total-email-accounts");
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", "100");

  try {
    const upstream = await fetch(url, {
      headers: {
        Authorization: jwt.startsWith("Bearer ") ? jwt : `Bearer ${jwt}`,
        Accept: "application/json",
      },
    });

    const text = await upstream.text();
    res
      .status(upstream.status)
      .setHeader("Content-Type", "application/json")
      .setHeader("Cache-Control", "no-store")
      .end(text);
  } catch (err) {
    return json(res, 500, {
      error: err instanceof Error ? err.message : "Proxy error.",
    });
  }
}
