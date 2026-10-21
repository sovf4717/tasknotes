import { TaskInfo } from "../types";
import { extractBasesValue } from "./taskCardPresentation";
import { createTaskNotesLogger } from "../utils/tasknotesLogger";
import {
	COMPLETED_AT_INSTANCES_PROPERTY,
getCompletedAtTimeForDate,
	getCompletedAtValueForDate,
} from "../utils/completedAtInstances";
import { getDatePart, getTodayString } from "../utils/dateUtils";

const tasknotesLogger = createTaskNotesLogger({ tag: "Ui/TaskCardPropertyAccess" });

type BasesDataWithGetter = {
	getValue(propertyId: string): unknown;
};

type MetadataCacheLike = {
	getCache(path: string): { frontmatter?: Record<string, unknown> } | null | undefined;
};

type TaskCardFieldMapper = {
	lookupMappingKey(propertyId: string): string | null | undefined;
};

type TaskCardUserField = {
	id?: string;
	key?: string;
};

export interface TaskCardPropertyAccessContext {
	fieldMapper: TaskCardFieldMapper;
	settings: {
		userFields?: readonly TaskCardUserField[];
	};
	app: {
		metadataCache: MetadataCacheLike;
	};
}

function getBasesDataGetter(value: unknown): BasesDataWithGetter | null {
	if (
		value !== null &&
		typeof value === "object" &&
		typeof (value as { getValue?: unknown }).getValue === "function"
	) {
		return value as BasesDataWithGetter;
	}
	return null;
}

const PROPERTY_EXTRACTORS: Record<string, (task: TaskInfo) => unknown> = {
	due: (task) => task.due,
	scheduled: (task) => task.scheduled,
	projects: (task) => task.projects,
	contexts: (task) => task.contexts,
	tags: (task) => task.tags,
	blocked: (task) => task.isBlocked,
	blocking: (task) => task.isBlocking,
	blockedBy: (task) => task.blockedBy,
	blockingTasks: (task) => task.blocking,
	timeEstimate: (task) => task.timeEstimate,
	timeEntries: (task) => task.timeEntries,
	totalTrackedTime: (task) => task.totalTrackedTime,
	recurrence: (task) => task.recurrence,
	recurrenceParent: (task) => task.recurrence_parent,
	occurrenceDate: (task) => task.occurrence_date,
	occurrenceMaterialization: (task) => task.occurrence_materialization,
	occurrenceNextTrigger: (task) => task.occurrence_next_trigger,
	occurrenceTemplate: (task) => task.occurrence_template,
	occurrencePastHorizon: (task) => task.occurrence_past_horizon,
	occurrenceFutureHorizon: (task) => task.occurrence_future_horizon,
	completedDate: (task) => task.completedDate,
	reminders: (task) => task.reminders,
	icsEventId: (task) => task.icsEventId,
	completeInstances: (task) => task.complete_instances,
	skippedInstances: (task) => task.skipped_instances,
	dateCreated: (task) => task.dateCreated,
	dateModified: (task) => task.dateModified,
	sortOrder: (task) => task.sortOrder,
	googleCalendarSync: (task) => task.path,
	checklistProgress: (task) => task.path,
};

function hasPropertyExtractor(propertyId: string): boolean {
	return Object.prototype.hasOwnProperty.call(PROPERTY_EXTRACTORS, propertyId);
}

function getPropertyExtractorValue(task: TaskInfo, propertyId: string): unknown {
	return PROPERTY_EXTRACTORS[propertyId](task);
}

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

