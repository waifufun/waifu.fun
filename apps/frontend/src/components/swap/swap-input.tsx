import React, { forwardRef } from "react";
import { cn, isInputGreaterThanDecimals } from "@/lib/utils";

type InputProps = {
	value: string | number;
	onUserInput: (input: string) => void;
	error?: boolean;
	fontSize?: string;
	align?: "right" | "left";
	prependSymbol?: string;
	maxDecimals?: number;
	locale?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "ref">;

const inputRegex = /^\d*(?:[.])?\d*$/;

const SwapInput = forwardRef<HTMLInputElement, InputProps>(
	(
		{
			value,
			onUserInput,
			placeholder,
			prependSymbol,
			maxDecimals,
			error,
			fontSize,
			align = "right",
			className,
			...rest
		},
		ref,
	) => {
		const enforcer = (nextUserInput: string) => {
			if (nextUserInput === "" || inputRegex.test(nextUserInput)) {
				if (isInputGreaterThanDecimals(nextUserInput, maxDecimals)) return;
				onUserInput(nextUserInput);
			}
		};

		const displayValue = prependSymbol && value ? prependSymbol + value.toString() : value.toString();
		return (
			<div className="rounded-lg w-full">
				<input
					ref={ref}
					{...rest}
					value={displayValue}
					onChange={(event) => {
						const inputValue = event.target.value;
						const cleanValue =
							prependSymbol && inputValue.includes(prependSymbol) ? inputValue.slice(prependSymbol.length) : inputValue;

						enforcer(cleanValue.replace(/,/g, "."));
					}}
					inputMode="decimal"
					autoComplete="off"
					autoCorrect="off"
					type="text"
					pattern="^[0-9]*[.,]?[0-9]*$"
					placeholder={placeholder || "0"}
					minLength={1}
					maxLength={79}
					spellCheck={false}
					className={cn(
						"outline-none border-none w-full text-4xl text-white truncate rounded-md text-ellipsis transition-colors duration-300",
						"placeholder:text-gray-400",
						align === "right" ? "text-right" : "text-left",
						error ? "text-red-400" : "",
						className,
					)}
				/>
			</div>
		);
	},
);

SwapInput.displayName = "SwapInput";
export default React.memo(SwapInput);
