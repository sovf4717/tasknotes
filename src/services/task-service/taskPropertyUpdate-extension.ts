/**
 * Extension functions for task property updates that record completion times.
 *
 * These functions supplement the existing `taskPropertyUpdate.ts` by adding
 * support for the `completedAt` and `completedAtInstances` properties without
 * modifying the original file.
 */

import type { TaskInfo } from "../../types";
import {
	COMPLETED_AT_INSTANCES_PROPERTY,
	normalizeCompletedAtInstances,
	upsertCompletedAtInstanceList,
	filterCompletedAtInstancesBefore,
} from "../../utils/completedAtInstances";

/**
 * Fixed frontmatter property that records the local date-time (YYYY-MM-DDTHH:mm:ss)
 * when a task was marked as completed. Written alongside completedDate by status
 * transitions so views can display the completion time.
 */
export const COMPLETED_AT_PROPERTY = "completedAt";

/**
 * Apply completedAt and completedAtInstances to a task's frontmatter based on
 * a status transition. This is a drop-in replacement that wraps the existing
 * `updateCompletedDateFrontmatter` call with additional parameters.
 */
export function updateCompletedAtFrontmatter(
	frontmatter: Record<string, unknown>,
	newStatus: string,
	isRecurring: boolean,
	completedDateField: string,
	completedAtField: string,
	isCompletedStatus: (status: string) => boolean,
	currentDateString: string,
	currentDateTimeString: string
): void {
	if (isRecurring) {
		return;
	}

	if (isCompletedStatus(newStatus)) {
		frontmatter[completedDateField] = currentDateString;
		frontmatter[completedAtField] = currentDateTimeString;
		return;
	}

	if (frontmatter[completedDateField]) {
		delete frontmatter[completedDateField];
	}
	if (frontmatter[completedAtField]) {
		delete frontmatter[completedAtField];
	}
}

/**
 * Apply per-occurrence completion times to a recurring task's frontmatter.
 * When an occurrence is completed, its local time is recorded in
 * `completedAtInstances`. When un-completed, the entry is removed.
 */
export function updateCompletedAtInstancesFrontmatter(
	frontmatter: Record<string, unknown>,
	plan: {
		dateStr: string;
		newComplete: boolean;
		updatedTask: TaskInfo;
	},
	completedAtInstancesField: string,
	completedAtValue: string
): void {
	if (!completedAtInstancesField) {
		return;
	}

	let completedAtInstances = normalizeCompletedAtInstances(
		frontmatter[completedAtInstancesField]
	);

	if (plan.newComplete && completedAtValue) {
		completedAtInstances = upsertCompletedAtInstanceList(
			completedAtInstances,
			plan.dateStr,
			completedAtValue
		);
		// Back-fill missing per-occurrence times for dates already in
		// complete_instances so every day keeps its own recorded time.
		const completeInstancesField = frontmatter["complete_instances"] as unknown;
		if (Array.isArray(completeInstancesField)) {
			const completeDates = completeInstancesField.filter(
				(d): d is string => typeof d === "string"
			);
			const recordedDates = new Set(completedAtInstances.map((e) => e.date));
			for (const dateStr of completeDates) {
				if (!recordedDates.has(dateStr) && dateStr !== plan.dateStr) {
					completedAtInstances = upsertCompletedAtInstanceList(
						completedAtInstances,
						dateStr,
						`${dateStr}T00:00`
					);
				}
			}
		}
	} else if (!plan.newComplete) {
		completedAtInstances = completedAtInstances.filter(
			(entry) => entry.date !== plan.dateStr
		);
	}

	if (completedAtInstances.length > 0) {
		frontmatter[completedAtInstancesField] = completedAtInstances;
	} else {
		delete frontmatter[completedAtInstancesField];
	}

	(plan.updatedTask as unknown as Record<string, unknown>).completedAtInstances =
		completedAtInstances.length > 0 ? completedAtInstances : undefined;
}

/**
 * Clean up completedAtInstances when rescheduling a recurring task's
 * occurrence to a new date. Removes entries for the removed date range.
 */
export function cleanCompletedAtInstancesOnReschedule(
	frontmatter: Record<string, unknown>,
	updatedTask: TaskInfo,
	clearDateStr: string
): void {
	const remainingCompletedAtInstances = filterCompletedAtInstancesBefore(
		frontmatter[COMPLETED_AT_INSTANCES_PROPERTY],
		clearDateStr
	);
	if (remainingCompletedAtInstances.length > 0) {
		frontmatter[COMPLETED_AT_INSTANCES_PROPERTY] = remainingCompletedAtInstances;
		(updatedTask as unknown as Record<string, unknown>).completedAtInstances =
			remainingCompletedAtInstances;
	} else {
		delete frontmatter[COMPLETED_AT_INSTANCES_PROPERTY];
		(updatedTask as unknown as Record<string, unknown>).completedAtInstances = undefined;
	}
}
