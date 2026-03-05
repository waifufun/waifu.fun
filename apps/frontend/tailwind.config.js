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
						card: "#141414",
						"action-primary": "#2E2E2E",
						disabled: "#505050",
						input: "#212121",
						"action-secondary": "#1a0a1f",
						highlight: "hsl(270, 50%, 55%)",
						"action-highlight": "hsl(270, 50%, 55%)",
						"action-disabled": "#171717",
						muted: "#0C0C0C",
					},
					stroke: {
						primary: "#262626",
						highlight: "hsl(270, 50%, 55%)",
						light: "#707070",
						cyan: "hsl(180, 40%, 65%)",
						pink: "hsl(330, 45%, 60%)",
					},
					text: {
						highlight: "hsl(270, 50%, 55%)",
						primary: "#e8e8e8",
						secondary: "#8a8a8a",
						disabled: "#505050",
						info: "#a6a6a6",
						error: "#ff4444",
						cyan: "hsl(180, 40%, 65%)",
						pink: "hsl(330, 45%, 60%)",
					},
					icon: {
						primary: "#e8e8e8",
						secondary: "#8c8c8c",
						disabled: "#505050",
						highlight: "hsl(270, 50%, 55%)",
						cyan: "hsl(180, 40%, 65%)",
					},
					neon: {
						pink: "hsl(330, 45%, 60%)",
						cyan: "hsl(180, 40%, 65%)",
						purple: "hsl(270, 50%, 55%)",
						green: "hsl(150, 35%, 55%)",
					},
				},
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				"glitch": {
					"0%": { transform: "translate(0)", opacity: "1" },
					"20%": { transform: "translate(-3px, 3px)", opacity: "0.8" },
					"40%": { transform: "translate(3px, -3px)", opacity: "0.8" },
					"60%": { transform: "translate(-3px, -3px)", opacity: "1" },
					"80%": { transform: "translate(3px, 3px)", opacity: "0.9" },
					"100%": { transform: "translate(0)", opacity: "1" },
				},
				"glitch-text": {
					"0%": { clipPath: "inset(0 0 0 0)" },
					"5%": { clipPath: "inset(40% 0 40% 0)", transform: "translateX(-3px)" },
					"10%": { clipPath: "inset(70% 0 10% 0)", transform: "translateX(3px)" },
					"15%": { clipPath: "inset(20% 0 60% 0)", transform: "translateX(-2px)" },
					"20%": { clipPath: "inset(0 0 0 0)", transform: "translateX(0)" },
					"100%": { clipPath: "inset(0 0 0 0)", transform: "translateX(0)" },
				},
				"glow-pulse": {
					"0%, 100%": { 
						textShadow: "0 0 8px hsl(270, 50%, 55%, 0.3), 0 0 16px hsl(270, 50%, 55%, 0.2)",
						filter: "brightness(1)"
					},
					"50%": { 
						textShadow: "0 0 12px hsl(180, 40%, 65%, 0.4), 0 0 24px hsl(180, 40%, 65%, 0.25)",
						filter: "brightness(1.1)"
					},
				},
				"float-jitter": {
					"0%": { transform: "translateY(0px) translateX(0px)" },
					"25%": { transform: "translateY(-8px) translateX(2px)" },
					"50%": { transform: "translateY(-15px) translateX(-2px)" },
					"75%": { transform: "translateY(-8px) translateX(1px)" },
					"100%": { transform: "translateY(0px) translateX(0px)" },
				},
				"scan-line": {
					"0%": { transform: "translateY(-100%)" },
					"100%": { transform: "translateY(100vh)" },
				},
				"flicker": {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0.95" },
					"55%": { opacity: "1" },
					"60%": { opacity: "0.97" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.2s ease-out",
				"glitch": "glitch 0.5s cubic-bezier(.25,.46,.45,.94)",
				"glitch-text": "glitch-text 8s infinite",
				"glow-pulse": "glow-pulse 3s ease-in-out infinite",
				"float-jitter": "float-jitter 4s ease-in-out infinite",
				"scan-line": "scan-line 8s linear infinite",
				"flicker": "flicker 0.15s infinite",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
