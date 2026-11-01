import { describe, expect, it } from "bun:test";
import { targetOf } from "../scripts/publish-pr";
import { spaceIn } from "../scripts/remove-issue";

describe("which pull requests are a publish", () => {
	it("one space folder is a publish of that space", () => {
		expect(
			targetOf(["spaces/sam/gpu/index.html", "spaces/sam/gpu/js/app.js"]),
		).toEqual({ handle: "sam", slug: "gpu" });
	});

	it("a pull request with no space is ordinary code, left alone", () => {
		expect(targetOf(["README.md", "services/app/web/src/app.ts"])).toBeNull();
	});

	it.each([
		[
			"code and a space together",
			["spaces/sam/gpu/index.html", "README.md"],
			"outside",
		],
		[
			"two spaces",
			["spaces/sam/a/index.html", "spaces/sam/b/index.html"],
			"2 spaces",
		],
		[
			"an uppercase handle",
			["spaces/Sam/gpu/index.html"],
			"not a space folder",
		],
		[
			"a file directly in the handle folder",
			["spaces/sam/index.html"],
			"not a space folder",
		],
		["a bad slug", ["spaces/sam/My_Page/index.html"], "not a space folder"],
		["the reserved anon handle", ["spaces/anon/x1/index.md"], "reserved"],
	])("%s is refused with a reason", (_, files, reason) => {
		const t = targetOf(files as string[]);
		expect(t && "error" in t ? t.error : "").toContain(reason as string);
	});
});

describe("which issues name a space", () => {
	it("reads the space from a remove or report title", () => {
		expect(spaceIn("Remove @sam/how-gpus-work")).toEqual({
			handle: "sam",
			slug: "how-gpus-work",
		});
		expect(spaceIn("Report: @Sam/notes")).toEqual({
			handle: "sam",
			slug: "notes",
		});
		expect(spaceIn("Remove my page please")).toBeNull();
	});
});

describe("anonymous publishes", () => {
	const ok = {
		op: "publish",
		id: "abcdefghjk",
		hash: "a".repeat(64),
		markdown: "# Me",
	};

	it("accepts a well-formed payload and refuses the rest", async () => {
		const { invalid } = await import("../scripts/publish-anon");
		expect(invalid(ok)).toBe("");
		expect(invalid({ ...ok, op: "delete", markdown: undefined })).toBe("");
		expect(invalid({ ...ok, op: "rm" })).toBe("unknown op");
		expect(invalid({ ...ok, id: "../main" })).toBe("bad id");
		expect(invalid({ ...ok, hash: "short" })).toBe("bad hash");
		expect(invalid({ ...ok, markdown: " " })).toBe("no markdown");
	});

	it("takes a CV request as ratings and a name, never markup", async () => {
		const { invalid } = await import("../scripts/publish-anon");
		const cv = {
			...ok,
			markdown: undefined,
			cv: { me: "bun3,helm2", name: "Sam" },
		};
		expect(invalid(cv)).toBe("");
		expect(invalid({ ...cv, cv: { me: "<script>" } })).toBe("bad ratings");
		expect(invalid({ ...cv, cv: { me: "bun4" } })).toBe("bad ratings");
	});

	it("reads the edit hash from a commit message", async () => {
		const { hashIn } = await import("../scripts/publish-anon");
		expect(
			hashIn(
				`Publish @anon/x\n\nSource: roadmap\nPages-Edit-Hash: ${"b".repeat(64)}`,
			),
		).toBe("b".repeat(64));
		expect(hashIn("Publish @sam/x from #3")).toBe("");
	});

	it("accepts a publish from GitHub Actions for an owner, a slug and a blob", async () => {
		const { invalid } = await import("../scripts/publish-anon");
		const ci = {
			op: "ci",
			owner: "some-org",
			slug: "bench",
			blob: "c".repeat(40),
		};
		expect(invalid(ci)).toBe("");
		expect(invalid({ ...ci, owner: "anon" })).toBe("bad owner or slug");
		expect(invalid({ ...ci, owner: "Some-Org" })).toBe("bad owner or slug");
		expect(invalid({ ...ci, slug: "../main" })).toBe("bad owner or slug");
		expect(invalid({ ...ci, blob: "HEAD" })).toBe("bad blob");
	});

	it("writes the files a workflow sent and nothing outside the space", async () => {
		const { writeFiles } = await import("../scripts/publish-anon");
		const { mkdtempSync, readFileSync, rmSync } = await import("node:fs");
		const { tmpdir } = await import("node:os");
		const { join } = await import("node:path");
		const dir = mkdtempSync(join(tmpdir(), "ci-files-"));
		try {
			writeFiles(dir, [
				{ path: "index.html", base64: btoa("<h1>hi</h1>") },
				{ path: "data/r.json", base64: btoa("{}") },
			]);
			expect(readFileSync(join(dir, "data/r.json"), "utf8")).toBe("{}");
			for (const path of ["../x", "/etc/x", "a/../../x", ".git/config", ""])
				expect(() => writeFiles(dir, [{ path, base64: "" }])).toThrow(
					"refused",
				);
			expect(() =>
				writeFiles(dir, [{ path: "index.html", base64: "" }]),
			).toThrow();
			expect(() => writeFiles(dir, [])).toThrow("refused");
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it("accepts a signed-in save or remove for a GitHub login and nothing else", async () => {
		const { invalid } = await import("../scripts/publish-anon");
		const cv = { me: "bun3" };
		expect(invalid({ op: "save", owner: "odykyi", cv })).toBe("");
		expect(invalid({ op: "remove", owner: "odykyi" })).toBe("");
		expect(invalid({ op: "save", owner: "../main", cv })).toBe("bad owner");
		expect(invalid({ op: "save", owner: "Odykyi", cv })).toBe("bad owner");
		expect(invalid({ op: "save", owner: "odykyi" })).toBe("no cv");
		expect(invalid({ op: "save", owner: "odykyi", cv: { me: "<x>" } })).toBe(
			"bad ratings",
		);
	});
});
