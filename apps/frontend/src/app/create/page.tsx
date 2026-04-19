import { redirect } from "next/navigation";

export default function CreatePage() {
	// /create is dead — agents launch themselves via the API.
	// See /for-agents for the spec.
	redirect("/");
}
