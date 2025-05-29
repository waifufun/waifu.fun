const nextConfig = {
	output: "standalone",
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
	},
	reactStrictMode: false,
	env: {
		NEXT_PUBLIC_DECIMALS: process.env.NEXT_PUBLIC_DECIMALS,
		NEXT_PUBLIC_TOKEN_SUPPLY: process.env.NEXT_PUBLIC_TOKEN_SUPPLY,
		NEXT_PUBLIC_VIRTUAL_RESERVES: process.env.NEXT_PUBLIC_VIRTUAL_RESERVES,
		NEXT_PUBLIC_HOST: process.env.NEXT_PUBLIC_HOST,
		NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
	},
	outputFileTracingExcludes: {
		"*": [
			"node_modules/@swc/core-linux-x64-gnu",
			"node_modules/@swc/core-linux-x64-musl",
			"node_modules/@esbuild/linux-x64",
		],
	},
	experimental: {
		// Disable symlinks in the build process
		disableOptimizedLoading: true,
		disablePostcssPresetEnv: true,
	},
};

export default nextConfig;
