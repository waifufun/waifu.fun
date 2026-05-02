import OAuthConnectPanel from "@/components/auth/oauth-connect-panel";
import type { Metadata } from "next";

/**
 * Standalone sign-in surface for the W9.5 Steward OAuth bridge.
 *
 * Linked to from the StewardConnectModal CTAs and used as the fallback
 * destination when the modal isn't open (e.g. an auth-required route
 * redirect lands here with `?return_to=/the/original/path`).
 */
export const metadata: Metadata = {
	title: "sign in / waifu.fun",
	description: "sign in to waifu.fun via steward.",
};

export default function AuthConnectPage() {
	return (
		<div className="min-h-[100dvh] flex items-center justify-center bg-[#08080a] px-6 py-16">
			<OAuthConnectPanel />
		</div>
	);
}
