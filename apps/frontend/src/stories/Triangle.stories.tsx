import Triangle from "@/components/triangle";

export default {
	title: "Components/Triangle",
	component: Triangle,
	argTypes: {
		size: {
			control: { type: "text" },
			defaultValue: "size-4",
		},
		color: {
			control: { type: "text" },
			defaultValue: "bg-black",
		},
		direction: {
			control: "select",
			options: ["up", "down", "left", "right"],
			defaultValue: "up",
		},
	},
};
// biome-ignore lint/suspicious/noExplicitAny: need for flexibility in props
export const Default = (args: any) => <Triangle {...args} />;
