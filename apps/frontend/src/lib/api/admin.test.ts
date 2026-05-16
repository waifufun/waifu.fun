import { afterEach, describe, expect, it, vi } from "vitest";
import { ADMIN_TOKEN_KEY, clearAdminToken, getAdminToken, setAdminToken } from "./admin";

function makeStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	return {
		getItem: vi.fn((key: string) => data.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			data.set(key, value);
		}),
		removeItem: vi.fn((key: string) => {
			data.delete(key);
		}),
	};
}

describe("admin token storage", () => {
	afterEach(() => {
		clearAdminToken();
		vi.unstubAllGlobals();
	});

	it("stores new admin tokens in sessionStorage, not localStorage", () => {
		const sessionStorage = makeStorage();
		const localStorage = makeStorage();
		vi.stubGlobal("window", { sessionStorage, localStorage });

		setAdminToken("wf_admin_secret");

		expect(sessionStorage.setItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY, "wf_admin_secret");
		expect(localStorage.setItem).not.toHaveBeenCalled();
		expect(getAdminToken()).toBe("wf_admin_secret");
	});

	it("migrates a legacy localStorage token into sessionStorage and removes the persistent copy", () => {
		const sessionStorage = makeStorage();
		const localStorage = makeStorage({ [ADMIN_TOKEN_KEY]: "legacy_secret" });
		vi.stubGlobal("window", { sessionStorage, localStorage });

		expect(getAdminToken()).toBe("legacy_secret");
		expect(sessionStorage.setItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY, "legacy_secret");
		expect(localStorage.removeItem).toHaveBeenCalledWith(ADMIN_TOKEN_KEY);
	});
});
