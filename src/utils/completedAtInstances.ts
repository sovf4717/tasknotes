import type { CompletedAtInstance, TaskInfo } from "../types";
import { format } from "date-fns";
import { formatDateForStorage } from "./dateUtils";

/**
 * Fixed frontmatter property that stores per-occurrence completion times for
 * recurring tasks. Each entry records the local completion time of one
 * occurrence date, so completing one day never overwrites another day's time.
 * The legacy `completedAt` property still holds the latest completion time.
 */
export const COMPLETED_AT_INSTANCES_PROPERTY = "completedAtInstances";

const OCCURRENCE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Build the stored completion stamp for an occurrence date.
 *
 * When the occurrence was completed today the real local time is used. For a
 * past occurrence that is being back-filled (for example from the task edit
 * modal's completions calendar) the occurrence's own date is used instead,
 * so a back-filled day never carries another day's completion time.
 */
export function buildCompletedAtValue(occurrenceDate: string, now: Date = new Date()): string {
	const today = formatDateForStorage(now);
	if (occurrenceDate === today) {
		return format(now, "yyyy-MM-dd'T'HH:mm");
	}
	return `${occurrenceDate}T00:00`;
}

function parseCompletedAtInstance(value: unknown): CompletedAtInstance | null {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return null;
	}

	const record = value as Record<string, unknown>;
	const date = typeof record.date === "string" ? record.date.trim() : "";
	const at = typeof record.at === "string" ? record.at.trim() : "";
	if (!OCCURRENCE_DATE_PATTERN.test(date) || at.length < 16) {
		return null;
	}

	return { date, at };
}

/**
 * Normalize a raw frontmatter value into a sorted, deduplicated list of
 * per-occurrence completion times. Invalid entries are dropped.
 */
export function normalizeCompletedAtInstances(value: unknown): CompletedAtInstance[] {
	if (!Array.isArray(value)) {
		return [];
	}

	const seen = new Map<string, CompletedAtInstance>();
	for (const raw of value) {
		const entry = parseCompletedAtInstance(raw);
		if (entry) {
			seen.set(entry.date, entry);
		}
	}

	return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Add or replace the recorded completion time for a given occurrence date.
 */
export function upsertCompletedAtInstanceList(
	value: unknown,
	dateStr: string,
	at: string
): CompletedAtInstance[] {
	const list = normalizeCompletedAtInstances(value);
	const index = list.findIndex((entry) => entry.date === dateStr);
	if (index >= 0) {
		list[index] = { date: dateStr, at };
	} else {
		list.push({ date: dateStr, at });
	}

	return list.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Remove the recorded completion time for a given occurrence date.
 */
export function removeCompletedAtInstance(value: unknown, dateStr: string): CompletedAtInstance[] {
	return normalizeCompletedAtInstances(value).filter((entry) => entry.date !== dateStr);
}

/**
 * Keep only recorded completion times strictly before the given date.
 */
export function filterCompletedAtInstancesBefore(
	value: unknown,
	dateStr: string
): CompletedAtInstance[] {
	return normalizeCompletedAtInstances(value).filter((entry) => entry.date < dateStr);
}

/**
 * Format a stored local completion time ("YYYY-MM-DDTHH:mm[:ss]") as "HH:mm".
 */
export function formatCompletedAtTime(atValue: string): string {
	const match = /^(?:\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(atValue.trim());
return match ? match[1] : "";
}

/**
 * Return the stored full completion stamp ("YYYY-MM-DDTHH:mm[:ss]") for a
 * specific occurrence date, looking at the task's runtime data first and
 * falling back to raw sources (e.g. the file's frontmatter).
 */
export function getCompletedAtValueForDate(
	task: Pick<TaskInfo, "completedAtInstances" | "customProperties"> | null | undefined,
	dateStr: string,
	extraSources: readonly unknown[] = []
): string | undefined {
	const sources: unknown[] = [
		task?.completedAtInstances,
		task?.customProperties?.[COMPLETED_AT_INSTANCES_PROPERTY],
		...extraSources,
	];

	for (const source of sources) {
		if (source === null || source === undefined) {
			continue;
		}
		const entry = normalizeCompletedAtInstances(source).find((item) => item.date === dateStr);
		if (entry) {
			return entry.at;
		}
	}

	return undefined;
}

/**
 * Look up the recorded completion time ("HH:mm") for one occurrence date.
 * Falls back through task properties in the order: in-memory
 * `completedAtInstances`, Bases-carried `customProperties`, then any extra
 * raw sources (e.g. the file's frontmatter) passed by the caller.
 */
export function getCompletedAtTimeForDate(
	task: Pick<TaskInfo, "completedAtInstances" | "customProperties"> | null | undefined,
	dateStr: string,
	extraSources: readonly unknown[] = []
): string | undefined {
	const sources: unknown[] = [
		task?.completedAtInstances,
		task?.customProperties?.[COMPLETED_AT_INSTANCES_PROPERTY],
		...extraSources,
	];

	for (const source of sources) {
		if (source === null || source === undefined) {
			continue;
		}
		const entry = normalizeCompletedAtInstances(source).find((item) => item.date === dateStr);
		if (entry) {
			const time = formatCompletedAtTime(entry.at);
			if (time) {
				return time;
			}
		}
	}

	return undefined;
}