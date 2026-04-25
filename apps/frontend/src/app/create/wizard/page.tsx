import type { Metadata } from "next";
import WizardClient from "./wizard-client";

export const metadata: Metadata = {
	title: "Create agent",
	description: "Provision a new agent on waifu.fun.",
};

export default function CreateWizardPage() {
	return <WizardClient />;
}
