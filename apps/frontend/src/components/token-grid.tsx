"use client";

import { GridItem } from "./grid-item";
import type { IToken } from "@waifufun/types";

export default function TokenGrid({ tokens }: { tokens: IToken[] }) {
	return (
		<div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8 w-full">
			{tokens.map((token) => (
				<div key={token.contractAddress} className="min-w-0">
					<GridItem token={token} variant="large" />
				</div>
			))}
		</div>
	);
}
