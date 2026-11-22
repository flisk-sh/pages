import { describe, expect, it } from "bun:test";
import worker from "../src/worker.js";
import { withSecurityHeaders } from "../src/security-headers.js";

const EXPECTED = {
	"x-content-type-options": "nosniff",
	"x-frame-options": "SAMEORIGIN",
	"strict-transport-security": "max-age=31536000; includeSubDomains",
	"referrer-policy": "strict-origin-when-cross-origin",
	"permissions-policy": "camera=(), microphone=(), geolocation=()",
};
const env = { PAGES_REPO: "flisk-sh/pages", PAGES_ORIGIN: "https://pages.test", PUBLISH_ORIGIN: "https://publish.test", ALLOWED_ORIGINS: "https://roadmap.test", GITHUB_TOKEN: "t" };
const call = (path, init) => worker.fetch(new Request(`https://publish.test${path}`, init), env);

describe("security headers on publish.flisk.si", () => {
	it("every route of the app carries the baseline headers", async () => {
		for (const path of ["/", "/health", "/robots.txt", "/manage/abcdefghij", "/nothing"]) {
			const res = await call(path);
			for (const [k, v] of Object.entries(EXPECTED)) {
				// The manage page already sends the stricter no-referrer policy and keeps it.
				if (k === "referrer-policy" && path.startsWith("/manage/")) expect(res.headers.get(k)).toBe("no-referrer");
				else expect(res.headers.get(k)).toBe(v);
			}
			expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://analytics.flisk.si");
		}
	});

	it("the manage page keeps its CSP and gains only frame-ancestors", async () => {
		const csp = (await call("/manage/abcdefghij")).headers.get("content-security-policy");
		expect(csp).toStartWith("default-src 'none'; script-src 'unsafe-inline'");
		expect(csp).toEndWith("; frame-ancestors 'self' https://analytics.flisk.si");
		expect(csp.match(/frame-ancestors/g)).toHaveLength(1);
	});

	it("a CORS preflight keeps its headers and gains the baseline", async () => {
		const res = await call("/v1/spaces", { method: "OPTIONS", headers: { origin: "https://roadmap.test", "access-control-request-method": "POST" } });
		expect(res.status).toBe(204);
		expect(res.headers.get("access-control-allow-origin")).toBe("https://roadmap.test");
		expect(res.headers.get("x-content-type-options")).toBe("nosniff");
	});

	it("existing headers are kept and an existing frame-ancestors is not changed", async () => {
		const res = withSecurityHeaders(new Response("b", { status: 404, headers: { "x-frame-options": "DENY", "content-security-policy": "frame-ancestors 'none'" } }));
		expect(res.status).toBe(404);
		expect(res.headers.get("x-frame-options")).toBe("DENY");
		expect(res.headers.get("content-security-policy")).toBe("frame-ancestors 'none'");
	});
});
