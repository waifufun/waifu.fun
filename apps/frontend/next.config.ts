import type { NextConfig } from "next";
import type { Configuration as WebpackConfiguration } from "webpack";

const nextConfig: NextConfig = {
	output: "export",
	transpilePackages: ["@waifufun/types", "@waifufun/constants"],
	turbopack: {},
	webpack: (config: WebpackConfiguration, { isServer }: { isServer: boolean }) => {
		if (!isServer && config.resolve && typeof config.resolve === "object") {
			const fallback = config.resolve.fallback ?? {};
			config.resolve.fallback = {
				...fallback,
				crypto: require.resolve("crypto-browserify"),
				stream: require.resolve("stream-browserify"),
				buffer: require.resolve("buffer"),
				fs: false,
			};
		}

		return config;
	},
	images: {
		domains: ["v3.fal.media", "fal.media", "picsum.photos", "cdn.dexscreener.com", "ipfs.io"],
		unoptimized: true,
	},
	reactStrictMode: false,
	env: {
		NEXT_PUBLIC_DECIMALS: process.env.NEXT_PUBLIC_DECIMALS,
		NEXT_PUBLIC_TOKEN_SUPPLY: process.env.NEXT_PUBLIC_TOKEN_SUPPLY,
		NEXT_PUBLIC_VIRTUAL_RESERVES: process.env.NEXT_PUBLIC_VIRTUAL_RESERVES,
		NEXT_PUBLIC_HOST: process.env.NEXT_PUBLIC_HOST,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
		NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
			process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? process.env.NEXT_PUBLIC_PROJECT_ID,
	},
};

export default nextConfig;
