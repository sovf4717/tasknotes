/**
 * Registry to track active CalendarView instances so that external events
 * (e.g. daily-note file opens) can navigate them to a specific date.
 */

export interface NavigableCalendarView {
	navigateToDailyNote(dateStr: string): void;
}

const activeViews: NavigableCalendarView[] = [];

export function registerCalendarView(view: NavigableCalendarView): void {
	if (!activeViews.includes(view)) {
		activeViews.push(view);
	}
}

export function unregisterCalendarView(view: NavigableCalendarView): void {
	const idx = activeViews.indexOf(view);
	if (idx >= 0) {
		activeViews.splice(idx, 1);
	}
}

export function navigateAllCalendarsToDailyNote(dateStr: string): void {
	for (const view of activeViews) {
		view.navigateToDailyNote(dateStr);
	}
}