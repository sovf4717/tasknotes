/**
 * Sovf Extension for TaskNotes
 * New-file-only extension implementing sovf4717's features:
 * 1. completedAt: record local completion time when task is marked complete
 * 2. completedAtInstances: per-occurrence completion times for recurring tasks
 * 3. Insert "HH:mm task title" above ![[agenda-default.base]] in daily notes
 */

import { TFile } from "obsidian";
import type TaskNotesPlugin from "./main";
import type { TaskInfo } from "./types";
import { EVENT_TASK_UPDATED } from "./types";
import { getCurrentDateString } from "./utils/dateUtils";

interface CompletedAtInstance {
	date: string;
	at: string;
}

const COMPLETED_AT_INSTANCES = "completedAtInstances";
const COMPLETED_AT = "completedAt";

function normalizeInstances(value: unknown): CompletedAtInstance[] {
	if (!Array.isArray(value)) return [];
	const seen = new Map<string, CompletedAtInstance>();
	for (const raw of value) {
		if (raw && typeof raw === "object" && !Array.isArray(raw)) {
			const rec = raw as Record<string, unknown>;
			const date = typeof rec.date === "string" ? rec.date.trim() : "";
			const at = typeof rec.at === "string" ? rec.at.trim() : "";
			if (/^\d{4}-\d{2}-\d{2}$/.test(date) && at.length >= 16) {
				seen.set(date, { date, at });
			}
		}
	}
	return Array.from(seen.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function upsertInstance(list: CompletedAtInstance[], dateStr: string, at: string): CompletedAtInstance[] {
	const idx = list.findIndex((e) => e.date === dateStr);
	if (idx >= 0) list[idx] = { date: dateStr, at };
	else list.push({ date: dateStr, at });
	return list.sort((a, b) => a.date.localeCompare(b.date));
}

export function activateSovfExtension(plugin: TaskNotesPlugin): void {
	plugin.registerEvent(
		plugin.emitter.on(EVENT_TASK_UPDATED, (data: unknown) => {
			const event = data as { path?: string; originalTask?: TaskInfo; updatedTask?: TaskInfo };
			if (!event?.updatedTask || !event?.originalTask) return;
			const original = event.originalTask;
			const updated = event.updatedTask;
			if (!plugin.statusManager) return;
			const wasCompleted = plugin.statusManager.isCompletedStatus(original.status);
			const isCompleted = plugin.statusManager.isCompletedStatus(updated.status);
			if (wasCompleted === isCompleted) return;
			void handleStatusTransition(plugin, updated, isCompleted);
		})
	);
	console.log("[TaskNotes Sovf Extension] activated");
}

async function handleStatusTransition(
	plugin: TaskNotesPlugin,
	task: TaskInfo,
	newlyCompleted: boolean
): Promise<void> {
	try {
		const file = plugin.app.vault.getAbstractFileByPath(task.path);
		if (!(file instanceof TFile)) return;

		const now = new Date();
		const completedAtValue = `${getCurrentDateString()}T${now.toTimeString().slice(0, 5)}`;
		const dateStr = getCurrentDateString();

		const existingContent = await plugin.app.vault.read(file);
		const lines = existingContent.split("\n");
		let frontmatterEnd = -1;
		if (lines[0]?.trim() === "---") {
			for (let i = 1; i < lines.length; i++) {
				if (lines[i].trim() === "---") {
					frontmatterEnd = i;
					break;
				}
			}
		}
		if (frontmatterEnd < 0) return;

		// Simple frontmatter parser
		const fm: Record<string, unknown> = {};
		for (const line of lines.slice(1, frontmatterEnd)) {
			const m = line.match(/^(\w[\w-]*):\s*(.*)/);
			if (m) {
				const key = m[1];
				const val = m[2].trim();
				if (val === "") {
					fm[key] = [];
				} else if (val.startsWith("[")) {
					fm[key] = val;
				} else {
					fm[key] = val.replace(/^["']|["']$/g, "");
				}
			}
		}

		// completedAt
		if (newlyCompleted) {
			fm[COMPLETED_AT] = completedAtValue;
		} else {
			delete fm[COMPLETED_AT];
		}

		// completedAtInstances for recurring tasks
		if (task.recurrence) {
			const occurrenceDate = task.occurrence_date || dateStr;
			let instances = normalizeInstances(fm[COMPLETED_AT_INSTANCES]);
			if (newlyCompleted) {
				instances = upsertInstance(instances, occurrenceDate, completedAtValue);
				const completeInstances = (task.complete_instances || []) as string[];
				const recorded = new Set(instances.map((e) => e.date));
				for (const cd of completeInstances) {
					if (!recorded.has(cd) && cd !== occurrenceDate) {
						instances = upsertInstance(instances, cd, `${cd}T00:00`);
					}
				}
			} else {
				instances = instances.filter((e) => e.date !== occurrenceDate);
			}
			if (instances.length > 0) {
				fm[COMPLETED_AT_INSTANCES] = instances.map((e) => ({ date: e.date, at: e.at }));
			} else {
				delete fm[COMPLETED_AT_INSTANCES];
			}
		}

		// Rebuild frontmatter
		const newFmLines: string[] = ["---"];
		for (const [key, value] of Object.entries(fm)) {
			if (Array.isArray(value)) {
				if (value.length === 0) {
					newFmLines.push(`${key}:`);
				} else if (key === COMPLETED_AT_INSTANCES) {
					newFmLines.push(`${key}:`);
					for (const item of value as Record<string, unknown>[]) {
						newFmLines.push(`  - date: ${item.date}`);
						newFmLines.push(`    at: ${item.at}`);
					}
				} else if (typeof value[0] === "string") {
					const strs = value as string[];
					newFmLines.push(`${key}: [${strs.map((s) => (s.includes(" ") ? `"${s}"` : s)).join(", ")}]`);
				} else {
					newFmLines.push(`${key}:`);
					for (const item of value) {
						newFmLines.push(`  - ${JSON.stringify(item)}`);
					}
				}
			} else if (typeof value === "string") {
				newFmLines.push(`${key}: ${value}`);
			} else {
				newFmLines.push(`${key}: ${JSON.stringify(value)}`);
			}
		}
		newFmLines.push("---");

		const bodyLines = lines.slice(frontmatterEnd + 1);
		const newContent = [...newFmLines, ...bodyLines].join("\n");
		await plugin.app.vault.modify(file, newContent);

		if (newlyCompleted) {
			await insertCompletionInDailyNote(plugin, task.title, completedAtValue);
		}
	} catch (error) {
		console.warn("[TaskNotes Sovf Extension] failed:", error);
	}
}

async function insertCompletionInDailyNote(
	plugin: TaskNotesPlugin,
	taskTitle: string,
	completedAt: string
): Promise<void> {
	try {
		const today = getCurrentDateString();
		const allFiles = plugin.app.vault.getMarkdownFiles();
		const dailyNote = allFiles.find((f) => f.basename === today || f.basename.includes(today));
		if (!dailyNote) return;

		const content = await plugin.app.vault.read(dailyNote);
		const lines = content.split("\n");
		const timeStr = completedAt.substring(11, 16);
		const entry = `- ${timeStr} ${taskTitle}`;

		const embedIdx = lines.findIndex((l) => l.includes("![[agenda-default.base]]"));
		if (embedIdx < 0) return;

		const alreadyThere = lines.slice(Math.max(0, embedIdx - 10), embedIdx).some((l) => l.trim() === entry);
		if (alreadyThere) return;

		lines.splice(embedIdx, 0, entry);
		await plugin.app.vault.modify(dailyNote, lines.join("\n"));
	} catch (error) {
		console.warn("[TaskNotes Sovf Extension] daily note insert failed:", error);
	}
}
