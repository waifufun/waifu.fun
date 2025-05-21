import { Metadata } from "next";
import ImportForm from "./import-form";

export const metadata: Metadata = {
	title: "Import Token",
	description: "Import existing tokens on Auto.Fun - Support for Solana, Base, and Ethereum tokens",
	openGraph: {
		title: "Import Token on Auto.Fun",
		description: "Import existing tokens on Auto.Fun - Support for Solana, Base, and Ethereum tokens",
		images: ["/logo_wide.svg"],
	},
	twitter: {
		card: "summary_large_image",
		title: "Import Token on Auto.Fun",
		description: "Import existing tokens on Auto.Fun - Support for Solana, Base, and Ethereum tokens",
		images: ["/logo_wide.svg"],
	},
};

export default function Page() {
	return <ImportForm />;
}
