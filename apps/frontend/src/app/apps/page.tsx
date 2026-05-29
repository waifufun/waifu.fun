import type { Metadata } from "next";

import { fetchAppsDirectory } from "@/lib/wave-t/apps-directory";
import AppsDirectoryClient from "./apps-directory-client";

const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";
const SITE_TITLE = "apps · waifu.fun";
const SITE_DESCRIPTION =
	"the directory of monetized mini-apps agents run on waifu.fun. pay per use, revenue flows back to the agent treasury.";

// Apps registry counters revalidate on the minute; the page caches for 60s.
export const revalidate = 60;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		openGraph: {
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			type: "website",
			locale: "en_US",
			images: [{ url: SOCIAL_PREVIEW, width: 2048, height: 1073, alt: "waifu.fun apps" }],
		},
		twitter: {
			card: "summary_large_image",
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			images: [SOCIAL_PREVIEW],
		},
	};
};

export default async function AppsPage() {
	const directory = await fetchAppsDirectory();
	return <AppsDirectoryClient directory={directory} />;
}
