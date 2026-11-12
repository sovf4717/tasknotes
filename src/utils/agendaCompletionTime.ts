/**
 * Utility for inserting "completed time + task name" entries above the
 * agenda-default.base embed in a daily note when a task is completed.
 *
 * This works by writing a Markdown line above the `![[agenda-default.base]]`
 * embed, formatted as:
 * - [completedAt] taskTitle
 *
 * For example:
 * - 14:32 Buy groceries
 * - 09:15 Morning standup
 *
 * These entries are plain Markdown and do not modify the .base file itself.
 */

import type { TFile, Workspace } from "obsidian";
import { getCompletedAtTimeForDate, COMPLETED_AT_INSTANCES_PROPERTY } from "./completedAtInstances";
import { getCurrentDateTimeString, formatDateForStorage, getDatePart } from "./dateUtils";
import type { CompletedAtInstance } from "../types/completedAtInstances";

/**
 * Format a completion entry line for insertion above the agenda base embed.
 * The format is: `- HH:mm Task Title`
 */
export function formatCompletionEntryLine(
	taskTitle: string,
	completedAt: string, // "YYYY-MM-DDTHH:mm" format
	occurrenceDate?: string
): string {
	const time = getCompletedAtTimeForDate(
		{
			completedAtInstances: [
				{ date: occurrenceDate ?? getDatePart(completedAt), at: completedAt },
			] as CompletedAtInstance[],
		},
		occurrenceDate ?? getDatePart(completedAt)
	);
	const timeDisplay = time ?? "";
	return `- ${timeDisplay} ${taskTitle}`;
}

/**
 * Build the Markdown text to insert above the `![[agenda-default.base]]` line.
 * Collects recently completed tasks for today and formats them as a list.
 */
export function buildCompletionTimeBlock(
	completedTasks: Array<{
		title: string;
		completedAt: string;
	}>
): string {
	if (completedTasks.length === 0) {
		return "";
	}

	// Sort by completion time (earliest first)
	const sorted = [...completedTasks].sort((a, b) => {
		const timeA = a.completedAt.substring(11, 16);
		const timeB = b.completedAt.substring(11, 16);
		return timeA.localeCompare(timeB);
	});

	const lines = sorted.map((task) => {
		const time = task.completedAt.substring(11, 16);
		return `- ${time} ${task.title}`;
	});

	return lines.join("\n");
}

/**
 * Find the `![[agenda-default.base]]` line in a Markdown file's content and
 * insert the completion time block above it.
 *
 * @param content The full Markdown content of the daily note
 * @param completionBlock The block of completed task entries to insert
 * @returns The modified content with the completion block inserted above the base embed
 */
export function insertCompletionAboveAgendaBase(
	content: string,
	completionBlock: string
): string {
	if (!completionBlock) {
		return content;
	}

	// Look for the agenda-default.base embed line
	const embedPattern = /!\[\[agenda-default\.base\]\]/g;
	const lines = content.split("\n");
	let inserted = false;

	for (let i = 0; i < lines.length; i++) {
		if (embedPattern.test(lines[i])) {
			// Remove existing completion block if present (lines starting with "- HH:MM ")
			// Look for the section just above the embed line that contains our markers
			const sectionStart = findCompletionSectionStart(lines, i);
			if (sectionStart >= 0) {
				// Replace existing section
				lines.splice(sectionStart, i - sectionStart, ...completionBlock.split("\n"), "");
				i += completionBlock.split("\n").length + 1;
			} else {
				// Insert before the embed line
				lines.splice(i, 0, ...completionBlock.split("\n"), "");
				i += completionBlock.split("\n").length + 2;
			}
			inserted = true;
			break;
		}
	}

	if (!inserted) {
		// No embed found, append at the end
		return content + "\n" + completionBlock + "\n";
	}

	return lines.join("\n");
}

/**
 * Find the start of the completion time section (consecutive lines matching
 * `- HH:MM ...` immediately above the embed line).
 */
function findCompletionSectionStart(lines: string[], embedLineIndex: number): number {
	const completionLinePattern = /^- \d{2}:\d{2} /;
	let start = embedLineIndex - 1;

	while (start >= 0 && completionLinePattern.test(lines[start])) {
		start--;
	}

	// Skip a blank line if present
	if (start >= 0 && lines[start].trim() === "") {
		start--;
	}

	return start + 1;
}

/**
 * Get the completion block for a specific day from the daily note's frontmatter
 * or embedded data.
 */
export function getDayCompletionBlock(
	frontmatter: Record<string, unknown>,
	day: string
): string {
	const completedAtInstances = frontmatter[COMPLETED_AT_INSTANCES_PROPERTY];
	if (!Array.isArray(completedAtInstances)) {
		return "";
	}

	const tasks = completedAtInstances
		.filter((entry): entry is { date: string; at: string; title?: string } => {
			return (
				typeof entry === "object" &&
				entry !== null &&
				Array.isArray.call(entry, completedAtInstances) !== false
			);
		})
		.filter((entry) => entry.date === day)
		.map((entry) => ({
			time: entry.at?.substring(11, 16) ?? "",
			title: entry.title ?? "",
		}));

	if (tasks.length === 0) {
		return "";
	}

	return tasks
		.sort((a, b) => a.time.localeCompare(b.time))
		.map((t) => `- ${t.time} ${t.title}`)
		.join("\n");
}
