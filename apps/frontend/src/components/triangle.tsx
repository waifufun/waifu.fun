import clsx from "clsx";
import Image from "next/image";

const Triangle = ({ size = "size-4", direction = "up" }) => {
	return (
		<Image
			src={direction === "up" ? "/triangle-buy.svg" : "/triangle-sell.svg"}
			// @ts-ignore
			height={18}
			width={20}
			alt="icon"
			className={clsx(size, "m-auto select-none")}
		/>
	);
};

export default Triangle;
