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
