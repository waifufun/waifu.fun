import { Button } from "./ui/button";

export default function ChainSelector() {
	return (
		<div className="flex items-center gap-4">
			{["All", "Solana", "Ethereum", "Base"].map((chain) => (
				<Button key={chain}>{chain}</Button>
			))}
		</div>
	);
}
