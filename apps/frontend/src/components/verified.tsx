"use client";

import Image from "next/image";
import { Tooltip } from "react-tooltip";
import { Fragment } from "react/jsx-runtime";

export default function Verified({ isVerified }: { isVerified?: boolean | null | undefined }) {
	if (!isVerified) return null;
	return (
		<Fragment>
			<Tooltip anchorSelect="#verified">
				<span>Verified</span>
			</Tooltip>

			<Image
				src="/verified.svg"
				width={64}
				height={64}
				unoptimized
				id="verified"
				className="size-5 select-none"
				alt="verified_logo"
			/>
		</Fragment>
	);
}
