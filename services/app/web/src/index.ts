// The local preview: the site and the spaces the last build gathered (bun run build, or bun run gather alone).
// Settings (all optional):
//   PORT         where to listen (4000 under Flisk)
//   PUBLIC_URL   the address people use; without it, each request's own address
//   SPACES_DIR   the gathered spaces (.spaces, next to this package)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "./app";
import { readSpaces, type SpaceGit } from "./spaces";

const port = Number(process.env.PORT) || 4000;
const dir = process.env.SPACES_DIR || join(import.meta.dir, "..", ".spaces");
let git: Record<string, SpaceGit> = {};
try {
	git = JSON.parse(readFileSync(join(dir, "git.json"), "utf8"));
} catch {}
const spaces = readSpaces(dir, git, console.log);
const app = createApp({
	publicUrl: process.env.PUBLIC_URL || undefined,
	spaces,
});

console.log(
	`pages listening on http://localhost:${port} with ${spaces.length} spaces`,
);

export default { port, fetch: app.fetch, idleTimeout: 30 };
