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
				autofun: {
					background: {
						primary: "#0a0a0a",
						card: "#171717",
						"action-primary": "#2E2E2E",
						disabled: "#505050",
						input: "#212121",
						"action-secondary": "#092f0e",
						highlight: "#00FF87",
						"action-highlight": "#00FF87",
						"action-disabled": "#171717",
						muted: "#0C0C0C",
					},
					stroke: {
						primary: "#262626",
						highlight: "#00FF87",
						light: "#707070",
					},
					text: {
						highlight: "#00FF87",
						primary: "#ffffff",
						secondary: "#8c8c8c",
						disabled: "#505050",
						info: "#a6a6a6",
						error: "#872C2C",
					},
					icon: {
						primary: "#ffffff",
						secondary: "#8c8c8c",
						disabled: "#505050",
						highlight: "#00FF87",
					},
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
					"0%, 100%": { clipPath: "inset(0 0 0 0)", transform: "translate(0)" },
					"20%": { clipPath: "inset(20% 0 60% 0)", transform: "translate(-2px, 1px)" },
					"40%": { clipPath: "inset(60% 0 10% 0)", transform: "translate(2px, -1px)" },
					"60%": { clipPath: "inset(40% 0 30% 0)", transform: "translate(-1px, 2px)" },
					"80%": { clipPath: "inset(10% 0 70% 0)", transform: "translate(1px, -2px)" },
				},
				scanline: {
					"0%": { backgroundPosition: "0 0" },
					"100%": { backgroundPosition: "0 100%" },
				},
				noise: {
					"0%, 100%": { backgroundPosition: "0 0" },
					"10%": { backgroundPosition: "-5% -10%" },
					"30%": { backgroundPosition: "3% -15%" },
					"50%": { backgroundPosition: "12% 9%" },
					"70%": { backgroundPosition: "9% 4%" },
					"90%": { backgroundPosition: "-1% 7%" },
				},
				"pulse-green": {
					"0%, 100%": { boxShadow: "0 0 5px rgba(0,255,135,0.3)" },
					"50%": { boxShadow: "0 0 20px rgba(0,255,135,0.6)" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.2s ease-out",
				glitch: "glitch 3s infinite",
				scanline: "scanline 8s linear infinite",
				noise: "noise 0.5s steps(8) infinite",
				"pulse-green": "pulse-green 2s ease-in-out infinite",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
