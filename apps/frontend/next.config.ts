import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
		domains: ["v3.fal.media"],
		remotePatterns: [
			{
			  protocol: 'http',
			  hostname: 'localhost',
			  port: '9000',
			  pathname: '/autofun/avatar-images/**',
			},
		  ],
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
