"use client";

import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type AnimationLevel = 0 | 1 | 2; // 0: Off, 1: Subtle, 2: All On

interface AnimationContextType {
	animationLevel: AnimationLevel;
	toggleAnimationLevel: () => void;
	setAnimationLevel: (level: AnimationLevel) => void;
}

const AnimationContext = createContext<AnimationContextType | undefined>(undefined);

export const AnimationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [animationLevel, setAnimationLevel] = useState<AnimationLevel>(2); // Default to All On

	useEffect(() => {
		const savedPreference = localStorage.getItem("animationLevel");
		if (savedPreference !== null) {
			const level = Number.parseInt(savedPreference, 10) as AnimationLevel;
			if (level === 0 || level === 1 || level === 2) {
				setAnimationLevel(level);
			}
		}
	}, []);

	useEffect(() => {
		// Remove all possible animation level classes first to ensure a clean state
		document.body.classList.remove("animations-level-0", "animations-level-1");
		// No class needed for level 2, as it's the default (all animations enabled as defined by components)

		if (animationLevel === 0) {
			document.body.classList.add("animations-level-0");
		} else if (animationLevel === 1) {
			document.body.classList.add("animations-level-1");
		}
		localStorage.setItem("animationLevel", animationLevel.toString());
	}, [animationLevel]);

	const toggleAnimationLevel = useCallback(() => {
		setAnimationLevel((prev) => {
			if (prev === 2) return 1; // All On -> Subtle
			if (prev === 1) return 0; // Subtle -> Off
			return 2; // Off -> All On
		});
	}, []);

	const customSetAnimationLevel = useCallback((level: AnimationLevel) => {
		setAnimationLevel(level);
	}, []);

	// Both handlers are useCallback-stable; memoize so consumers only re-render
	// when animationLevel actually changes.
	const value = useMemo(
		() => ({ animationLevel, toggleAnimationLevel, setAnimationLevel: customSetAnimationLevel }),
		[animationLevel, toggleAnimationLevel, customSetAnimationLevel],
	);

	return <AnimationContext.Provider value={value}>{children}</AnimationContext.Provider>;
};

export const useAnimation = () => {
	const context = useContext(AnimationContext);
	if (context === undefined) {
		throw new Error("useAnimation must be used within an AnimationProvider");
	}
	return context;
};
