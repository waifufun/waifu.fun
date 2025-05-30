export default function SwapStats({ minReceived, priceImpact }: { minReceived: string; priceImpact: string }) {
	return (
		<>
			<div className="flex font-medium justify-between text-base text-white">
				<p>Min Received</p>
				<p>{minReceived}</p>
			</div>

			<div className="flex font-medium justify-between text-base text-white">
				<p>Price Impact</p>
				<p>{priceImpact}</p>
			</div>
		</>
	);
}
