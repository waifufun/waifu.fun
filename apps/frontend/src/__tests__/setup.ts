import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Cleanup after each test
afterEach(() => {
	cleanup();
});

// Mock environment variables for tests
process.env.NODE_ENV = "test";

// Mock Next.js router
vi.mock("next/navigation", () => ({
	useRouter: () => ({
		push: vi.fn(),
		replace: vi.fn(),
		prefetch: vi.fn(),
		back: vi.fn(),
		pathname: "/",
		query: {},
		asPath: "/",
	}),
	usePathname: () => "/",
	useSearchParams: () => new URLSearchParams(),
}));

// Mock wagmi hooks for testing
vi.mock("wagmi", () => ({
	useAccount: () => ({
		address: undefined,
		isConnected: false,
	}),
	useChainId: () => 1337,
	useConnect: () => ({
		connect: vi.fn(),
		connectors: [],
	}),
	useSwitchChain: () => ({
		switchChain: vi.fn(),
	}),
	WagmiProvider: ({ children }: { children: React.ReactNode }) => children,
	createConfig: vi.fn(),
	http: vi.fn(),
}));

// Mock ConnectKit
vi.mock("connectkit", () => ({
	ConnectKitProvider: ({ children }: { children: React.ReactNode }) => children,
	ConnectKitButton: () => null,
	getDefaultConfig: vi.fn(() => ({})),
}));

// Suppress console warnings in tests
global.console = {
	...console,
	warn: vi.fn(),
	error: vi.fn(),
};
