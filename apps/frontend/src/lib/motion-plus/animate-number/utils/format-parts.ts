// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import type { Data, KeyedNumberPart, NumberPart, NumberPartType } from "../types";

export const formatToParts = (
	value: number | bigint | string,
	{
		locales,
		format,
	}: { locales?: Intl.LocalesArgument; format?: Intl.NumberFormatOptions },
	prefix?: string,
	suffix?: string,
): Data => {
	const formatter = new Intl.NumberFormat(locales, format);
	const parts: Array<
		Omit<Intl.NumberFormatPart, "type"> & {
			type: Intl.NumberFormatPartTypes | "prefix" | "suffix";
		}
	> = formatter.formatToParts(Number(value));
	if (prefix) parts.unshift({ type: "prefix", value: prefix });
	if (suffix) parts.push({ type: "suffix", value: suffix });

	const pre: KeyedNumberPart[] = [];
	const _integer: NumberPart[] = []; // second pass to key these RTL
	const fraction: KeyedNumberPart[] = [];
	const post: KeyedNumberPart[] = [];

	const counts: Partial<Record<NumberPartType, number>> = {};
	const generateKey = (type: NumberPartType) =>
		`${type}:${(counts[type] = (counts[type] ?? -1) + 1)}`;

	let formatted = "";
	let seenInteger = false;
	let seenDecimal = false;
	for (const part of parts) {
		formatted += part.value;

		// Merge plus and minus sign types (this shape appeases TypeScript).
		const type: NumberPartType =
			part.type === "minusSign" || part.type === "plusSign" ? "sign" : (part.type as NumberPartType);

		switch (type) {
			case "integer":
				seenInteger = true;
				_integer.push(
					...part.value.split("").map((d) => ({ type, value: parseInt(d, 10) })),
				);
				break;
			case "group":
				_integer.push({ type, value: part.value });
				break;
			case "decimal":
				seenDecimal = true;
				fraction.push({
					type,
					value: part.value,
					key: generateKey(type),
				});
				break;
			case "fraction":
				fraction.push(
					...part.value.split("").map((d) => ({
						type,
						value: parseInt(d, 10),
						key: generateKey(type),
					})),
				);
				break;
			default:
				(seenInteger || seenDecimal ? post : pre).push({
					type,
					value: part.value,
					key: generateKey(type),
				});
		}
	}

	const integer: KeyedNumberPart[] = [];
	// Key the integer parts RTL for better layout animations.
	for (let i = _integer.length - 1; i >= 0; i--) {
		const entry = _integer[i];
		if (!entry) continue;
		integer.unshift({
			...entry,
			key: generateKey(entry.type),
		});
	}

	return { pre, integer, fraction, post, formatted };
};
