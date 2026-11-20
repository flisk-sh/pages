import { expect, it } from "bun:test";
import { createApp } from "../src/app";

const app = createApp({ publicUrl: "https://pages.test/" });

it("answers an unknown /api/ path with a JSON error, not an HTML page", async () => {
	const res = await app.request("/api/does-not-exist");
	expect(res.status).toBe(404);
	expect(res.headers.get("content-type")).toContain("application/json");
	const body = await res.json();
	expect(typeof body.error).toBe("string");
	expect(body.error.length).toBeGreaterThan(0);
});

it("still serves the HTML 404 page for unknown page paths", async () => {
	const res = await app.request("/no-such-page");
	expect(res.status).toBe(404);
	expect(res.headers.get("content-type")).toContain("text/html");
	const html = await res.text();
	expect(html).toContain("<!doctype html>");
	expect(html).toContain("Page not found");
});
