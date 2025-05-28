import React, { forwardRef } from "react";
import { isInputGreaterThanDecimals, formatValueWithLocale } from "../lib/utils";

type InputProps = {
	value: string | number;
	mode: "buy" | "sell";
	onUserInput: (input: string) => void;
	error?: boolean;
	fontSize?: string;
	align?: "right" | "left";
	prependSymbol?: string;
	maxDecimals?: number;
	locale?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "ref">;

function classNames(...classes: string[]) {
	return classes.filter(Boolean).join(" ");
}
const inputRegex = /^\d*(?:[.])?\d*$/;

const SwapInput = forwardRef<HTMLInputElement, InputProps>(
	(
		{
			value,
			onUserInput,
			mode,
			placeholder,
			prependSymbol,
			maxDecimals,
			error,
			fontSize,
			align = "right",
			className,
			locale = "en-US",
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

		const valueFormattedWithLocale = formatValueWithLocale(value, locale);
		const displayValue = prependSymbol && value ? prependSymbol + valueFormattedWithLocale : valueFormattedWithLocale;

		return (
			<div className={classNames("w-[250px] rounded-lg transition-colors duration-300", error ? "border border-red-500" : " border border-autofun-background-disabled bg-autofun-background-action-primary/40")}>
				<div className="p-4">
					<p className="uppercase text-sm font-medium text-autofun-background-action-highlight opacity-70">{mode}</p>
					<input
						ref={ref}
						{...rest}
						value={displayValue}
						onChange={(event) => {
							const inputValue = event.target.value;
							const cleanValue =
								prependSymbol && inputValue.includes(prependSymbol)
									? inputValue.slice(prependSymbol.length)
									: inputValue;

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
						className={classNames(
							" outline-none border-none w-full text-white truncate rounded-md  text-ellipsis",
							"appearance-none",
							"placeholder:text-gray-400",
							align === "right" ? "text-right" : "text-left",
							fontSize ? `text-[${fontSize}]` : "text-2xl",
							className || "",
						)}
					/>
				</div>
			</div>
		);
	},
);

SwapInput.displayName = "SwapInput";
export default React.memo(SwapInput);
