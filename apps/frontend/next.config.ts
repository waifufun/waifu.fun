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
	eslint: {
		ignoreDuringBuilds: true,
	},
	reactStrictMode: false,
};

export default nextConfig;
