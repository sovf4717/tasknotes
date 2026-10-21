import { describe, expect, it, jest } from "@jest/globals";
import { TaskInfo } from "../../../src/types";
import {
	getTaskCardPropertyValue,
	type TaskCardPropertyAccessContext,
} from "../../../src/ui/taskCardPropertyAccess";

function createTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Property task",
		status: "open",
		priority: "normal",
		path: "TaskNotes/Property task.md",
		archived: false,
		...overrides,
	};
}

function createContext(
	options: {
		mapping?: Record<string, string | null | undefined>;
		frontmatter?: Record<string, unknown>;
		userFields?: Array<{ id?: string; key?: string }>;
	} = {}
): TaskCardPropertyAccessContext {
	return {
		fieldMapper: {
			lookupMappingKey: (propertyId: string) => options.mapping?.[propertyId] ?? null,
		},
		settings: {
			userFields: options.userFields ?? [],
		},
		app: {
			metadataCache: {
				getCache: () => ({ frontmatter: options.frontmatter }),
			},
		},
	};
}

describe("TaskCard property access", () => {
	it("resolves mapped core properties before raw property IDs", () => {
		const task = createTask({ due: "2026-05-18" });
		const context = createContext({ mapping: { faellig: "due" } });

		expect(getTaskCardPropertyValue(task, "faellig", context)).toBe("2026-05-18");
	});

	it("resolves mapped manual-order properties from TaskInfo sortOrder", () => {
		const task = createTask({ sortOrder: "0|hzzzzz:" });
		const context = createContext({ mapping: { sort_order: "sortOrder" } });

		expect(getTaskCardPropertyValue(task, "sort_order", context)).toBe("0|hzzzzz:");
		expect(getTaskCardPropertyValue(task, "sortOrder", context)).toBe("0|hzzzzz:");
	});

	it("reads user properties from task data before metadata frontmatter", () => {
		const task = createTask({ customDate: "2026-05-18" } as Partial<TaskInfo>);
		const context = createContext({
			frontmatter: { customDate: "2026-05-19" },
			userFields: [{ id: "custom-date", key: "customDate" }],
		});

		expect(getTaskCardPropertyValue(task, "user:custom-date", context)).toBe("2026-05-18");
	});

	it("falls back to metadata frontmatter for configured user properties", () => {
		const task = createTask();
		const context = createContext({
			frontmatter: { customDate: "2026-05-19" },
			userFields: [{ id: "custom-date", key: "customDate" }],
		});

		expect(getTaskCardPropertyValue(task, "user:custom-date", context)).toBe("2026-05-19");
	});

	it("extracts values from direct and file-prefixed custom properties", () => {
		const task = createTask({
			customProperties: {
				score: { icon: "lucide-hash", display: "High" },
				"file.owner": { icon: "lucide-user", data: "Ada" },
			},
		});
		const context = createContext();

		expect(getTaskCardPropertyValue(task, "score", context)).toBe("High");
		expect(getTaskCardPropertyValue(task, "owner", context)).toBe("Ada");
	});

	it("reads file, formula, and note values from Bases data", () => {
		const task = createTask({
			basesData: {
				getValue: jest.fn((propertyId: string) => {
					const values: Record<string, unknown> = {
						"file.name": { icon: "lucide-file", data: "Task file" },
						"formula.age": { icon: "lucide-clock", display: "13 days ago" },
						"note.energy": "high",
					};
					if (propertyId in values) {
						return values[propertyId];
					}
					throw new Error("missing");
				}),
			},
		});
		const context = createContext();

		expect(getTaskCardPropertyValue(task, "file.name", context)).toBe("Task file");
		expect(getTaskCardPropertyValue(task, "formula.age", context)).toBe("13 days ago");
		expect(getTaskCardPropertyValue(task, "energy", context)).toBe("high");
	});

	it("uses stable formula fallbacks for absent or failing Bases data", () => {
		const context = createContext();
		const debugSpy = jest.spyOn(console, "debug").mockImplementation(() => undefined);

		expect(getTaskCardPropertyValue(createTask(), "formula.age", context)).toBe("");
		expect(
			getTaskCardPropertyValue(
				createTask({
					basesData: {
						getValue: () => null,
					},
				}),
				"formula.age",
				context
			)
		).toBe("");
		expect(
			getTaskCardPropertyValue(
				createTask({
					basesData: {
						getValue: () => {
							throw new Error("formula failed");
						},
					},
				}),
				"formula.age",
				context
			)
		).toBe("[Formula Error]");

		debugSpy.mockRestore();
	});

	it("falls back to raw frontmatter and returns null for missing properties", () => {
		const context = createContext({ frontmatter: { owner: "Ada" } });

		expect(getTaskCardPropertyValue(createTask(), "owner", context)).toBe("Ada");
		expect(getTaskCardPropertyValue(createTask(), "missing", context)).toBeNull();
	});

	describe("formula.completedAtTime per-occurrence times", () => {
		it("shows each day's own recorded completion time for recurring series tasks", () => {
			const task = createTask({
				recurrence: "FREQ=DAILY",
				completedAt: "2026-10-21T09:00",
				completedAtInstances: [
					{ date: "2026-10-20", at: "2026-10-20T14:37" },
					{ date: "2026-10-21", at: "2026-10-21T09:00" },
				],
			});
			const context = createContext();

			expect(
				getTaskCardPropertyValue(task, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-20",
				})
			).toBe("14:37");
			expect(
				getTaskCardPropertyValue(task, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-21",
				})
			).toBe("09:00");
		});

		it("does not leak the latest completion time into another day", () => {
			const task = createTask({
				recurrence: "FREQ=DAILY",
				completedAt: "2026-10-21T09:00",
				basesData: {
					getValue: () => ({ icon: "lucide-clock", display: "09:00" }),
				},
			});
			const context = createContext();

			expect(
				getTaskCardPropertyValue(task, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-20",
				})
			).toBe("");
		});

		it("falls back to the Bases value when the latest completion belongs to the same day", () => {
			const task = createTask({
				recurrence: "FREQ=DAILY",
				completedAt: "2026-10-21T09:00",
				basesData: {
					getValue: () => ({ icon: "lucide-clock", display: "09:00" }),
				},
			});
			const context = createContext();

			expect(
				getTaskCardPropertyValue(task, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-21",
				})
			).toBe("09:00");
		});

		it("keeps the Bases fallback for materialized occurrences and plain tasks", () => {
			const occurrence = createTask({
				recurrence_parent: "TaskNotes/parent.md",
				occurrence_date: "2026-10-20",
				completedAt: "2026-10-20T14:37",
				basesData: {
					getValue: () => ({ icon: "lucide-clock", display: "14:37" }),
				},
			});
			const plain = createTask({
				completedAt: "2026-10-20T14:37",
				basesData: {
					getValue: () => ({ icon: "lucide-clock", display: "14:37" }),
				},
			});
			const context = createContext();

			expect(
				getTaskCardPropertyValue(occurrence, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-19",
				})
			).toBe("14:37");
			expect(
				getTaskCardPropertyValue(plain, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-19",
				})
			).toBe("14:37");
		});

		it("reads per-occurrence times from metadata frontmatter", () => {
			const task = createTask({
				recurrence: "FREQ=DAILY",
				completedAt: "2026-10-21T09:00",
			});
			const context = createContext({
				frontmatter: {
					completedAtInstances: [{ date: "2026-10-20", at: "2026-10-20T08:15" }],
				},
			});

			expect(
				getTaskCardPropertyValue(task, "formula.completedAtTime", context, {
					completedAtTimeDate: "2026-10-20",
				})
			).toBe("08:15");
		});
	});
});
