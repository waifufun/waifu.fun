import type { Configuration } from "webpack";

const nextConfig = {
	output: "standalone",
	webpack: (config: Configuration, { isServer }: { isServer: boolean }) => {
		if (!isServer) {
			if (config?.resolve?.fallback) {
				config.resolve.fallback = {
					...config.resolve.fallback,
					crypto: require.resolve("crypto-browserify"),
					stream: require.resolve("stream-browserify"),
					buffer: require.resolve("buffer"),
				};

				// config.resolve.fallback.fs = false;
			}
		}

		return config;
	},
	images: {
		domains: ["v3.fal.media"],
	},
	env: {
		NEXT_PUBLIC_DECIMALS: process.env.NEXT_PUBLIC_DECIMALS,
		NEXT_PUBLIC_TOKEN_SUPPLY: process.env.NEXT_PUBLIC_TOKEN_SUPPLY,
		NEXT_PUBLIC_VIRTUAL_RESERVES: process.env.NEXT_PUBLIC_VIRTUAL_RESERVES,
		NEXT_PUBLIC_HOST: process.env.NEXT_PUBLIC_HOST,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	},
	typescript: {
		// !! WARN !!
		// Dangerously allow production builds to successfully complete even if
		// your project has type errors.
		// !! WARN !!
		ignoreBuildErrors: true,
	},
	eslint: {
		ignoreDuringBuilds: true,
	},
	reactStrictMode: false,
};

export default nextConfig;
