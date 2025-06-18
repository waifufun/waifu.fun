import { SolanaRpcProvider } from "@autofun/rpc";
import { SolanaTransactionProcessor } from "../utils/solana/tx-processor";

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
async function processSignature(signature: string): Promise<any[]> {
	const rpc = new SolanaRpcProvider(101);
	const transaction = await rpc.getTransaction(signature);

	if (!transaction?.meta || transaction.meta.err) {
		return [];
	}

	const processor = new SolanaTransactionProcessor("CN2Km6FAncCu3mPKCMJhGwenAtC75MoNsoLuXGqwoC3q", true);

	const events = processor.processTransaction(transaction, transaction.blockTime || 0, transaction.slot);

	console.log("events: ", events);

	return events;
}

const testSignature = async () => {
	console.log("ewa");
	const signature = "2KdXn3uouKxNGAXszmDUi889hddPRbJCBPyeqy2uaogDRynvU1Jr9ZdKNLJRKrz38NCqUiE7aLmjbby7sajLARet";
	if (!signature) {
		console.error("Please provide a signature as a command line argument.");
		process.exit(1);
	}

	await processSignature(signature);
};

testSignature()
	.then(() => {
		console.log("Test completed successfully.");
		process.exit(0);
	})
	.catch((error) => {
		console.error("Error during test:", error);
		process.exit(1);
	});
