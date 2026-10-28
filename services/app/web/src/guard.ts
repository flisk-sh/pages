// What keeps a free public tool safe to leave online: per-client rate limits, the client address behind a proxy, and
// the page's security headers. Slots and TtlCache are for a tool that fetches or computes something slow: cap how many
// run at once and keep results for a while. No I/O, so tests/guard.test.ts covers all of it.

/** A fixed-window counter per key: `limit` hits per `windowMs`. Old windows are dropped as keys come back. */
export class RateLimiter {
	private hits = new Map<string, { start: number; count: number }>();

	constructor(
		private readonly limit: number,
		private readonly windowMs: number,
		private readonly now: () => number = Date.now,
	) {}

	/** Counts one hit; returns the seconds to wait when the key is over its limit, or 0 when the hit is allowed. */
	hit(key: string): number {
		const t = this.now();
		const entry = this.hits.get(key);
		if (!entry || t - entry.start >= this.windowMs) {
			this.hits.set(key, { start: t, count: 1 });
			if (this.hits.size > 50_000) this.sweep(t);
			return 0;
		}
		entry.count++;
		return entry.count > this.limit
			? Math.ceil((entry.start + this.windowMs - t) / 1000)
			: 0;
	}

	private sweep(t: number) {
		for (const [key, entry] of this.hits)
			if (t - entry.start >= this.windowMs) this.hits.delete(key);
	}
}

/**
 * Which proxy header names the client: `none` (direct; the socket address), `last-forwarded` (one trusted proxy that
 * appends to X-Forwarded-For, such as Render: the last entry is the address it saw, while earlier ones are whatever the
 * client sent), or `cloudflare` (CF-Connecting-IP, only safe when the origin accepts traffic from Cloudflare alone).
 */
export type ProxyMode = "none" | "last-forwarded" | "cloudflare";

export function parseProxyMode(value: string | undefined): ProxyMode {
	return value === "last-forwarded" || value === "cloudflare" ? value : "none";
}

/** The client address for rate limiting. */
export function clientIp(
	headers: Headers,
	socketAddress: string | undefined,
	mode: ProxyMode,
): string {
	if (mode === "cloudflare") {
		const cf = headers.get("cf-connecting-ip")?.trim();
		if (cf) return cf;
	}
	if (mode === "last-forwarded") {
		const entries = (headers.get("x-forwarded-for") ?? "")
			.split(",")
			.map((e) => e.trim())
			.filter(Boolean);
		if (entries.length > 0) return entries[entries.length - 1];
	}
	return socketAddress ?? "unknown";
}

/** At most `limit` tasks at once; `run` answers undefined instead of queueing when all slots are taken. */
export class Slots {
	private running = 0;

	constructor(private readonly limit: number) {}

	async run<T>(task: () => Promise<T>): Promise<T | undefined> {
		if (this.running >= this.limit) return undefined;
		this.running++;
		try {
			return await task();
		} finally {
			this.running--;
		}
	}
}

/** A map that forgets entries after `ttlMs` and drops the oldest when it holds more than `max`. */
export class TtlCache<T> {
	private entries = new Map<string, { value: T; at: number }>();

	constructor(
		private readonly ttlMs: number,
		private readonly max: number,
		private readonly now: () => number = Date.now,
	) {}

	get(key: string): T | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;
		if (this.now() - entry.at >= this.ttlMs) {
			this.entries.delete(key);
			return undefined;
		}
		return entry.value;
	}

	set(key: string, value: T) {
		this.entries.delete(key);
		this.entries.set(key, { value, at: this.now() });
		while (this.entries.size > this.max)
			this.entries.delete(this.entries.keys().next().value as string);
	}
}

export function securityHeaders(): Record<string, string> {
	return {
		"content-security-policy": [
			"default-src 'none'",
			"style-src 'unsafe-inline'",
			"img-src 'self'",
			"base-uri 'none'",
			"form-action 'self'",
			"frame-ancestors 'none'",
		].join("; "),
		"x-content-type-options": "nosniff",
		"referrer-policy": "strict-origin-when-cross-origin",
		"permissions-policy": "camera=(), microphone=(), geolocation=()",
	};
}
