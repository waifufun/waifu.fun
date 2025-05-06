import esbuild from "esbuild";

const generateSourcemaps = process.argv.includes("--sourcemap");

await esbuild.build({
	bundle: true,
	entryPoints: ["./src/index.ts"],
	outdir: "./dist",
	platform: "node",
	format: "esm",
	target: "node20",
	external: ["sharp"],
	sourcemap: generateSourcemaps, // Enable sourcemaps conditionally
	banner: {
		js: 'import { createRequire } from "module"; import url from "url"; const require = createRequire(import.meta.url); const __filename = url.fileURLToPath(import.meta.url); const __dirname = url.fileURLToPath(new URL(".", import.meta.url));',
	},
});
