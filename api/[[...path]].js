const UPSTREAM = "https://mcp.desktopcommander.app";
const CANONICAL_RESOURCE = "https://mcp.desktopcommander.app/mcp";

function rewriteUrl(req) {
  const u = new URL(req.url, "https://" + (req.headers.host || "localhost"));
  if (u.searchParams.has("resource")) {
    u.searchParams.set("resource", CANONICAL_RESOURCE);
  }
  return UPSTREAM + u.pathname + (u.search ? u.search : "");
}

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,Mcp-Protocol-Version,Accept");
    return res.end();
  }

  const upstreamUrl = rewriteUrl(req);
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"];
  delete headers.connection;

  let body;
  if (req.method !== "GET" && req.method !== "HEAD") {
    body = await new Promise((resolve, reject) => {
      const chunks = [];
      req.on("data", c => chunks.push(Buffer.from(c)));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });
  }

  try {
    const r = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body
    });

    res.statusCode = r.status;
    r.headers.forEach((value, key) => {
      if (!["transfer-encoding", "content-encoding", "connection"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Expose-Headers", "Location,WWW-Authenticate,Mcp-Session-Id");

    if (!r.body) return res.end();
    const reader = r.body.getReader();
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "proxy_error", message: String(err) }));
  }
};
