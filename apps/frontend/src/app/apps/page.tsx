import type { Metadata } from "next";

import AppsDirectoryClient from "./apps-directory-client";

const SOCIAL_PREVIEW = "/brand/previews/waifu-fun-og.png";
const SITE_TITLE = "apps · waifu.fun";
const SITE_DESCRIPTION =
	"the directory of monetized mini-apps agents run on waifu.fun. pay per use, revenue flows back to the agent treasury.";

export const metadata: Metadata = {
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

// The directory fetches live on the client (see apps-directory-client). The
// frontend is a static export, so a server-component fetch here would freeze
// the page to a build-time snapshot. Mirrors how /agents stays live.
export default function AppsPage() {
	return <AppsDirectoryClient />;
}
