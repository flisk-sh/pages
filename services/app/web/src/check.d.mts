export interface Finding {
	severity: "error" | "warn";
	rule: string;
	file: string;
	message: string;
}
export interface CheckResult {
	ok: boolean;
	errors: Finding[];
	warnings: Finding[];
	files: number;
	bytes: number;
}
export const LIMITS: { files: number; fileBytes: number; totalBytes: number };
export const SCRIPT_HOSTS: string[];
export const STYLE_HOSTS: string[];
export const FONT_HOSTS: string[];
export const CONNECT_HOSTS: string[];
export const FRAME_HOSTS: string[];
export const EXTENSIONS: Set<string>;
export function validId(handle: string, slug: string): boolean;
export function csp(options?: { scripts?: boolean }): string;
export function tags(html: string, name: string): Record<string, string>[];
export function hostOf(url: string): string | null;
export function decodeEntities(value: string): string;
export function checkSpace(dir: string): CheckResult;
/** One file given as text, with no filesystem: the rules checkSpace applies to that kind of file (by name). */
export function checkText(name: string, text: string): CheckResult;
export function formatReport(result: CheckResult): string;
