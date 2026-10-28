import { describe, expect, it } from "bun:test";
import { check, nearestPassing, parseHex, ratio } from "../src/contrast";

describe("contrast", () => {
	it("reads 3- and 6-digit hex, with or without #", () => {
		expect(parseHex("#FFF")).toEqual([255, 255, 255]);
		expect(parseHex("1d1c1a")).toEqual([29, 28, 26]);
		expect(parseHex("12345")).toBeUndefined();
		expect(parseHex("zzzzzz")).toBeUndefined();
	});

	it("matches the WCAG reference values", () => {
		expect(ratio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
		expect(ratio([255, 255, 255], [255, 255, 255])).toBe(1);
		// #767676 on white is the classic lightest gray that passes AA.
		expect(check("767676", "fff")?.levels[0].pass).toBe(true);
		expect(check("777777", "fff")?.levels[0].pass).toBe(false);
	});

	it("does not round a failing ratio up to a pass", () => {
		const r = check("777777", "ffffff");
		expect(r?.ratio).toBeLessThan(4.5);
	});

	it("suggests the nearest text color that passes AA", () => {
		const s = nearestPassing([153, 153, 153], [255, 255, 255]);
		expect(s).toBeDefined();
		expect(
			ratio(parseHex(s as string) ?? [0, 0, 0], [255, 255, 255]),
		).toBeGreaterThanOrEqual(4.5);
		expect(nearestPassing([0, 0, 0], [255, 255, 255])).toBeUndefined();
	});
});
