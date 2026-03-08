const FeesContent = () => {
	return (
		<div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
			<div className="w-full max-w-2xl mx-auto bg-[rgba(17,17,20,0.5)] border border-[rgba(255,255,255,0.06)] rounded-sm">
				{/* Header */}
				<div className="flex flex-col py-6 px-6 gap-2 border-b border-[rgba(255,255,255,0.06)]">
					<h1 className="text-2xl md:text-3xl font-bold text-[#00ff87] tracking-tight">Fees On waifu.fun</h1>
					<p className="text-sm text-[#a1a1aa]">The following fees apply when using the waifu.fun platform</p>
				</div>

				{/* Table Header */}
				<div className="hidden lg:flex justify-between px-6 py-3 border-b border-[rgba(255,255,255,0.06)]">
					<span className="font-mono text-xs text-[#71717a] tracking-wider uppercase">Actions</span>
					<span className="font-mono text-xs text-[#71717a] tracking-wider uppercase">Fee</span>
				</div>

				{/* Table Rows */}
				<TableRow title="Create a token" text="free + gas fees" />
				<TableRow title="Trading while on bonding curve" text="1% of total sale price" />
				<TableRow title="DEX graduation" text="flat fee (paid in native token)" isLast />
			</div>
		</div>
	);
};

const TableRow = ({ title, text, isLast = false }: { title: string; text: string; isLast?: boolean }) => {
	return (
		<div
			className={`flex flex-col items-start lg:flex-row justify-between px-6 py-4 ${!isLast ? "border-b border-[rgba(255,255,255,0.06)]" : ""}`}
		>
			<span className="font-mono text-xs lg:text-sm text-[#e4e4e7] tracking-wide uppercase">{title}</span>
			<span className="font-mono text-xs lg:text-sm text-[#00ff87] tracking-wide uppercase mt-1 lg:mt-0">{text}</span>
		</div>
	);
};

export default FeesContent;
