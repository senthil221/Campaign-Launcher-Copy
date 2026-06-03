const DEFAULT_BASE_URL = "https://server.smartlead.ai/api/v1";

function json(res, status, body) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return json(res, 405, { error: "Method not allowed" });
  }

  const apiKey = process.env.SMARTLEAD_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "Missing SMARTLEAD_API_KEY in Vercel environment variables." });
  }

  try {
    const { method = "GET", path, body, params } = req.body || {};

    if (!path || typeof path !== "string" || !path.startsWith("/") || path.includes("http")) {
      return json(res, 400, { error: "Invalid Smartlead path." });
    }

    const baseUrl = (process.env.SMARTLEAD_BASE_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
    const url = new URL(`${baseUrl}${path}`);
    url.searchParams.set("api_key", apiKey);

    if (params && typeof params === "object") {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
      }
    }

    const upstream = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(body ?? {}),
    });

    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", upstream.headers.get("content-type") || "application/json");
    res.end(text || "{}");
  } catch (error) {
    return json(res, 500, {
      error: error instanceof Error ? error.message : "Unknown server error while calling Smartlead.",
    });
  }
}
