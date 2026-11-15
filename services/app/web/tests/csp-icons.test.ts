import { expect, it } from "bun:test";
import { createApp } from "../src/app";

it.each(["/", "/about", "/share"])(
	"allows org bar icons on %s",
	async (path) => {
		const response = await createApp({
			publicUrl: "https://pages.test/",
		}).request(path);
		expect(response.status).toBe(200);
		const html = await response.text();
		const policy =
			html.match(
				/http-equiv="Content-Security-Policy" content="([^"]+)"/,
			)?.[1] ?? "";
		const images =
			policy.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1].split(/\s+/) ?? [];
		expect(images).toContain("https://flisk.si");
		expect(images).not.toContain("https:");
		expect(images).not.toContain("*");
		expect(policy).toContain("default-src 'none'");
	},
);
