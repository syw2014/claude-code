import { describe, expect, test } from "bun:test";
import files from "../files/index.js";
import tag from "../tag/index.js";
import version from "../version.js";
import thinkback from "../thinkback/index.js";
import thinkbackPlay from "../thinkback-play/index.js";
import { isCommandEnabled } from "../../types/command.js";

describe("command availability", () => {
	test("keeps local utility commands available in external builds", () => {
		expect(isCommandEnabled(files)).toBe(true);
		expect(isCommandEnabled(tag)).toBe(true);
		expect(isCommandEnabled(version)).toBe(true);
	});

	test("exposes thinkback commands as experimental local commands", () => {
		expect(isCommandEnabled(thinkback)).toBe(true);
		expect(isCommandEnabled(thinkbackPlay)).toBe(true);
		expect(thinkbackPlay.isHidden).toBe(true);
	});
});
