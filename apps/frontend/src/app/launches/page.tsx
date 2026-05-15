import type { Metadata } from "next";

import LaunchesDiscoverClient from "./launches-discover-client";

const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";
const SITE_TITLE = "live launches · waifu.fun";
const SITE_DESCRIPTION =
	"every round currently open on waifu.fun. deposit BNB during the 24h window, exit at the v2 graduation.";

export const revalidate = 10;

export const generateMetadata = async (): Promise<Metadata> => {
	return {
		title: SITE_TITLE,
		description: SITE_DESCRIPTION,
		openGraph: {
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			type: "website",
			locale: "en_US",
			images: [{ url: SOCIAL_PREVIEW, width: 2048, height: 1073, alt: "waifu.fun launches" }],
		},
		twitter: {
			card: "summary_large_image",
			title: SITE_TITLE,
			description: SITE_DESCRIPTION,
			images: [SOCIAL_PREVIEW],
		},
	};
};

export default function LaunchesPage() {
	return <LaunchesDiscoverClient />;
}
