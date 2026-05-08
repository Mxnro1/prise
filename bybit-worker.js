const BYBIT_HOSTS = ["https://api.bybit.com", "https://api.bytick.com"];
const ALLOWED_PATHS = new Set([
  "/v5/market/tickers",
  "/v5/market/kline",
  "/v5/market/instruments-info",
]);

export default {
  async fetch(request) {
    const requestUrl = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "GET" || !ALLOWED_PATHS.has(requestUrl.pathname)) {
      return json({ retCode: 10001, retMsg: "Unsupported endpoint" }, 404);
    }

    let lastError = null;

    for (const host of BYBIT_HOSTS) {
      try {
        const upstreamUrl = new URL(`${host}${requestUrl.pathname}`);
        upstreamUrl.search = requestUrl.search;

        const response = await fetch(upstreamUrl.toString(), {
          headers: {
            accept: "application/json",
            "user-agent": "currency-dashboard-bybit-proxy",
          },
        });

        const body = await response.text();

        return new Response(body, {
          status: response.status,
          headers: {
            ...corsHeaders(),
            "content-type": response.headers.get("content-type") || "application/json",
            "cache-control": "no-store",
          },
        });
      } catch (error) {
        lastError = error;
      }
    }

    return json(
      {
        retCode: 10002,
        retMsg: lastError?.message || "Bybit is unavailable",
      },
      502,
    );
  },
};

function corsHeaders() {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders(),
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });
}
