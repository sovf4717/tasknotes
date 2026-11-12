/**
 * Extension to the default Bases file templates that adds a "Completed at"
 * column to the Agenda base, displaying the time of day each task was
 * completed.
 *
 * This complements `defaultBasesFiles.ts` by providing the additional formula
 * and properties YAML that should be appended to the agenda base template.
 */

import { TaskNotesPlugin } from "../main";
import {
	generateCompletedAtTimeFormula,
	generateCompletedAtPropertiesYaml,
} from "../bases/completedAtFormula";
import { COMPLETED_AT_PROPERTY } from "../services/task-service/taskPropertyUpdate-extension";

/**
 * Generate the Bases formula string for the "Completed at" column given the
 * plugin's field mapper configuration.
 */
export function getCompletedAtTimeFormula(plugin: TaskNotesPlugin): string {
	// The property name for completedAt as a Bases property.
	// Since completedAt is not in the standard FieldMapping, it's used as-is
	// or mapped through custom properties.
	const property = COMPLETED_AT_PROPERTY;
	return generateCompletedAtTimeFormula(property);
}

/**
 * Generate the properties YAML block to add to the agenda base template.
 * This should be appended after the existing properties section.
 */
export function getAgendaCompletedAtPropertiesYaml(plugin: TaskNotesPlugin): string {
	return generateCompletedAtPropertiesYaml(COMPLETED_AT_PROPERTY);
}

/**
 * Generate the complete agenda Bases file content with the "Completed at"
 * column added. This is a standalone template that can be used as an
 * alternative to the default agenda base.
 */
export function generateAgendaWithCompletedAtBase(plugin: TaskNotesPlugin): string {
	const formula = getCompletedAtTimeFormula(plugin);
	const propertiesYaml = getAgendaCompletedAtPropertiesYaml(plugin);

	return `# Agenda with Completed At\n# Extension: adds a 'Completed at' column showing the time each task was completed\n\nformulas:\n  completedAtTime: ${JSON.stringify(formula)}\n\n${propertiesYaml}\n\nviews:\n  - type: tasknotesCalendar\n    name: "Agenda"\n    showPropertyBasedEvents: false\n    showOverdueOnToday: true\n    createDailyNotesFromDateLinks: true\n    calendarView: "listWeek"\n    startDateProperty: file.ctime\n    listDayCount: 7\n    titleProperty: file.basename\n`;
}
