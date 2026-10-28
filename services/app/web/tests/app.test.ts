import { describe, expect, it } from "bun:test";
import { createApp } from "../src/app";
import { RateLimiter, TtlCache } from "../src/guard";

const app = createApp({ publicUrl: "https://tool.test/" });
const rpc = (a: ReturnType<typeof createApp>, body: unknown) =>
	a.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});

describe("pages", () => {
	it("serves the home page with a policy that allows no scripts", async () => {
		const res = await app.request("/");
		expect(res.status).toBe(200);
		const csp = res.headers.get("content-security-policy");
		expect(csp).toContain("default-src 'none'");
		expect(csp).not.toContain("script-src");
	});

	it("sends the form, with the # a color input adds, to the result address", async () => {
		const res = await app.request("/check?fg=%231D1C1A&bg=%23fbfaf7");
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("/1d1c1a/fbfaf7");
	});

	it("redirects other spellings of a result to one address", async () => {
		const res = await app.request("/FFF/000");
		expect(res.status).toBe(301);
		expect(res.headers.get("location")).toBe("/ffffff/000000");
	});

	it("renders a result", async () => {
		const html = await (await app.request("/767676/ffffff")).text();
		expect(html).toContain("4.54:1");
		expect(html).toContain("#767676 on #ffffff");
	});

	it("keeps links and canonical addresses under the prefix a proxy stripped", async () => {
		const local = createApp();
		const headers = { "x-forwarded-prefix": "/api/web" };
		const html = await (
			await local.request("http://api.tool.localhost/", { headers })
		).text();
		expect(html).toContain('action="/api/web/check"');
		expect(html).toContain(
			'<link rel="canonical" href="http://api.tool.localhost/api/web/">',
		);
		const evil = await local.request(
			"http://api.tool.localhost/check?fg=000&bg=fff",
			{
				headers: { "x-forwarded-prefix": "//evil.example" },
			},
		);
		expect(evil.headers.get("location")).toBe("/000000/ffffff");
	});
});

describe("API, badge and MCP", () => {
	it("answers JSON and the badge", async () => {
		const json = (await (
			await app.request("/api/contrast?fg=000&bg=fff")
		).json()) as { ratio: number };
		expect(json.ratio).toBe(21);
		expect((await app.request("/api/contrast?fg=nope&bg=fff")).status).toBe(
			400,
		);
		const svg = await app.request("/badge/000/fff.svg");
		expect(svg.headers.get("content-type")).toContain("image/svg+xml");
		expect(await svg.text()).toContain("21.00:1 AA");
	});

	it("initializes, lists check_contrast and runs it", async () => {
		const init = (await (
			await rpc(app, {
				jsonrpc: "2.0",
				id: 1,
				method: "initialize",
				params: { protocolVersion: "2025-03-26" },
			})
		).json()) as { result: { protocolVersion: string } };
		expect(init.result.protocolVersion).toBe("2025-03-26");
		expect(
			(await rpc(app, { jsonrpc: "2.0", method: "notifications/initialized" }))
				.status,
		).toBe(202);
		const list = (await (
			await rpc(app, { jsonrpc: "2.0", id: 2, method: "tools/list" })
		).json()) as {
			result: { tools: { name: string }[] };
		};
		expect(list.result.tools.map((t) => t.name)).toEqual(["check_contrast"]);
		const call = (await (
			await rpc(app, {
				jsonrpc: "2.0",
				id: 3,
				method: "tools/call",
				params: {
					name: "check_contrast",
					arguments: { foreground: "#999", background: "fff" },
				},
			})
		).json()) as { result: { content: { text: string }[]; isError: boolean } };
		expect(call.result.isError).toBe(false);
		expect(call.result.content[0].text).toContain(
			"Nearest text color that passes AA",
		);
	});

	it("answers errors as JSON-RPC, and limits calls per client", async () => {
		const bad = (await (
			await rpc(app, { jsonrpc: "2.0", id: 4, method: "nope" })
		).json()) as {
			error: { code: number };
		};
		expect(bad.error.code).toBe(-32601);
		const tight = createApp({ callsPerMinute: 1 });
		expect((await tight.request("/api/contrast?fg=000&bg=fff")).status).toBe(
			200,
		);
		expect((await tight.request("/api/contrast?fg=000&bg=fff")).status).toBe(
			429,
		);
	});
});

describe("guards", () => {
	it("counts hits per window", () => {
		let t = 0;
		const limiter = new RateLimiter(2, 1000, () => t);
		expect([
			limiter.hit("a"),
			limiter.hit("a"),
			limiter.hit("a") > 0,
			limiter.hit("b"),
		]).toEqual([0, 0, true, 0]);
		t = 1000;
		expect(limiter.hit("a")).toBe(0);
	});

	it("forgets cached entries after their time and beyond the size", () => {
		let t = 0;
		const cache = new TtlCache<number>(100, 2, () => t);
		cache.set("a", 1);
		cache.set("b", 2);
		cache.set("c", 3);
		expect(cache.get("a")).toBeUndefined();
		t = 100;
		expect(cache.get("c")).toBeUndefined();
	});
});
