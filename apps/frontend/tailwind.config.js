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
				mono: ["JetBrains Mono", "monospace"],
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
					DEFAULT: "hsl(var(--accent))",
					foreground: "hsl(var(--accent-foreground))",
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
				waifufun: {
					background: {
						primary: "#0a0a0a",
						card: "#171717",
						"action-primary": "#2E2E2E",
						disabled: "#505050",
						input: "#212121",
						"action-secondary": "#1a0a1f",
						highlight: "#ff00ff",
						"action-highlight": "#ff00ff",
						"action-disabled": "#171717",
						muted: "#0C0C0C",
					},
					stroke: {
						primary: "#262626",
						highlight: "#ff00ff",
						light: "#707070",
						cyan: "#00ffff",
						pink: "#ff69b4",
					},
					text: {
						highlight: "#ff00ff",
						primary: "#ffffff",
						secondary: "#a8a8a8",
						disabled: "#505050",
						info: "#a6a6a6",
						error: "#ff4444",
						cyan: "#00ffff",
						pink: "#ff69b4",
					},
					icon: {
						primary: "#ffffff",
						secondary: "#8c8c8c",
						disabled: "#505050",
						highlight: "#ff00ff",
						cyan: "#00ffff",
					},
					neon: {
						pink: "#ff00ff",
						cyan: "#00ffff",
						purple: "#8b00ff",
						blue: "#0099ff",
					},
				},
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				"glitch": {
					"0%, 100%": { transform: "translate(0)" },
					"20%": { transform: "translate(-2px, 2px)" },
					"40%": { transform: "translate(-2px, -2px)" },
					"60%": { transform: "translate(2px, 2px)" },
					"80%": { transform: "translate(2px, -2px)" },
				},
				"glow": {
					"0%, 100%": { textShadow: "0 0 10px #ff00ff, 0 0 20px #ff00ff, 0 0 30px #ff00ff" },
					"50%": { textShadow: "0 0 20px #00ffff, 0 0 30px #00ffff, 0 0 40px #00ffff" },
				},
				"float": {
					"0%, 100%": { transform: "translateY(0px)" },
					"50%": { transform: "translateY(-20px)" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.2s ease-out",
				"glitch": "glitch 0.3s cubic-bezier(.25,.46,.45,.94) infinite",
				"glow": "glow 2s ease-in-out infinite",
				"float": "float 3s ease-in-out infinite",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
