// Per-caller limits, counted in the Cache API like the demo worker's early checks (flisk-demo-worker, src/index.js; same as workers/app-builder-mcp in flisk-sh/flisk):
// approximate per data center, no storage to create, nothing written to KV. Without a Cache API (tests, local dev)
// nothing is counted, so nothing is capped.
export const MAX_BODY_BYTES = 262144;
const CAP_SECONDS = 3700;

const minute = () => Math.floor(Date.now() / 60_000);
const hour = () => Math.floor(Date.now() / 3_600_000);

export const clientIp = (request) => request.headers.get("cf-connecting-ip") ?? "unknown";

async function counted(origin, key) {
  try {
    const hit = await caches.default.match(new Request(`${origin}/__count/${key}`));
    return hit ? Number(await hit.text()) || 0 : 0;
  } catch {
    return 0;
  }
}

async function bump(origin, key, value) {
  try {
    await caches.default.put(new Request(`${origin}/__count/${key}`), new Response(String(value), { headers: { "cache-control": `s-maxage=${CAP_SECONDS}` } }));
  } catch {
    /* no Cache API: nothing to count */
  }
}

/** Counts this call and answers whether the caller is over the cap: { limited, retryAfter } (seconds). */
export async function overLimit(request, env = {}) {
  const origin = new URL(request.url).origin;
  const ip = clientIp(request);
  const perMinute = Number(env.MAX_CALLS_PER_IP_MINUTE ?? 30);
  const perHour = Number(env.MAX_CALLS_PER_IP_HOUR ?? 300);
  const mKey = `m-${minute()}-${ip}`;
  const hKey = `h-${hour()}-${ip}`;
  const [m, h] = [await counted(origin, mKey), await counted(origin, hKey)];
  if (m >= perMinute) return { limited: true, retryAfter: 60 };
  if (h >= perHour) return { limited: true, retryAfter: 3600 };
  await bump(origin, mKey, m + 1);
  await bump(origin, hKey, h + 1);
  return { limited: false };
}
