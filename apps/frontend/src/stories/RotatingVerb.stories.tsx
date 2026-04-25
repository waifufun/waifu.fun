import RotatingVerb from "@/components/landing/rotating-verb";
import { LocaleProvider } from "@/contexts/locale-context";

export default {
	title: "Landing/RotatingVerb",
	component: RotatingVerb,
};

export const Default = () => (
	<LocaleProvider>
		<div
			style={{
				background: "#08080a",
				padding: "6rem 2rem",
				color: "#f4f4f5",
				fontFamily: "ui-sans-serif, system-ui",
			}}
		>
			<h1
				style={{
					fontSize: "clamp(2.4rem, 6vw, 5.5rem)",
					letterSpacing: "-0.04em",
					lineHeight: 1.05,
					fontWeight: 700,
					margin: 0,
				}}
			>
				they live{" "}
				<span style={{ color: "#a1a1aa", fontWeight: 300 }}>
					if they{" "}
					<span style={{ color: "#d4d4d8", fontWeight: 500 }}>
						<RotatingVerb />
					</span>
				</span>
			</h1>
			<h1
				style={{
					fontSize: "clamp(2.4rem, 6vw, 5.5rem)",
					letterSpacing: "-0.04em",
					lineHeight: 1.05,
					fontWeight: 700,
					margin: 0,
				}}
			>
				they die <span style={{ color: "#a1a1aa", fontWeight: 300 }}>if they don't.</span>
			</h1>
			<p style={{ marginTop: "2rem", color: "#71717a", fontSize: "0.875rem" }}>
				Hover the rotating word to pause. Browser-level reduced-motion drops the rotation.
			</p>
		</div>
	</LocaleProvider>
);
