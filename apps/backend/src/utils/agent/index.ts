import { FLEEK_API_URL } from "@autofun/constants";

interface CreateAIAgentRequest {
	avatar?: string | null;
	config: string;
	frameworkVersion?: string | null;
	managedModelName?: string | null;
	name: string;
	projectId: string;
	publicChat?: boolean | null;
	referral?: string | null;
	referralTokenId?: string | null;
	tee?: boolean | null;
}

export async function createAgent(body: CreateAIAgentRequest) {
	const response = await fetch(`${FLEEK_API_URL}/api/v2/ai-agents`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			"X-Api-Key": process.env.FLEEK_API_KEY || "",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw { status: response.status, message: errorData };
	}

	return response.json();
}

export async function getAgent(agentId: string) {
	console.log("running")
	const response = await fetch(`${FLEEK_API_URL}/api/v1/ai-agents/${agentId}`, {
		headers: {
			"X-Api-Key": process.env.FLEEK_API_KEY || "",
		},
	});

	return console.log(response);
}
