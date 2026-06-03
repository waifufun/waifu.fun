import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "") ?? "https://waifu.fun";

/**
 * Emits a static `robots.txt` (compatible with `output: "export"`). Allows
 * crawling of the public launchpad, keeps the admin surface out of the index,
 * and points crawlers at the sitemap.
 */
export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: "*",
			allow: "/",
			disallow: ["/admin"],
		},
		sitemap: `${SITE_URL}/sitemap.xml`,
		host: SITE_URL,
	};
}
