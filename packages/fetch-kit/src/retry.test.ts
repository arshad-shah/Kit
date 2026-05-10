import { describe, expect, it, vi } from "vitest";
import { HttpError, NetworkError, ValidationError } from "./errors.js";
import { computeBackoff, defaultRetryOn, sleep } from "./retry.js";

describe("computeBackoff", () => {
	it("uses exponential backoff: 100, 200, 400, 800", () => {
		expect(computeBackoff(1, "exponential")).toBe(100);
		expect(computeBackoff(2, "exponential")).toBe(200);
		expect(computeBackoff(3, "exponential")).toBe(400);
		expect(computeBackoff(4, "exponential")).toBe(800);
	});

	it("caps exponential backoff at 30 seconds", () => {
		expect(computeBackoff(20, "exponential")).toBe(30_000);
	});

	it("uses linear backoff: 100, 200, 300", () => {
		expect(computeBackoff(1, "linear")).toBe(100);
		expect(computeBackoff(2, "linear")).toBe(200);
		expect(computeBackoff(3, "linear")).toBe(300);
	});

	it("caps linear backoff at 30 seconds", () => {
		expect(computeBackoff(500, "linear")).toBe(30_000);
	});

	it("supports custom backoff functions", () => {
		expect(computeBackoff(3, (a) => a * 50)).toBe(150);
	});

	it("clamps custom backoff to non-negative", () => {
		expect(computeBackoff(1, () => -100)).toBe(0);
	});
});

describe("defaultRetryOn", () => {
	it("retries network errors", () => {
		expect(defaultRetryOn(new NetworkError("offline"))).toBe(true);
	});

	it("retries 5xx server errors", () => {
		const response = new Response("err", { status: 503 });
		expect(defaultRetryOn(new HttpError(503, "Service Unavailable", response, null))).toBe(true);
	});

	it("retries 408 Request Timeout", () => {
		const response = new Response("", { status: 408 });
		expect(defaultRetryOn(new HttpError(408, "Request Timeout", response, null))).toBe(true);
	});

	it("retries 429 Too Many Requests", () => {
		const response = new Response("", { status: 429 });
		expect(defaultRetryOn(new HttpError(429, "Too Many Requests", response, null))).toBe(true);
	});

	it("does not retry other 4xx errors", () => {
		const response = new Response("", { status: 404 });
		expect(defaultRetryOn(new HttpError(404, "Not Found", response, null))).toBe(false);
	});

	it("does not retry validation errors", () => {
		expect(defaultRetryOn(new ValidationError("bad", null))).toBe(false);
	});

	it("does not retry generic errors", () => {
		expect(defaultRetryOn(new Error("???"))).toBe(false);
	});
});

describe("sleep", () => {
	it("resolves after the given duration", async () => {
		vi.useFakeTimers();
		const promise = sleep(1000);
		vi.advanceTimersByTime(1000);
		await promise;
		vi.useRealTimers();
	});

	it("rejects when signal is already aborted", async () => {
		const controller = new AbortController();
		controller.abort(new Error("abort"));
		await expect(sleep(100, controller.signal)).rejects.toThrow("abort");
	});

	it("rejects when signal aborts during sleep", async () => {
		vi.useFakeTimers();
		const controller = new AbortController();
		const promise = sleep(1000, controller.signal);
		controller.abort(new Error("mid-flight"));
		await expect(promise).rejects.toThrow("mid-flight");
		vi.useRealTimers();
	});
});
