export { checkSpace, formatReport, validId } from "../services/app/web/src/check.mjs";

export interface Source {
	dir?: string;
	file?: string;
	index: "index.html" | "index.md" | "";
	name: string;
	markdown?: string;
}
export interface AnonSpace {
	id: string;
	url: string;
	token: string;
	manage: string;
}
type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export const SKIP: Set<string>;
export function slugify(name: string): string;
export function sourceOf(path: string): Source | { error: string };
export function stage(source: Source): string;
export function storePath(env?: Record<string, string | undefined>): string;
export function savedSpace(path: string, file?: string): AnonSpace | undefined;
export function saveSpace(path: string, space: AnonSpace | undefined, file?: string): void;
export function publishAnon(api: string, markdown: string, saved?: AnonSpace, fetcher?: Fetcher): Promise<AnonSpace>;
export function removeAnon(api: string, saved: AnonSpace, fetcher?: Fetcher): Promise<void>;
export function readFolder(dir: string): { path: string; base64: string }[];
export function publishFromActions(api: string, slug: string, dir: string, env?: Record<string, string | undefined>, fetcher?: Fetcher): Promise<{ url: string; runs: string }>;
export function waitLive(url: string, opts?: { seconds?: number; every?: number; fetcher?: Fetcher }): Promise<boolean>;
