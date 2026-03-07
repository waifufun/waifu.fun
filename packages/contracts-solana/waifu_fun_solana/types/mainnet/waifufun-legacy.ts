import type { Autofun } from "./waifufun";

/** Legacy (v1) program IDL type — same structure as current, different program address. */
export type AutofunLegacy = Omit<Autofun, "address"> & {
	address: "autoUmixaMaYKFjexMpQuBpNYntgbkzCo2b1ZqUaAZ5";
};
