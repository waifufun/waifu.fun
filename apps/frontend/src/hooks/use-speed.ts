"use client";
import { useLocalStorage } from "usehooks-ts";

export type TSpeed = "normal" | "turbo" | "ultra";

export default function useSpeed() {
	const [speed, setSpeed] = useLocalStorage<TSpeed>("speed", "normal");

	return {
		speed,
		setSpeed,
	};
}
