/**
 * Per-agent theme system. Today: hardcoded to platform default
 * (waifu.fun green #00ff87). Future: each agent's theme lives in
 * its on-chain metadata and gets rendered as a CSS-variable scope.
 */

export type AgentTheme = {
	accent: string;
	accentSoft: string;
	accentDim: string;
};

export const PLATFORM_THEME: AgentTheme = {
	accent: "#00ff87",
	accentSoft: "rgba(0, 255, 135, 0.12)",
	accentDim: "#00cc6a",
};

export function themeToCssVars(theme: AgentTheme): Record<string, string> {
	return {
		"--accent": theme.accent,
		"--accent-soft": theme.accentSoft,
		"--accent-dim": theme.accentDim,
	};
}
