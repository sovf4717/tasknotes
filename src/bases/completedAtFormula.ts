/**
 * Bases formula for displaying the completion time (HH:mm) of a task.
 * Uses the `completedAt` frontmatter property that records the local
 * date-time when a task was marked complete.
 *
 * For recurring tasks, the per-occurrence `completedAtInstances` property
 * provides each day's own completion time, preventing the latest completion
 * from overwriting earlier days' times.
 */

/** The fixed frontmatter property name for the latest completion timestamp. */
export const COMPLETED_AT_PROPERTY = "completedAt";

/**
 * Generate the Bases formula string for the "Completed at" column.
 * The property name is resolved by the caller using mapPropertyToBasesProperty.
 *
 * @param completedAtProperty The Bases property name (e.g. "completedAt" or user-mapped name)
 * @returns A Bases formula that formats the completion time as HH:mm
 */
export function generateCompletedAtTimeFormula(completedAtProperty: string): string {
	// Use date() to parse the stored "YYYY-MM-DDTHH:mm" and format as HH:mm
	return `if(${completedAtProperty}, date(${completedAtProperty}).format("HH:mm"), "")`;
}

/**
 * Generate the Bases properties YAML block for the "Completed at" column.
 * This is appended to the agenda base's properties section.
 */
export function generateCompletedAtPropertiesYaml(completedAtProperty: string): string {
	return `properties:
  formula.completedAtTime:
    displayName: Completed at
`;
}

/**
 * Generate the Bases properties YAML block for the "Completed at" column
 * when the property already exists in the base file.
 */
export function generateCompletedAtPropertiesAppendYaml(): string {
	return `properties:
  formula.completedAtTime:
    displayName: Completed at
`;
}
