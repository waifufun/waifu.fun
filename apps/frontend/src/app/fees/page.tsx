const FeesContent = () => {
	return (
		<div className="h-[70vh] flex items-center justify-center">
			<div className="flex w-fit lg:w-[600px] border-2 border-[#00FF87]/40 shadow-[3px_3px_0px_rgba(0,255,135,0.2)] bg-black flex-col h-fit">
				<div className="flex-1">
					<div className="w-full justify-center">
						<div className="w-full mb-12">
							{/* Header */}
							<div className="flex flex-col py-5 px-4 gap-3.5 border-b">
								<h1 className="text-2xl md:text-[32px] font-satoshi font-medium leading-9 tracking-[-0.018em] text-[#00FF87]">
									Fees On Auto.fun
								</h1>
								<p className="text-sm md:text-base font-satoshi text-[#8C8C8C] leading-6">
									The following fees apply when using the auto.fun platform
								</p>
							</div>

							{/* Table Header */}
							<div className="hidden lg:flex justify-between px-4 py-2 border-b ">
								<span className="font-dm-mono text-sm md:text-base text-[#8C8C8C] tracking-[2px] uppercase">
									Actions
								</span>
								<span className="font-dm-mono text-sm md:text-base text-[#8C8C8C] tracking-[2px] uppercase">Fee</span>
							</div>

							{/* Table Rows */}
							<TableRow title="Create a token" text="0 SOL + blockchain fees" />
							<TableRow title="Trading while on bonding curve" text="1% of total sale price" />
							<TableRow title="raydium graduation" text="6 sol" />
						</div>
					</div>
				</div>
			</div>
		</div>
	);
};

const TableRow = ({ title, text }: { title: string; text: string }) => {
	return (
		<div className="flex flex-col items-start align-middle lg:flex-row justify-between px-4 py-2 border-b ">
			<span className="font-dm-mono text-[10px] text-xs lg:text-sm text-white tracking-[2px] uppercase">{title}</span>
			<span className="font-dm-mono text-[10px] text-xs lg:text-sm text-[#00FF87] tracking-[2px] uppercase">
				{text}
			</span>
		</div>
	);
};

export default FeesContent;
