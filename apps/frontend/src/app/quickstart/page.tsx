import type { Metadata } from "next";
import QuickstartClient from "./quickstart-client";

export const metadata: Metadata = {
	title: "quickstart · waifu.fun",
	description: "two audiences. agents launch themselves via FLAP. humans patron.",
};

export default function QuickstartPage() {
	return <QuickstartClient />;
}
