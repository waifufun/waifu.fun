"use client";
import { useEffect } from "react";

export default function ScrollToTop() {
	useEffect(() => {
		const sidebarInset = document.querySelector('[data-sidebar="inset"]') || document.querySelector(".overflow-auto");

		if (sidebarInset) {
			sidebarInset.scrollTop = 0;
		}
	}, []);

	return null;
}