export function getTaskCardPropertyValue(
	task: TaskInfo,
	propertyId: string,
	context: TaskCardPropertyAccessContext,
	options?: TaskCardPropertyValueOptions
): unknown {
	try {
		// The generated "completedAtTime" Bases formula was computed from the
		// single latest `completedAt` value, which overwrote every day's
		// completion time for recurring tasks. Prefer this occurrence date's
		// own recorded time from `completedAtInstances` instead.
		if (propertyId === "formula.completedAtTime") {
			const day = options?.completedAtTimeDate ?? getTodayString();
			const localTime = getCompletedAtTimeForDate(
				task,
				day,
				task.path
					? [getFrontmatterValue(task.path, COMPLETED_AT_INSTANCES_PROPERTY, context)]
					: []
			);
			if (localTime) {
				return localTime;
			}

			// For a recurring series task, the Bases formula value is computed
			// from the single latest `completedAt` value and therefore only
			// reflects the most recent occurrence's time. Fall back to it just
			// when that latest completion belongs to this same day; otherwise
			// this day would show another occurrence's time instead of its own.
			// Materialized occurrence files keep their own `completedAt`, so the
			// fallback is still valid for them.
			if (task.recurrence && !task.recurrence_parent && !task.occurrence_date) {
				const latestDate = task.completedAt ? getDatePart(task.completedAt) : "";
				if (latestDate !== day) {
					return "";
				}
			}
		}
		const mappingKey = context.fieldMapper.lookupMappingKey(propertyId);
		if (mappingKey && hasPropertyExtractor(mappingKey)) {
			return getPropertyExtractorValue(task, mappingKey);
		}

if (hasPropertyExtractor(propertyId)) {
			return getPropertyExtractorValue(task, propertyId);
		}

		// For any property that maps to the internal "completedAt" field,
		// prefer the per-occurrence completion time from completedAtInstances
		// when a specific occurrence date is being displayed (agenda/calendar).
		// This prevents the single latest completedAt value from overwriting
		// every day's own recorded completion time for recurring tasks.
		if (
			options?.completedAtTimeDate &&
			mappingKey === "completedAt" &&
			task.recurrence &&
			!task.recurrence_parent &&
			!task.occurrence_date
		) {
			const day = options.completedAtTimeDate;
			const localValue = getCompletedAtValueForDate(
				task,
				day,
				task.path
					? [getFrontmatterValue(task.path, COMPLETED_AT_INSTANCES_PROPERTY, context)]
					: []
			);
			if (localValue) {
				return localValue;
			}

			// Don't leak another day's completion time into this day's display.
			const latestDate = task.completedAt ? getDatePart(task.completedAt) : "";
			if (latestDate !== day) {
				return "";
			}
		}

		if (propertyId.startsWith("user:")) {
			return getUserPropertyValue(task, propertyId, context);
		}

		if (task.customProperties && propertyId in task.customProperties) {
			return extractBasesValue(task.customProperties[propertyId]);
		}

		if (task.customProperties) {
			const filePropertyId = `file.${propertyId}`;
			if (filePropertyId in task.customProperties) {
				return extractBasesValue(task.customProperties[filePropertyId]);
			}
		}

		if (propertyId.startsWith("file.")) {
			const basesData = getBasesDataGetter(task.basesData);
			if (basesData) {
				try {
					const value = basesData.getValue(propertyId);
					if (value !== null && value !== undefined) {
						return extractBasesValue(value);
					}
				} catch {
					// Bases property missing.
				}
			}
		}

		if (propertyId.startsWith("formula.")) {
			try {
				const basesData = getBasesDataGetter(task.basesData);
				if (!basesData) {
					return "";
				}

				const value = basesData.getValue(propertyId);
				if (value === null || value === undefined) {
					return "";
				}

				const extracted = extractBasesValue(value);
				return extracted !== "" ? extracted : "";
			} catch (error) {
				tasknotesLogger.debug(`[TaskNotes] Error computing formula ${propertyId}:`, {
					category: "validation",
					operation: "computing-formula",
					error: error,
				});
				return "[Formula Error]";
			}
		}

		const basesData = getBasesDataGetter(task.basesData);
		if (basesData) {
			try {
				const notePropertyId = `note.${propertyId}`;
				const value = basesData.getValue(notePropertyId);
				if (value !== null && value !== undefined) {
					return extractBasesValue(value);
				}
			} catch {
				// Property doesn't exist in Bases.
			}
		}

		if (task.path) {
			const value = getFrontmatterValue(task.path, propertyId, context);
			if (value !== undefined) {
				return value;
			}
		}

		return null;
	} catch (error) {
		tasknotesLogger.warn(`TaskCard: Error getting property ${propertyId}:`, {
			category: "persistence",
			operation: "taskcard-getting-property",
			error: error,
		});
		return null;
	}
}

function getUserPropertyValue(
	task: TaskInfo,
	propertyId: string,
	context: TaskCardPropertyAccessContext
): unknown {
	const fieldId = propertyId.slice(5);
	const userField = context.settings.userFields?.find((field) => field.id === fieldId);
	if (!userField?.key) {
		return null;
	}

	let value = (task as unknown as Record<string, unknown>)[userField.key];
	if (value === undefined) {
		value = getFrontmatterValue(task.path, userField.key, context);
	}

	return value;
}

function getFrontmatterValue(
	taskPath: string,
	key: string,
	context: TaskCardPropertyAccessContext
): unknown {
	try {
		const fileMetadata = context.app.metadataCache.getCache(taskPath);
		if (!fileMetadata?.frontmatter) {
			return undefined;
		}

		return fileMetadata.frontmatter[key];
	} catch (error) {
		tasknotesLogger.warn(`TaskCard: Error accessing frontmatter for ${taskPath}:`, {
			category: "validation",
			operation: "taskcard-accessing-frontmatter",
			error: error,
		});
		return undefined;
	}
}
