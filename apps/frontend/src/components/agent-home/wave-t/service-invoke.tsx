/**
 * Service invoke registry: the extensible "service row -> open -> invoke
 * surface" pattern for the unified mini-apps catalog.
 *
 * The services catalog (`services-section.tsx`) is the single entry point
 * for an agent's mini-apps. When a user opens an invokable service row, the
 * catalog looks the service up here and renders its invoke body inline.
 *
 * Adding a future app (twitter-replies, trading, ...) is a two-line change:
 *   1. write its `<XInvokeBody>` (a Panel-less form, same shape as
 *      `ImageGenInvokeBody`),
 *   2. register it in `SERVICE_INVOKERS` keyed by its appId.
 * No new bolted-on page panel, no agent-home-v2.tsx edit.
 *
 * A service is "invokable" only when it has a registered invoker AND the
 * catalog can resolve its live registry row. Everything else lists as
 * disabled (no fake button, honest about not being callable yet).
 */

"use client";

import type * as React from "react";

import type { App } from "@/lib/wave-t/apps";
import { IMAGE_GEN_APP_ID } from "@/lib/wave-t/image-gen";

import { ImageGenInvokeBody, selectImageGenApp } from "./image-gen-panel";

/** Props every invoke body receives from the catalog. */
export interface ServiceInvokeProps {
	agentTokenAddress: string;
	/** The resolved live registry row for this service. */
	app: App;
	/** Catalog callback: flip the row to "not available" on a 404. */
	onUnavailable?: () => void;
}

/**
 * A registered invoke body plus the gate that decides whether a given
 * registry row is currently callable. `selectApp` returns the live row to
 * hand the body, or null when the service exists but is not callable right
 * now (paused/scheduled), in which case the catalog lists it disabled.
 */
export interface ServiceInvoker {
	/** Resolve the live, callable registry row for this service, or null. */
	selectApp: (apps: App[]) => App | null;
	/** The Panel-less invoke surface rendered inline when the row opens. */
	Body: (props: ServiceInvokeProps) => React.ReactNode;
}

/**
 * appId -> invoker. image-gen is the first concrete implementation; new
 * apps slot in here without touching the catalog or the page.
 */
export const SERVICE_INVOKERS: Record<string, ServiceInvoker> = {
	[IMAGE_GEN_APP_ID]: {
		selectApp: selectImageGenApp,
		Body: ImageGenInvokeBody,
	},
};

/** Whether an appId has a registered invoke surface. */
export function hasInvoker(appId: string): boolean {
	return Boolean(SERVICE_INVOKERS[appId]);
}

/**
 * Resolve the invoker + live row for a service, or null when the service
 * has no registered invoke body or no currently-callable row. The catalog
 * renders the inline surface only when this returns non-null.
 */
export function resolveInvoker(appId: string, apps: App[]): { invoker: ServiceInvoker; app: App } | null {
	const invoker = SERVICE_INVOKERS[appId];
	if (!invoker) return null;
	const app = invoker.selectApp(apps);
	if (!app) return null;
	return { invoker, app };
}
