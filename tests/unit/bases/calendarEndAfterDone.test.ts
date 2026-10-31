// Regression tests for the ENDONDONE (end-after-done-N) bug where
// a recurring task that has reached its completion cap still reappears in the
// agenda view via the showOverdueOnToday mechanism.
//
// Root cause: when ENDONDONE is reached, scheduled/due are intentionally not
// advanced. The stale scheduled date on a past day is then picked up by the
// overdue-today logic and the task resurfaces on every subsequent day.
// The fix in calendarModelEvents.ts strips scheduled/due (and the non-standard
// ENDONDONE RRULE part) from the projection when the recurrence is terminated.

jest.mock("rrule", () => jest.requireActual("rrule/dist/es5/rrule.js"));

import { CalendarTaskProjection } from "../../../src/bases/calendarModelEvents";
import type { CalendarContext } from "@tasknotes/model/calendar";
import type { TaskInfo } from "../../../src/types";

function makeContext(): CalendarContext {
	return {
		timezone: "UTC",
		now: "2025-11-01T00:00:00.000Z",
		settings: {
			showScheduled: true,
			showDue: true,
			showRecurring: true,
			showOverdueOnToday: true,
		},
	};
}

function makeTask(overrides: Partial<TaskInfo> = {}): TaskInfo {
	return {
		id: "terminated-task",
		path: "Tasks/terminated.md",
		title: "Terminated task",
		status: "open",
		...overrides,
	};
}

describe("ENDONDONE terminated recurrence in calendar projection", () => {
	it("produces no calendar entries when ENDONDONE=1 has been reached", () => {
		const task = makeTask({
			recurrence: "DTSTART:20251031T090000Z;FREQ=DAILY;ENDONDONE=1",
			scheduled: "2025-10-31",
			due: "2025-10-31",
			complete_instances: ["2025-10-31"],
		});

		const invalid = jest.fn();
		const projection = new CalendarTaskProjection(makeContext(), invalid);
		projection.setTasks([task]);
		const entries = projection.entriesInRange({ start: "2025-11-01", end: "2025-11-02" });

		// No events: recurrence is terminated, scheduled/due are stripped,
		// so the showOverdueOnToday mechanism cannot resurrect the task.
		expect(entries).toEqual([]);
		expect(invalid).not.toHaveBeenCalled();
	});

	it("still shows a next-scheduled entry when ENDONDONE cap is not yet reached", () => {
		const task = makeTask({
			recurrence: "DTSTART:20251001T090000Z;FREQ=DAILY;ENDONDONE=2",
			scheduled: "2025-11-01",
			complete_instances: ["2025-10-31"],
		});

		const invalid = jest.fn();
		const projection = new CalendarTaskProjection(makeContext(), invalid);
		projection.setTasks([task]);
		const entries = projection.entriesInRange({ start: "2025-11-01", end: "2025-11-02" });

		// ENDONDONE part is stripped so rrule can parse; a next-scheduled
		// entry should appear on 2025-11-01.
		expect(entries.length).toBeGreaterThan(0);
		expect(entries.some((e) => e.recurringKind === "next-scheduled")).toBe(true);
		expect(invalid).not.toHaveBeenCalled();
	});

	it("does not resurrect a stale scheduled date via showOverdueOnToday when terminated", () => {
		const task = makeTask({
			recurrence: "DTSTART:20251031T090000Z;FREQ=DAILY;ENDONDONE=1",
			scheduled: "2025-10-31",
			complete_instances: ["2025-10-31"],
		});

		const invalid = jest.fn();
		const projection = new CalendarTaskProjection(makeContext(), invalid);
		projection.setTasks([task]);
		const entries = projection.entriesInRange({ start: "2025-11-01", end: "2025-11-02" });

		const overdueEntries = entries.filter((e) => e.isOverdueOnToday);
		expect(overdueEntries).toEqual([]);
	});

	it("produces no entries for a terminated WEEKLY recurrence", () => {
		const task = makeTask({
			recurrence: "DTSTART:20251006;FREQ=WEEKLY;BYDAY=MO;ENDONDONE=1",
			scheduled: "2025-10-13",
			complete_instances: ["2025-10-13"],
		});

		const invalid = jest.fn();
		const projection = new CalendarTaskProjection(makeContext(), invalid);
		projection.setTasks([task]);
		const entries = projection.entriesInRange({ start: "2025-11-01", end: "2025-11-08" });

		expect(entries).toEqual([]);
		expect(invalid).not.toHaveBeenCalled();
	});
});