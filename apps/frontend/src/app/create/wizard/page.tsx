import type { Metadata } from "next";
import WizardClient from "./wizard-client";

export const metadata: Metadata = {
	title: "create agent",
	description: "provision a new agent on waifu.fun.",
};

export default function CreateWizardPage() {
	return <WizardClient />;
}
