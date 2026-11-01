// bin/pages.mjs: what it reads as a page, the anonymous publish it falls back to with no GitHub sign-in, the tokens it
// keeps for new versions, and the command end to end against a stand-in for publish.flisk.si.
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	type AnonSpace,
	publishAnon,
	publishFromActions,
	readFolder,
	removeAnon,
	savedSpace,
	saveSpace,
	slugify,
	sourceOf,
	stage,
	storePath,
	waitLive,
} from "../../../../bin/lib.mjs";

const CLI = join(import.meta.dir, "..", "..", "..", "..", "bin", "pages.mjs");
const tmp = () => mkdtempSync(join(tmpdir(), "pages-cli-test-"));
const write = (dir: string, name: string, text: string) => {
	writeFileSync(join(dir, name), text);
	return join(dir, name);
};
const PAGE =
	'<!doctype html><title>GPU</title><meta name="description" content="How GPUs work"><h1>GPU</h1>';

describe("what a path publishes as", () => {
	it("a folder is published as it is", () => {
		const dir = tmp();
		write(dir, "index.html", PAGE);
		write(dir, "app.js", "");
		const s = sourceOf(dir);
		expect(s).toMatchObject({ dir, index: "index.html", markdown: undefined });
	});

	it("one .html file becomes the index, named after the file", () => {
		const file = write(tmp(), "GPU Explainer.html", PAGE);
		const s = sourceOf(file);
		expect(s).toMatchObject({
			file,
			index: "index.html",
			name: "GPU Explainer",
		});
		if ("error" in s) throw new Error(s.error);
		const staged = stage(s);
		expect(readdirSync(staged)).toEqual(["index.html"]);
		expect(slugify(s.name)).toBe("gpu-explainer");
	});

	it("a lone Markdown file or index.md folder carries its text for the anonymous publish", () => {
		expect(sourceOf(write(tmp(), "notes.md", "# Notes"))).toMatchObject({
			index: "index.md",
			markdown: "# Notes",
		});
		const dir = tmp();
		write(dir, "index.md", "# Hi");
		write(dir, ".DS_Store", "");
		expect(sourceOf(dir)).toMatchObject({
			index: "index.md",
			markdown: "# Hi",
		});
		write(dir, "photo.png", "");
		expect(sourceOf(dir)).toMatchObject({
			index: "index.md",
			markdown: undefined,
		});
	});

	it("an index file is named after its folder", () => {
		const dir = join(tmp(), "ship-it");
		mkdirSync(dir);
		expect(sourceOf(write(dir, "index.html", PAGE))).toMatchObject({
			name: "ship-it",
		});
	});

	it("refuses what cannot be a page", () => {
		expect(sourceOf(write(tmp(), "data.csv", "a,b"))).toHaveProperty("error");
		expect(sourceOf(join(tmp(), "missing"))).toHaveProperty("error");
	});
});

describe("anonymous spaces' keys", () => {
	it("are kept per path in a file only you can read, and forgotten on removal", () => {
		const file = join(tmp(), "pages", "anon.json");
		const space: AnonSpace = {
			id: "abcdefghjk",
			url: "u",
			token: "t",
			manage: "m",
		};
		saveSpace("/x/notes.md", space, file);
		expect(savedSpace("/x/notes.md", file)).toEqual(space);
		expect(savedSpace("/x/other.md", file)).toBeUndefined();
		expect(statSync(file).mode & 0o777).toBe(0o600);
		saveSpace("/x/notes.md", undefined, file);
		expect(savedSpace("/x/notes.md", file)).toBeUndefined();
	});

	it("live under XDG_CONFIG_HOME, else ~/.config", () => {
		expect(storePath({ XDG_CONFIG_HOME: "/c", HOME: "/h" })).toBe(
			"/c/pages/anon.json",
		);
		expect(storePath({ HOME: "/h" })).toBe("/h/.config/pages/anon.json");
	});
});

