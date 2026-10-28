// The example tool: WCAG 2.2 contrast between two colors. Pure functions, no I/O. Replace this file with your own tool
// and keep its shape: input from the address, a result object, one function the page, the API and MCP all call.

export type Rgb = [number, number, number];

/** A hex color without the #, in 3 or 6 digits, as RGB 0-255; undefined for anything else. */
export function parseHex(input: string): Rgb | undefined {
	const hex = input.trim().replace(/^#/, "").toLowerCase();
	const full = /^[0-9a-f]{3}$/.test(hex)
		? hex.replace(/./g, (d) => d + d)
		: hex;
	if (!/^[0-9a-f]{6}$/.test(full)) return undefined;
	return [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16)) as Rgb;
}

export const toHex = (rgb: Rgb) =>
	rgb.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Relative luminance, WCAG 2.2 definition. */
export function luminance([r, g, b]: Rgb): number {
	const lin = (v: number) => {
		const s = v / 255;
		return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function ratio(a: Rgb, b: Rgb): number {
	const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
	return (hi + 0.05) / (lo + 0.05);
}

export const LEVELS = [
	{ id: "aa", label: "AA body text", min: 4.5 },
	{ id: "aa-large", label: "AA large text", min: 3 },
	{ id: "aaa", label: "AAA body text", min: 7 },
	{ id: "aaa-large", label: "AAA large text", min: 4.5 },
	{ id: "ui", label: "Interface parts (borders, icons)", min: 3 },
] as const;

/**
 * The text color nearest to `fg` that reaches `target` on `bg`: `fg` mixed toward black or white in 1% steps, whichever
 * gets there first. Undefined when `fg` already passes.
 */
export function nearestPassing(
	fg: Rgb,
	bg: Rgb,
	target = 4.5,
): string | undefined {
	if (ratio(fg, bg) >= target) return undefined;
	for (let step = 1; step <= 100; step++) {
		for (const end of [0, 255]) {
			const mixed = fg.map((v) => v + (end - v) * (step / 100)) as Rgb;
			const rounded = mixed.map(Math.round) as Rgb;
			if (ratio(rounded, bg) >= target) return toHex(rounded);
		}
	}
	return undefined;
}

export interface Result {
	fg: string;
	bg: string;
	ratio: number;
	levels: { id: string; label: string; min: number; pass: boolean }[];
	/** The nearest text color that passes AA body text, when this one does not. */
	suggestion?: string;
}

export function check(fgInput: string, bgInput: string): Result | undefined {
	const fg = parseHex(fgInput);
	const bg = parseHex(bgInput);
	if (!fg || !bg) return undefined;
	const r = ratio(fg, bg);
	// WCAG compares the ratio unrounded; two decimals are for display only.
	return {
		fg: toHex(fg),
		bg: toHex(bg),
		ratio: Math.floor(r * 100) / 100,
		levels: LEVELS.map((l) => ({ ...l, pass: r >= l.min })),
		suggestion: nearestPassing(fg, bg),
	};
}

export const summarize = (r: Result) =>
	`#${r.fg} on #${r.bg}: ${r.ratio.toFixed(2)}:1. ${r.levels.map((l) => `${l.label}: ${l.pass ? "pass" : "fail"}`).join("; ")}.${r.suggestion ? ` Nearest text color that passes AA: #${r.suggestion}.` : ""}`;
