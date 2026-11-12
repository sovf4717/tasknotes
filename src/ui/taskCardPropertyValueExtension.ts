/**
 * Extension to task card property value resolution that supports
 * per-occurrence completion time lookup for recurring tasks.
 *
 * This complements the existing `getTaskCardPropertyValue` in
 * `taskCardPropertyAccess.ts` by adding awareness of `completedAtInstances`
 * so that each day in a recurring task's agenda shows its own completion
 * time rather than always showing the latest one.
 */

import type { TaskInfo } from "../types";
import type { CompletedAtInstance } from "../types/completedAtInstances";
import {
	COMPLETED_AT_INSTANCES_PROPERTY,
	getCompletedAtTimeForDate,
} from "../utils/completedAtInstances";
import { getDatePart, getTodayString } from "../utils/dateUtils";
import type { TaskCardPropertyAccessContext } from "./taskCardPropertyAccess";

/**
 * Optional per-property value overrides for task card rendering.
 */
export interface TaskCardPropertyValueOptions {
	/**
	 * Occurrence date (YYYY-MM-DD) whose recorded completion time should be
	 * shown for the `formula.completedAtTime` property. Defaults to the
	 * system date when omitted.
	 */
	completedAtTimeDate?: string;
}

/**
 * Get a task card property value with extended support for per-occurrence
 * completion times. For `formula.completedAtTime`, this resolves the
 * completion time specific to the given occurrence date from the task's
 * `completedAtInstances` data.
 *
 * Falls back to the standard `getTaskCardPropertyValue` for all other
 * properties.
 */
export function getTaskCardPropertyValueExtended(
	task: TaskInfo & { completedAtInstances?: CompletedAtInstance[] },
	propertyId: string,
	context: TaskCardPropertyAccessContext,
	options?: TaskCardPropertyValueOptions
): unknown {
	if (propertyId === "formula.completedAtTime") {
		const day = options?.completedAtTimeDate ?? getTodayString();
		const localTime = getCompletedAtTimeForDate(
			task,
			day,
			[]
		);
		if (localTime) {
			return localTime;
		}

		// For a recurring series task, the Bases formula value is computed from
		// the single latest `completedAt` value and therefore only reflects the
		// most recent occurrence's time. Fall back to it just when that latest
		// completion belongs to this same day; otherwise this day would show
		// another occurrence's time instead of its own.
		const taskAny = task as unknown as { recurrence?: unknown; recurrence_parent?: unknown; occurrence_date?: unknown; completedAt?: string };
		if (taskAny.recurrence && !taskAny.recurrence_parent && !taskAny.occurrence_date) {
			const latestDate = taskAny.completedAt ? getDatePart(taskAny.completedAt) : "";
			if (latestDate !== day) {
				return "";
			}
		}
	}

	return undefined; // Signal to caller to fall back to standard resolution
}

/**
 * Resolve the completion time for a specific occurrence date from a task's
 * data. This is a convenience wrapper that combines in-memory data with
 * frontmatter lookups.
 */
export function resolveCompletedAtTimeForDate(
	task: TaskInfo & { completedAtInstances?: CompletedAtInstance[] },
	dateStr: string
): string | undefined {
	return getCompletedAtTimeForDate(task, dateStr);
}
