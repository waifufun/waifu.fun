import type { NextConfig } from "next";

const API_ORIGIN = process.env.API_ORIGIN || "http://89.167.63.246";

const nextConfig: NextConfig = {
	turbopack: {},
	async rewrites() {
		return [
			{
				source: "/api/v1/:path*",
				destination: `${API_ORIGIN}/:path*`,
			},
		];
	},
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
	webpack: (config: { resolve: { fallback: { [key: string]: any } } }, { isServer }: any) => {
		if (!isServer) {
			config.resolve.fallback = {
				...config.resolve.fallback,
				crypto: require.resolve("crypto-browserify"),
				stream: require.resolve("stream-browserify"),
				buffer: require.resolve("buffer"),
			};

			config.resolve.fallback.fs = false;
		}

		return config;
	},
	images: {
		domains: ["v3.fal.media", "fal.media", "picsum.photos", "cdn.dexscreener.com", "ipfs.io"],
	},
	reactStrictMode: false,
	env: {
		NEXT_PUBLIC_DECIMALS: process.env.NEXT_PUBLIC_DECIMALS,
		NEXT_PUBLIC_TOKEN_SUPPLY: process.env.NEXT_PUBLIC_TOKEN_SUPPLY,
		NEXT_PUBLIC_VIRTUAL_RESERVES: process.env.NEXT_PUBLIC_VIRTUAL_RESERVES,
		NEXT_PUBLIC_HOST: process.env.NEXT_PUBLIC_HOST,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
		NEXT_PUBLIC_PROJECT_ID: process.env.NEXT_PUBLIC_PROJECT_ID,
	},
};

export default nextConfig;
