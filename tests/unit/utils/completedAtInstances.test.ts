import {
	buildCompletedAtValue,
	filterCompletedAtInstancesBefore,
	formatCompletedAtTime,
	getCompletedAtTimeForDate,
	normalizeCompletedAtInstances,
	removeCompletedAtInstance,
	upsertCompletedAtInstanceList,
} from "../../../src/utils/completedAtInstances";

describe("completedAtInstances", () => {
	describe("normalizeCompletedAtInstances", () => {
		it("returns an empty list for non-array values", () => {
			expect(normalizeCompletedAtInstances(undefined)).toEqual([]);
			expect(normalizeCompletedAtInstances(null)).toEqual([]);
			expect(normalizeCompletedAtInstances("2026-05-19")).toEqual([]);
			expect(normalizeCompletedAtInstances({ date: "2026-05-19" })).toEqual([]);
		});

		it("drops malformed entries", () => {
			expect(
				normalizeCompletedAtInstances([
					{ date: "not-a-date", at: "2026-05-19T08:30" },
					{ date: "2026-05-19", at: "short" },
					{ at: "2026-05-19T08:30" },
					{ date: "2026-05-19", at: "2026-05-19T08:30" },
				])
			).toEqual([{ date: "2026-05-19", at: "2026-05-19T08:30" }]);
		});

		it("sorts by occurrence date and keeps the last entry for a date", () => {
			expect(
				normalizeCompletedAtInstances([
					{ date: "2026-05-20", at: "2026-05-20T10:00" },
					{ date: "2026-05-19", at: "2026-05-19T08:30" },
					{ date: "2026-05-20", at: "2026-05-20T21:15" },
				])
			).toEqual([
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
				{ date: "2026-05-20", at: "2026-05-20T21:15" },
			]);
		});
	});

	describe("upsertCompletedAtInstanceList", () => {
		it("adds a new occurrence without touching the other days", () => {
			const result = upsertCompletedAtInstanceList(
				[{ date: "2026-05-19", at: "2026-05-19T08:30" }],
				"2026-05-20",
				"2026-05-20T09:45"
			);

			expect(result).toEqual([
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
				{ date: "2026-05-20", at: "2026-05-20T09:45" },
			]);
		});

		it("replaces only the matching occurrence time", () => {
			const result = upsertCompletedAtInstanceList(
				[
					{ date: "2026-05-19", at: "2026-05-19T08:30" },
					{ date: "2026-05-20", at: "2026-05-20T09:45" },
				],
				"2026-05-20",
				"2026-05-20T23:05"
			);

			expect(result).toEqual([
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
				{ date: "2026-05-20", at: "2026-05-20T23:05" },
			]);
		});
	});

	describe("removeCompletedAtInstance", () => {
		it("removes only the requested occurrence", () => {
			expect(
				removeCompletedAtInstance(
					[
						{ date: "2026-05-19", at: "2026-05-19T08:30" },
						{ date: "2026-05-20", at: "2026-05-20T09:45" },
					],
					"2026-05-19"
				)
			).toEqual([{ date: "2026-05-20", at: "2026-05-20T09:45" }]);
		});
	});

	describe("filterCompletedAtInstancesBefore", () => {
		it("keeps only occurrences strictly before the given date", () => {
			expect(
				filterCompletedAtInstancesBefore(
					[
						{ date: "2026-05-18", at: "2026-05-18T08:00" },
						{ date: "2026-05-19", at: "2026-05-19T08:30" },
						{ date: "2026-05-20", at: "2026-05-20T09:45" },
					],
					"2026-05-20"
				)
			).toEqual([
				{ date: "2026-05-18", at: "2026-05-18T08:00" },
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
			]);
		});
	});

	describe("formatCompletedAtTime", () => {
		it("extracts the local time portion", () => {
			expect(formatCompletedAtTime("2026-05-19T08:30")).toBe("08:30");
			expect(formatCompletedAtTime("2026-05-19T08:30:15")).toBe("08:30");
		});

		it("returns an empty string for values without a time", () => {
			expect(formatCompletedAtTime("2026-05-19")).toBe("");
			expect(formatCompletedAtTime("nonsense")).toBe("");
		});
	});

	describe("getCompletedAtTimeForDate", () => {
		it("returns the time recorded for the requested day", () => {
			const task = {
				completedAtInstances: [
					{ date: "2026-05-19", at: "2026-05-19T08:30" },
					{ date: "2026-05-20", at: "2026-05-20T09:45" },
				],
			};

			expect(getCompletedAtTimeForDate(task, "2026-05-19")).toBe("08:30");
			expect(getCompletedAtTimeForDate(task, "2026-05-20")).toBe("09:45");
		});

		it("falls back to the extra raw sources", () => {
			const task = { completedAtInstances: undefined };

			expect(
				getCompletedAtTimeForDate(task, "2026-05-19", [
					[{ date: "2026-05-19", at: "2026-05-19T07:15" }],
				])
			).toBe("07:15");
		});

		it("returns undefined when the day has no recorded time", () => {
			const task = {
				completedAtInstances: [{ date: "2026-05-19", at: "2026-05-19T08:30" }],
			};

			expect(getCompletedAtTimeForDate(task, "2026-05-20")).toBeUndefined();
		});
	});

	describe("buildCompletedAtValue", () => {
		const now = new Date("2026-05-20T15:30:00.000Z");

		it("uses the occurrence's own date for a back-filled past day", () => {
			expect(buildCompletedAtValue("2026-05-19", now)).toBe("2026-05-19T00:00");
		});

		it("uses the real local time for the current day", () => {
			const value = buildCompletedAtValue("2026-05-20", now);

			expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
			expect(value.startsWith("2026-05-20T")).toBe(true);

			expect(value.startsWith("2026-05-20T")).toBe(true);
			expect(value).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
		});
	});
});