#!/usr/bin/env bun

interface EnvCheck {
	key: string;
	required: boolean;
	purpose: string;
}

const REQUIRED_CHECKS: EnvCheck[] = [
	{
		key: "NEXT_PUBLIC_JEJU_NETWORK",
		required: true,
		purpose: "Jeju network selection",
	},
	{ key: "MONGO_URI", required: true, purpose: "Database connection" },
	{ key: "REDIS_HOST", required: true, purpose: "Cache server" },
	{ key: "JWT_SECRET", required: true, purpose: "Auth tokens" },
];

const OPTIONAL_CHECKS: EnvCheck[] = [
	{
		key: "NEXT_PUBLIC_ALCHEMY_API_KEY",
		required: false,
		purpose: "Base/Ethereum chain support",
	},
	{ key: "NEXT_PUBLIC_HELIUS_API_KEY", required: false, purpose: "Solana support" },
	{
		key: "NEXT_PUBLIC_BSC_RPC_URL",
		required: false,
		purpose: "BSC support",
	},
	{
		key: "NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID",
		required: false,
		purpose: "EVM wallet connection",
	},
];

function validateEnv() {
	console.log("\n🔍 Environment Validation\n");

	let hasErrors = false;

	// Check required
	console.log("Required:");
	for (const check of REQUIRED_CHECKS) {
		const value = process.env[check.key];
		if (!value) {
			console.log(`  ❌ ${check.key} - ${check.purpose}`);
			hasErrors = true;
		} else {
			console.log(`  ✅ ${check.key}`);
		}
	}

	// Check optional
	console.log("\nOptional (features may be limited):");
	for (const check of OPTIONAL_CHECKS) {
		const value = process.env[check.key];
		if (!value) {
			console.log(`  ⚠️  ${check.key} - ${check.purpose}`);
		} else {
			console.log(`  ✅ ${check.key}`);
		}
	}

	if (hasErrors) {
		console.log("\n❌ Missing required environment variables!");
		console.log("Copy .env.example to .env and fill in the values.\n");
		process.exit(1);
	} else {
		console.log("\n✅ Environment validation passed!\n");
	}
}

validateEnv();