describe("the anonymous publish", () => {
	const calls: { url: string; init?: RequestInit }[] = [];
	const answer =
		(status: number, body: unknown) =>
		async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			return new Response(JSON.stringify(body), { status });
		};

	it("posts a new space, then puts a version with its token", async () => {
		const first = await publishAnon(
			"https://api",
			"# Hi",
			undefined,
			answer(202, {
				id: "abcdefghjk",
				url: "https://p/@anon/abcdefghjk/",
				token: "tok",
				manage: "https://m",
			}),
		);
		expect(first).toEqual({
			id: "abcdefghjk",
			url: "https://p/@anon/abcdefghjk/",
			token: "tok",
			manage: "https://m",
		});
		expect(calls[0]).toMatchObject({
			url: "https://api/v1/spaces",
			init: { method: "POST" },
		});
		expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
			markdown: "# Hi",
			source: "cli",
		});

		const again = await publishAnon(
			"https://api",
			"# Hi 2",
			first,
			answer(202, { id: first.id, url: first.url }),
		);
		expect(again).toEqual(first);
		expect(calls[1]).toMatchObject({
			url: "https://api/v1/spaces/abcdefghjk",
			init: { method: "PUT" },
		});
		expect(new Headers(calls[1]?.init?.headers).get("authorization")).toBe(
			"Bearer tok",
		);
	});

	it("passes on the service's reason when it refuses", async () => {
		await expect(
			publishAnon(
				"https://api",
				"<script>",
				undefined,
				answer(400, { error: "no scripts" }),
			),
		).rejects.toThrow("no scripts");
		await expect(
			removeAnon(
				"https://api",
				{ id: "x", url: "", token: "", manage: "" },
				answer(403, {}),
			),
		).rejects.toThrow("403");
	});

	it("waits until the link answers, and gives up in time", async () => {
		const statuses = [404, 404, 200];
		const fetcher = async () =>
			new Response("", { status: statuses.shift() ?? 404 });
		expect(await waitLive("https://p", { every: 0, fetcher })).toBe(true);
		expect(await waitLive("https://p", { seconds: 0, every: 0, fetcher })).toBe(
			false,
		);
	});
});

