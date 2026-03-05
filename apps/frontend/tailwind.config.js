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
						primary: "#08080a",
						card: "#111114",
						"card-hover": "#18181c",
						input: "#0e0e12",
						elevated: "#1a1a1f",
						muted: "#0c0c0e",
					},
					stroke: {
						primary: "rgba(255, 255, 255, 0.06)",
						hover: "rgba(255, 255, 255, 0.12)",
						active: "rgba(139, 92, 246, 0.3)",
					},
					text: {
						primary: "#e4e4e7",
						secondary: "#71717a",
						tertiary: "#52525b",
						link: "#a78bfa",
					},
					accent: {
						violet: "#8b5cf6",
						pink: "#c084fc",
						cyan: "#67e8f9",
						green: "#4ade80",
						red: "#f87171",
					},
					glass: {
						bg: "rgba(17, 17, 20, 0.8)",
						border: "rgba(255, 255, 255, 0.08)",
					},
				},
			},
			keyframes: {
				"fade-in": {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				"glitch": {
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
						boxShadow: "0 0 20px rgba(139, 92, 246, 0.15)",
					},
					"50%": {
						boxShadow: "0 0 30px rgba(139, 92, 246, 0.25)",
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
				"flicker": {
					"0%, 100%": { opacity: "1" },
					"50%": { opacity: "0.97" },
					"52%": { opacity: "1" },
					"54%": { opacity: "0.98" },
					"56%": { opacity: "1" },
				},
			},
			animation: {
				"fade-in": "fade-in 0.2s ease-out",
				"glitch": "glitch 0.3s ease-in-out",
				"glitch-text": "glitch-text 0.5s ease-in-out",
				"glow-pulse": "glow-pulse 2s ease-in-out infinite",
				"float-jitter": "float-jitter 4s ease-in-out infinite",
				"scan-line": "scan-line 8s linear infinite",
				"flicker": "flicker 4s ease-in-out infinite",
			},
		},
	},
	plugins: [require("tailwindcss-animate"), require("tailwindcss-animated")],
};
