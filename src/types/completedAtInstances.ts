/**
 * Recorded completion time of a single recurring-task occurrence.
 * `date` is the occurrence date (YYYY-MM-DD) and `at` is the local
 * completion date-time (YYYY-MM-DDTHH:mm) the user completed that day.
 */
export interface CompletedAtInstance {
	date: string; // Occurrence date (YYYY-MM-DD)
	at: string; // Local date-time (YYYY-MM-DDTHH:mm) when that occurrence was completed
}

/**
 * Extension to TaskInfo that adds per-occurrence completion time tracking
 * for recurring tasks. Each day keeps its own recorded completion time.
 */
export interface CompletedAtInstancesExtension {
	completedAtInstances?: CompletedAtInstance[];
	completedAt?: string; // Legacy: latest completion time (YYYY-MM-DDTHH:mm)
}