describe("pages publish, end to end", () => {
	// A stand-in for publish.flisk.si that records what it was sent.
	const seen: {
		method: string;
		path: string;
		auth: string | null;
		body: string;
	}[] = [];
	let server: ReturnType<typeof Bun.serve>;
	beforeAll(() => {
		server = Bun.serve({
			port: 0,
			async fetch(req) {
				const path = new URL(req.url).pathname;
				seen.push({
					method: req.method,
					path,
					auth: req.headers.get("authorization"),
					body: await req.text(),
				});
				const id = "abcdefghjk";
				return Response.json(
					{
						id,
						url: `https://pages.test/@anon/${id}/`,
						token: "tok",
						manage: `https://publish.test/manage/${id}#tok`,
					},
					{ status: req.method === "DELETE" ? 200 : 202 },
				);
			},
		});
	});
	afterAll(() => server.stop());

	const config = tmp();
	// Spawned without blocking, so the stand-in in this process can answer.
	const cli = async (...args: string[]) => {
		const p = Bun.spawn([process.execPath, CLI, ...args], {
			// No gh on PATH: the machine is not signed in to GitHub.
			env: {
				PATH: "/nonexistent",
				HOME: config,
				XDG_CONFIG_HOME: config,
				PAGES_PUBLISH_URL: server.url.href,
			},
			stdout: "pipe",
			stderr: "pipe",
		});
		const [out, err, code] = await Promise.all([
			new Response(p.stdout).text(),
			new Response(p.stderr).text(),
			p.exited,
		]);
		return { code, out: out + err };
	};

	it("publishes a Markdown file with no sign-in, adds a version, then takes it down", async () => {
		const file = write(tmp(), "notes.md", "# Notes\n\nHello.");
		const first = await cli("publish", file);
		expect(first.code).toBe(0);
		expect(first.out).toContain("Published anonymously");
		expect(first.out).toContain("https://pages.test/@anon/abcdefghjk/");
		expect(seen.at(-1)).toMatchObject({ method: "POST", path: "/v1/spaces" });
		expect(
			JSON.parse(readFileSync(join(config, "pages", "anon.json"), "utf8"))[file]
				.token,
		).toBe("tok");

		const second = await cli("publish", file);
		expect(second.out).toContain("new version");
		expect(seen.at(-1)).toMatchObject({
			method: "PUT",
			path: "/v1/spaces/abcdefghjk",
			auth: "Bearer tok",
		});

		const gone = await cli("remove", file);
		expect(gone.code).toBe(0);
		expect(seen.at(-1)).toMatchObject({
			method: "DELETE",
			path: "/v1/spaces/abcdefghjk",
		});
		expect(
			JSON.parse(readFileSync(join(config, "pages", "anon.json"), "utf8")),
		).toEqual({});
	});

	it("says HTML needs the GitHub CLI, and sends nothing", async () => {
		const before = seen.length;
		const r = await cli("publish", write(tmp(), "page.html", PAGE));
		expect(r.code).toBe(1);
		expect(r.out).toContain("gh auth login");
		expect(seen.length).toBe(before);
	});

	it("a dry run of a single HTML file names the space after the file", () => {
		const p = Bun.spawnSync(
			[
				process.execPath,
				CLI,
				"publish",
				write(tmp(), "GPU Explainer.html", PAGE),
				"--dry-run",
			],
			{
				env: { PATH: "/nonexistent", PAGES_LOGIN: "Sam" },
			},
		);
		expect(p.exitCode).toBe(0);
		expect(p.stdout.toString()).toContain(
			"https://pages.flisk.si/@sam/gpu-explainer/",
		);
	});
});

describe("publishing from GitHub Actions", () => {
	it("asks the job for an OIDC token for publish.flisk.si and sends the folder with it", async () => {
		const dir = tmp();
		mkdirSync(join(dir, "data"));
		write(dir, "index.html", "<h1>hi</h1>");
		write(join(dir, "data"), "r.json", "{}");
		expect(readFolder(dir)).toEqual([
			{ path: "data/r.json", base64: btoa("{}") },
			{ path: "index.html", base64: btoa("<h1>hi</h1>") },
		]);
		const calls: { url: string; init?: RequestInit }[] = [];
		const fetcher = (async (url: string, init?: RequestInit) => {
			calls.push({ url, init });
			if (url.startsWith("https://actions.test"))
				return Response.json({ value: "jwt" });
			return Response.json(
				{ url: "https://pages.test/@org/bench/", runs: "https://runs" },
				{ status: 202 },
			);
		}) as unknown as typeof fetch;
		const env = {
			ACTIONS_ID_TOKEN_REQUEST_URL: "https://actions.test/token?x=1",
			ACTIONS_ID_TOKEN_REQUEST_TOKEN: "req",
		};
		const sent = await publishFromActions(
			"https://publish.test",
			"bench",
			dir,
			env,
			fetcher,
		);
		expect(sent.url).toBe("https://pages.test/@org/bench/");
		expect(calls[0].url).toBe(
			"https://actions.test/token?x=1&audience=https%3A%2F%2Fpublish.test",
		);
		expect(calls[1].url).toBe("https://publish.test/v1/ci/spaces");
		const init = calls[1].init as RequestInit;
		expect((init.headers as Record<string, string>).authorization).toBe(
			"Bearer jwt",
		);
		expect(JSON.parse(init.body as string).slug).toBe("bench");
	});

	it("says what to add when the job may not ask for a token", async () => {
		await expect(
			publishFromActions("https://publish.test", "bench", tmp(), {}),
		).rejects.toThrow("id-token: write");
	});
});
