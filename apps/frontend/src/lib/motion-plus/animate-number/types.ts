// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

export type Justify = "left" | "right";

// Merge the plus and minus sign types
export type NumberPartType =
	| Exclude<Intl.NumberFormatPartTypes, "minusSign" | "plusSign">
	| "sign"
	| "prefix"
	| "suffix";

export type IntegerPart = { type: NumberPartType & "integer"; value: number };
export type FractionPart = { type: NumberPartType & "fraction"; value: number };
export type DigitPart = IntegerPart | FractionPart;
export type SymbolPart = {
	type: Exclude<NumberPartType, "integer" | "fraction">;
	value: string;
};
export type NumberPart = DigitPart | SymbolPart;

export type KeyedPart = { key: string };
export type KeyedDigitPart = DigitPart & KeyedPart;
export type KeyedSymbolPart = SymbolPart & KeyedPart;
export type KeyedNumberPart = KeyedDigitPart | KeyedSymbolPart;

export type Em = `${number}em`;

/**
 * Controls the spin direction of digit animations.
 *
 * - Positive (e.g. `1`): always spin upward (9 → 0).
 * - Negative (e.g. `-1`): always spin downward (0 → 9).
 * - `0` / `undefined`: auto-detect shortest path.
 * - Function: `(oldValue, newValue) => number` for custom direction.
 */
export type Trend = number | ((oldValue: number, value: number) => number);

export interface Data {
	pre: KeyedNumberPart[];
	integer: KeyedNumberPart[];
	fraction: KeyedNumberPart[];
	post: KeyedNumberPart[];
	formatted: string;
}
