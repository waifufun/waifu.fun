import { ChevronRight } from "lucide-react";
import { twMerge } from "tailwind-merge";

interface IPagination {
	page: number;
	totalPages: number;
	total: number;
	hasMore: boolean;
}

interface PaginationProps {
	pagination: IPagination;
	onPageChange?: (page: number) => void;
}

const Pagination: React.FC<PaginationProps> = ({ pagination, onPageChange }) => {
	const { page, hasMore, totalPages } = pagination;

	if (totalPages <= 1) return null;

	const renderPages = () => {
		const pages: (number | string)[] = [];
		const isValidPage = (p: number) => p >= 1 && p <= totalPages;

		if (totalPages <= 6) {
			for (let i = 1; i <= totalPages; i++) {
				pages.push(i);
			}
		} else {
			if (page <= 3) {
				pages.push(1, 2, 3, 4, "...", totalPages);
			} else if (page >= totalPages - 2) {
				pages.push(1, "...", totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
			} else {
				pages.push(
					1,
					isValidPage(page - 1) ? page - 1 : 1,
					page,
					isValidPage(page + 1) ? page + 1 : totalPages,
					"...",
					totalPages,
				);
			}
		}

		return pages;
	};

	const pages = renderPages();

	return (
		<nav aria-label="pagination" className="place-self-center flex my-4">
			<ul className="flex items-center gap-1">
				{pages.map((item, index) => {
					if (typeof item === "number") {
						const isActive = item === page;
						return (
							<button
								key={index}
								type="button"
								tabIndex={0}
								className={twMerge([
									isActive ? "bg-[#00ff87] text-[#08080a]" : "bg-transparent text-[#71717a] hover:text-[#e4e4e7]",
									"cursor-pointer h-8 px-3 py-2 rounded-sm inline-flex flex-col items-center justify-center gap-2.5 overflow-hidden transition-colors",
								])}
								onClick={() => onPageChange?.(item)}
							>
								<div className="select-none text-center text-base font-normal font-dm-mono leading-normal">{item}</div>
							</button>
						);
					}

					return (
						<button
							type="button"
							key={`ellipsis-${index}`}
							tabIndex={0}
							className="cursor-pointer h-8 px-3 py-2 select-none text-center flex items-center justify-center text-[#71717a] text-base font-normal font-dm-mono leading-normal hover:text-[#e4e4e7] transition-colors"
							onClick={() => {
								if (index < pages.indexOf(page)) {
									onPageChange?.(page - 3);
								} else {
									onPageChange?.(page + 3);
								}
							}}
						>
							{item}
						</button>
					);
				})}

				<li>
					<ChevronRight
						role="button"
						tabIndex={0}
						className={twMerge(["text-[#e4e4e7] size-6 cursor-pointer", hasMore ? "opacity-100" : "opacity-50"])}
						onClick={() => {
							if (hasMore) {
								onPageChange?.(page + 1);
							}
						}}
						onKeyDown={(e) => {
							if ((e.key === "Enter" || e.key === " ") && hasMore) {
								onPageChange?.(page + 1);
							}
						}}
					/>
				</li>
			</ul>
		</nav>
	);
};

export default Pagination;
