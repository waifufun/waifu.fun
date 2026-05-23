// Test set adapted from Motion+ source (motion-plus-dom@2.11.3).
//
// `getNextText` is the deterministic step function the React Typewriter
// component drives on every interval tick. Pure-string logic, no timers,
// no DOM.

import { describe, expect, it } from "vitest";

import { findCommonPrefixIndex } from "./find-common-prefix-index";
import { findPreviousWordIndex } from "./find-previous-word-index";
import { getNextText } from "./get-next-text";
import { needsBackspace } from "./needs-backspace";

describe("needsBackspace", () => {
	it("returns false when current is a prefix of target", () => {
		expect(needsBackspace("hel", "hello")).toBe(false);
	});

	it("returns true when current has more chars than target", () => {
		expect(needsBackspace("hello!", "hello")).toBe(true);
	});

	it("returns true when current diverges from target", () => {
		expect(needsBackspace("help", "hello")).toBe(true);
	});

	it("returns false when current is empty", () => {
		expect(needsBackspace("", "anything")).toBe(false);
	});
});

describe("findCommonPrefixIndex", () => {
	it("returns the length of the shared prefix", () => {
		expect(findCommonPrefixIndex("hello world", "hello there")).toBe(6);
	});

	it("returns 0 when there is no shared prefix", () => {
		expect(findCommonPrefixIndex("abc", "xyz")).toBe(0);
	});

	it("returns full length when strings are identical", () => {
		expect(findCommonPrefixIndex("same", "same")).toBe(4);
	});
});

describe("findPreviousWordIndex", () => {
	it("returns the start of the current word", () => {
		expect(findPreviousWordIndex("hello world", 11)).toBe(6);
	});

	it("returns 0 when there are no spaces", () => {
		expect(findPreviousWordIndex("hello", 5)).toBe(0);
	});

	it("skips trailing whitespace", () => {
		expect(findPreviousWordIndex("hello  ", 7)).toBe(0);
	});
});

describe("getNextText", () => {
	it("appends one character at a time when target is a forward extension", () => {
		expect(getNextText("hel", "hello", "type", "character")).toBe("hell");
	});

	it("removes one character at a time when backspace=character is needed", () => {
		expect(getNextText("hello!", "hello", "type", "character")).toBe("hello");
	});

	it("jumps to the common prefix when backspace=all", () => {
		expect(getNextText("hello world", "hello there", "type", "all")).toBe("hello ");
	});

	it("removes a whole word when backspace=word", () => {
		expect(getNextText("hello world", "hello there", "type", "word")).toBe("hello ");
	});

	it("replace=all returns nothing more than the next typed char", () => {
		// With replace="all" the caller is expected to reset the display
		// upstream, so getNextText keeps typing forward toward the new target.
		expect(getNextText("", "world", "all", "character")).toBe("w");
	});
});
