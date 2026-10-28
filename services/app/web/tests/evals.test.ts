// The skill evals (evals/ at the repository root) start from these fixture folders. Each case assumes the check
// says a particular thing about its folder; these tests keep that true when the rules change.
import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { checkSpace } from "../src/check.mjs";

const fixture = (name: string) =>
	join(import.meta.dir, "..", "..", "..", "..", "evals", "fixtures", name);
const rules = (name: string) =>
	checkSpace(fixture(name)).errors.map((e) => e.rule);

describe("eval fixtures", () => {
	it("gpu-demo is ready to publish", () => {
		const r = checkSpace(fixture("gpu-demo"));
		expect(r.errors).toEqual([]);
		expect(r.warnings).toEqual([]);
	});

	it("leaky-dashboard fails on its script and its fetch, and nothing else", () => {
		expect(rules("leaky-dashboard").sort()).toEqual([
			"connect-src",
			"script-src",
		]);
	});

	it("login-page fails on its password field and its form", () => {
		expect(rules("login-page").sort()).toEqual(["form-action", "password"]);
	});
});
