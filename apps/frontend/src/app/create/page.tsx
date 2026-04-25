import { redirect } from "next/navigation";

export default function CreatePage() {
	// Legacy /create route. The v3 agent-first flow lives at /create/wizard.
	// W7.2 will remove this stub once any third-party links are migrated.
	redirect("/create/wizard");
}
