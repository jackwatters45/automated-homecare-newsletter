import { Mock, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { API_URL } from "../../src/lib/constants";
import { pingServer } from "../../src/lib/health";

// Mock fetch API
global.fetch = vi.fn();

describe("pingServer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetModules();
	});

	it("should log and return if the server is up", async () => {
		const mockResponse = {
			ok: true,
			status: 200,
		};
		(global.fetch as Mock).mockResolvedValue(mockResponse);

		await pingServer();

		expect(fetch).toHaveBeenCalledWith(`${API_URL}/health`);
	});

	it("should log and throw an error if the server returns an error", async () => {
		const mockResponse = {
			ok: false,
			status: 500,
		};
		(global.fetch as Mock).mockResolvedValue(mockResponse);

		await expect(pingServer()).rejects.toThrow(
			"Server returned an error. Status: 500",
		);

		expect(fetch).toHaveBeenCalledWith(`${API_URL}/health`);
	});

	it("should log and throw an error if fetch fails", async () => {
		const mockError = new Error("Network error");
		(global.fetch as Mock).mockRejectedValue(mockError);
		console.error = vi.fn(); // Mock console.error

		await expect(pingServer()).rejects.toThrow(
			"Failed to reach the server: Network error",
		);

		expect(fetch).toHaveBeenCalledWith(`${API_URL}/health`);

		expect(console.error).toHaveBeenCalledWith(
			"Failed to reach the server: Network error",
		);
	});
});
