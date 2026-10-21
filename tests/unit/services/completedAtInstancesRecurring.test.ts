import {
	applyRecurringTaskCompleteFrontmatterChange,
	buildRecurringTaskCompletePlan,
} from "../../../src/services/task-service/taskRecurringPlanning";
import type { TaskInfo } from "../../../src/types";

function createRecurringTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		title: "Recurring task",
		status: "open",
		priority: "normal",
		path: "TaskNotes/Recurring task.md",
		archived: false,
		recurrence: "FREQ=DAILY",
		scheduled: "2026-05-20",
		complete_instances: [],
		skipped_instances: [],
		...overrides,
	} as TaskInfo;
}

function buildPlan(overrides: Partial<TaskInfo> = {}) {
	return buildRecurringTaskCompletePlan({
		freshTask: createRecurringTask(overrides),
		targetDate: new Date("2026-05-20T12:00:00.000Z"),
		currentTimestamp: "2026-05-20T07:15:00+10:00",
		maintainDueDateOffsetInRecurring: true,
	});
}

function applyComplete(
	frontmatter: Record<string, unknown>,
	plan: ReturnType<typeof buildPlan>,
	completedAtValue: string
): void {
	applyRecurringTaskCompleteFrontmatterChange({
		frontmatter,
		completeInstancesField: "completeInstances",
		skippedInstancesField: "skippedInstances",
		dateModifiedField: "dateModified",
		scheduledField: "scheduled",
		dueField: "due",
		recurrenceField: "recurrence",
		plan,
		completedAtField: "completedAt",
		completedAtValue,
		completedAtInstancesField: "completedAtInstances",
	});
}

describe("recurring task per-occurrence completion times", () => {
	it("keeps an earlier day's completion time when a later day is completed", () => {
		const frontmatter: Record<string, unknown> = {
			completeInstances: ["2026-05-19"],
			skippedInstances: [],
			recurrence: "FREQ=DAILY",
			completedAtInstances: [{ date: "2026-05-19", at: "2026-05-19T08:30" }],
		};

		applyComplete(
			frontmatter,
			buildPlan({ complete_instances: ["2026-05-19"] }),
			"2026-05-20T09:45"
		);

		expect(frontmatter.completedAtInstances).toEqual([
			{ date: "2026-05-19", at: "2026-05-19T08:30" },
			{ date: "2026-05-20", at: "2026-05-20T09:45" },
		]);
	});

	it("refreshes only the toggled day's recorded time", () => {
		const frontmatter: Record<string, unknown> = {
			completeInstances: ["2026-05-19"],
			skippedInstances: [],
			recurrence: "FREQ=DAILY",
			completedAtInstances: [
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
				{ date: "2026-05-20", at: "2026-05-20T21:15" },
			],
		};

		applyComplete(
			frontmatter,
			buildPlan({ complete_instances: ["2026-05-19"] }),
			"2026-05-20T23:05"
		);

		expect(frontmatter.completedAtInstances).toEqual([
			{ date: "2026-05-19", at: "2026-05-19T08:30" },
			{ date: "2026-05-20", at: "2026-05-20T23:05" },
		]);
	});

	it("removes only the uncompleted day's recorded time", () => {
		const frontmatter: Record<string, unknown> = {
			completeInstances: ["2026-05-19", "2026-05-20"],
			skippedInstances: [],
			recurrence: "FREQ=DAILY",
			completedAtInstances: [
				{ date: "2026-05-19", at: "2026-05-19T08:30" },
				{ date: "2026-05-20", at: "2026-05-20T09:45" },
			],
		};

		applyComplete(
			frontmatter,
			buildPlan({ complete_instances: ["2026-05-19", "2026-05-20"] }),
			"2026-05-20T09:45"
		);

		expect(frontmatter.completedAtInstances).toEqual([
			{ date: "2026-05-19", at: "2026-05-19T08:30" },
		]);
	});

	it("drops the recorded time property once no day remains completed", () => {
		const frontmatter: Record<string, unknown> = {
			completeInstances: ["2026-05-20"],
			skippedInstances: [],
			recurrence: "FREQ=DAILY",
			completedAtInstances: [{ date: "2026-05-20", at: "2026-05-20T09:45" }],
		};

		applyComplete(
			frontmatter,
			buildPlan({ complete_instances: ["2026-05-20"] }),
			"2026-05-20T09:45"
		);

		expect(frontmatter.completedAtInstances).toBeUndefined();
	});

	it("exposes the per-occurrence times on the updated task", () => {
		const plan = buildPlan({ complete_instances: ["2026-05-19"] });

		applyComplete(
			{ completeInstances: ["2026-05-19"], skippedInstances: [], recurrence: "FREQ=DAILY" },
			plan,
			"2026-05-20T09:45"
		);

expect(plan.updatedTask.completedAtInstances).toEqual([
			{ date: "2026-05-19", at: "2026-05-19T00:00" },
			{ date: "2026-05-20", at: "2026-05-20T09:45" },
		]);
	});
});