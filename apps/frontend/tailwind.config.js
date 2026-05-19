module.exports = {
	content: ["./src/**/*.{html,js,jsx,ts,tsx}", "./*.{html}"],
	theme: {
		extend: {
			container: {
				center: true,
				padding: {
					sm: "0.5rem",
					md: "1rem",
				},
			},
			fontFamily: {
				satoshi: ["Satoshi", "sans-serif"],
				mono: ["JetBrains Mono", "DM Mono", "DMMono", "monospace"],
				orbitron: ["var(--font-orbitron)", "system-ui"],
				audiowide: ["var(--font-audiowide)", "system-ui"],
			},
			colors: {
				border: "hsl(var(--border))",
				input: "hsl(var(--input))",
				ring: "hsl(var(--ring))",
				background: "hsl(var(--background))",
				foreground: "hsl(var(--foreground))",
				primary: {
					DEFAULT: "hsl(var(--primary))",
					foreground: "hsl(var(--primary-foreground))",
				},
				secondary: {
					DEFAULT: "hsl(var(--secondary))",
					foreground: "hsl(var(--secondary-foreground))",
				},
				destructive: {
					DEFAULT: "hsl(var(--destructive))",
					foreground: "hsl(var(--destructive-foreground))",
				},
				muted: {
					DEFAULT: "hsl(var(--muted))",
					foreground: "hsl(var(--muted-foreground))",
				},
				accent: {
					DEFAULT: "#00ff87",
					foreground: "hsl(var(--accent-foreground))",
					dim: "#00cc6a",
					wash: "rgba(0, 255, 135, 0.06)",
					ring: "rgba(0, 255, 135, 0.16)",
				},
				popover: {
					DEFAULT: "hsl(var(--popover))",
					foreground: "hsl(var(--popover-foreground))",
				},
				card: {
					DEFAULT: "hsl(var(--card))",
					foreground: "hsl(var(--card-foreground))",
				},
				sidebar: {
					DEFAULT: "hsl(var(--sidebar-background))",
					foreground: "hsl(var(--sidebar-foreground))",
					primary: "hsl(var(--sidebar-primary))",
					"primary-foreground": "hsl(var(--sidebar-primary-foreground))",
					accent: "hsl(var(--sidebar-accent))",
					"accent-foreground": "hsl(var(--sidebar-accent-foreground))",
					border: "hsl(var(--sidebar-border))",
					ring: "hsl(var(--sidebar-ring))",
				},
				stroke: {
					DEFAULT: "rgba(255, 255, 255, 0.06)",
					strong: "rgba(255, 255, 255, 0.16)",
					intense: "rgba(255, 255, 255, 0.24)",
				},
				canvas: "#08080a",
				"surface-card": "#111114",
				"surface-muted": "#0c0c0e",
				"surface-elevated": "#0a0a0c",
				// Canonical design token namespace `wf`. The single source of truth for
				// surfaces, strokes, text, and accent. New components should use these;
				// existing components migrate incrementally in follow-up PRs.
				wf: {
					bg: "#08080a", // page background
					"surface-1": "#08080a", // card background (matches launch-card)
					"surface-2": "#0a0a0c", // hover / slightly elevated
					"surface-3": "#111114", // elevated surface / nested
					"surface-input": "#0e0e12", // form input background
					"stroke-1": "rgba(255, 255, 255, 0.06)", // hairline border
					"stroke-2": "rgba(255, 255, 255, 0.10)", // default card border
					"stroke-3": "rgba(255, 255, 255, 0.16)", // emphasized border
					"stroke-accent": "rgba(0, 255, 135, 0.30)", // hover / active accent border
					"text-1": "#e4e4e7", // primary text
					"text-2": "rgba(255, 255, 255, 0.65)", // secondary text
					"text-3": "rgba(255, 255, 255, 0.45)", // tertiary text / mono labels
					"text-4": "rgba(255, 255, 255, 0.30)", // disabled / faint
					accent: "#00ff87",
					"accent-dim": "#00cc6a",
					"accent-wash": "rgba(0, 255, 135, 0.06)",
					"accent-ring": "rgba(0, 255, 135, 0.30)",
					warning: "#facc15",
					success: "#00ff87",
					danger: "#f87171",
				},
				waifu: {
					green: "#00FF87",
					"green-dim": "#00CC6A",
					black: "#08080A",
					surface: "#111114",
					gray: "#A0A0A0",
					magenta: "#FF32B4",
					cyan: "#00C8FF",
				},
				waifufun: {
					background: {
						primary: "#08080a",
						card: "#111114",
						"card-hover": "#18181c",
						input: "#0e0e12",
						elevated: "#0a0a0c",
						muted: "#0c0c0e",
						// Previously referenced by table.tsx but never defined. Mapped
						// to the canonical accent so the class actually renders.
						"action-highlight": "#00ff87",
					},
					stroke: {
						primary: "rgba(255, 255, 255, 0.06)",
						hover: "rgba(255, 255, 255, 0.12)",
						active: "rgba(0, 255, 135, 0.25)",
					},
					text: {
						primary: "#e4e4e7",
						secondary: "#a1a1aa",
						tertiary: "#52525b",
						link: "#00ff87",
						// Previously referenced by button + table + input but never
						// defined. Maps to the canonical accent so default buttons
						// stop rendering with a transparent background.
						highlight: "#00ff87",
					},
					accent: {
						green: "#00ff87",
						emerald: "#22c55e",
						deep: "#065f46",
						red: "#f87171",
					},
					glass: {
						bg: "rgba(17, 17, 20, 0.8)",
						border: "rgba(255, 255, 255, 0.08)",
					},
				},
			},
			boxShadow: {
				crt: "0 0 20px rgba(0,255,135,0.15), inset 0 0 20px rgba(0,255,135,0.05)",
				"crt-sm": "0 0 10px rgba(0,255,135,0.1)",
				"crt-lg": "0 0 40px rgba(0,255,135,0.2)",
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				glitch: {
					"0%, 100%": {
						transform: "translate(0)",
						opacity: "1",
					},
					"20%": {
						transform: "translate(-2px, 2px)",
						opacity: "0.8",
					},
					"40%": {
						transform: "translate(2px, -2px)",
						opacity: "0.9",
					},
					"60%": {
						transform: "translate(-1px, 1px)",
						opacity: "0.8",
					},
					"80%": {
						transform: "translate(1px, -1px)",
						opacity: "0.9",
					},
				},
				"glitch-text": {
					"0%, 100%": {
						clipPath: "inset(0 0 0 0)",
						transform: "translate(0)",
					},
					"5%": {
						clipPath: "inset(40% 0 30% 0)",
						transform: "translate(-3px, 0)",
					},
					"10%": {
						clipPath: "inset(10% 0 60% 0)",
						transform: "translate(3px, 0)",
					},
					"15%": {
						clipPath: "inset(80% 0 5% 0)",
						transform: "translate(-2px, 0)",
					},
					"20%, 100%": {
						clipPath: "inset(0 0 0 0)",
						transform: "translate(0)",
					},
				},
				"glow-pulse": {
					"0%, 100%": {
						boxShadow: "0 0 20px rgba(0, 255, 135, 0.1)",
					},
					"50%": {
						boxShadow: "0 0 30px rgba(0, 255, 135, 0.15)",
					},
				},
				"float-jitter": {
					"0%, 100%": {
						transform: "translateY(0) rotate(0deg)",
					},
					"25%": {
						transform: "translateY(-2px) rotate(0.5deg)",
					},
					"50%": {
						transform: "translateY(0) rotate(-0.5deg)",
					},
					"75%": {
						transform: "translateY(1px) rotate(0.25deg)",
					},
				},
				"scan-line": {
					"0%": {
						transform: "translateY(-100%)",
					},
					"100%": {
						transform: "translateY(100vh)",
					},
				},
				flicker: {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0.97" },
					"52%": { opacity: "1" },
					"54%": { opacity: "0.98" },
					"56%": { opacity: "1" },
				},
				shimmer: {
					"0%": { transform: "translateX(-100%)" },
					"100%": { transform: "translateX(100%)" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.2s ease-out",
				glitch: "glitch 0.3s ease-in-out",
				"glitch-text": "glitch-text 0.5s ease-in-out",
				"glow-pulse": "glow-pulse 2s ease-in-out infinite",
				"float-jitter": "float-jitter 4s ease-in-out infinite",
				"scan-line": "scan-line 8s linear infinite",
				flicker: "flicker 4s ease-in-out infinite",
				shimmer: "shimmer 2s ease-in-out infinite",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
