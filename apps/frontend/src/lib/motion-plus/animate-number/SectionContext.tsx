// Vendored from Motion+ (https://motion.dev/plus)
// License: MIT, for internal use of waifu.fun.
// Source: motion-plus@2.11.3

import { createContext } from "react";
import type { Justify } from "./types";

export const SectionContext = /** @__PURE__ */ createContext({
	justify: "left" as Justify,
});
