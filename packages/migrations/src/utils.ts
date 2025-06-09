export async function retryOperation<T>(operation: () => Promise<T>, maxRetries: number, delay: number): Promise<T> {
	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			return await operation();
		} catch (error) {
			if (attempt === maxRetries - 1) throw error;
			await new Promise((resolve) => setTimeout(resolve, delay));
		}
	}
	throw new Error("Unreachable");
}
