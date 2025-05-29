import { adjectives, exampleFormats, ideas, nouns } from "./constants";

interface TokenPromptData {
	prompt?: string;
}

interface NewsArticle {
	title: string;
}

interface NewsResponse {
	articles: NewsArticle[];
}

async function fetchTrendingTopics(): Promise<string[]> {
	const newsApiKey = process.env.NEWS_API_KEY;
	if (!newsApiKey) return [];

	try {
		const response = await fetch(`https://newsapi.org/v2/top-headlines?country=us&apiKey=${newsApiKey}`, {
			headers: { Accept: "application/json" },
		});

		if (!response.ok) return [];

		const data = (await response.json()) as NewsResponse;
		return data.articles
			.filter((article) => article.title)
			.map((article) => article.title.replace(/\s-\s.*$/, "").trim())
			.slice(0, 5);
	} catch (error) {
		console.error("Error fetching trending topics:", error);
		return [];
	}
}

function generateRandomConcept(): string {
	const getRandomItem = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];

	const concept1 = `${getRandomItem(adjectives)} ${getRandomItem(ideas)} ${getRandomItem(nouns)}`;
	const concept2 = `${getRandomItem(adjectives)} ${getRandomItem(ideas)} ${getRandomItem(nouns)}`;

	return `The token should be based on this concept: "${concept1}".
Alternatively, you can use the following concept: "${concept2}".
Make it edgy, funny, and internet culture related. The name should be catchy and memorable.
The symbol should be 3-5 characters and easily recognizable.`;
}

export async function createTokenPrompt(data?: TokenPromptData): Promise<string> {
	const userInstructions = data?.prompt
		? `The token should be based on this concept: "${data.prompt}". 
Make sure the token name, symbol, description and image prompt directly incorporate elements from this concept.
For example, if the concept is "a halloween token about arnold schwarzenegger", the token might be named "Spooky Schwartz" with symbol "SPKS" and an image prompt that describes a muscular halloween figure resembling Arnold.
Be creative but stay faithful to the concept.`
		: generateRandomConcept();

	const trendingTopics = await fetchTrendingTopics();
	const trendingTopicsPrompt =
		trendingTopics.length > 0
			? `\nHere are some current trending topics for inspiration (optional):\n- ${trendingTopics.join("\n- ")}`
			: "";

	return `Generate prompt and engaging token metadata for a Solana token. The token should be fun, memorable, and captivating to crypto enthusiasts. ${userInstructions}${trendingTopicsPrompt}

The token should have meme potential and appeal to internet culture. Make it attention-grabbing and shareable.

Return ONLY a JSON object with the following fields:
- name: A memorable name for the token that clearly reflects the concept (max 20 characters)
- symbol: A 3-5 character symbol for the token (preferably all caps)
- description: A compelling description of the token that incorporates the concept (100-150 characters)
- prompt: A detailed prompt for image generation that will create a visual representation of the concept

Example format:
\`\`\`json
${exampleFormats[Math.floor(Math.random() * exampleFormats.length)]}
\`\`\`

Only provide the JSON object. Do not include any other text, explanation, or formatting.`;
}
