export default function PointCounter({ points }: { points: number }) {
	return (
		<div className="w-[768px] h-[198px] bg-[#0F0F0F] border rounded-md border-[#262626] flex items-center justify-center text-xl">
			<h1 className="text-white text-base font-semibold">Total Points</h1>
			<span className="ml-2 text-base text-autofun-background-action-highlight">{points}</span>
		</div>
	);
}
