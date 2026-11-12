# Sovf Extension Features (New Files Only)

This document describes the features implemented as new files in this fork,
reproducing the changes made by @sovf4717 in their tasknotes fork.

## Added

- **Per-occurrence completion time tracking** (`completedAtInstances`): Each
  day of a recurring task now records its own independent completion time, so
  completing one day never overwrites another day's recorded time.
- **"Completed at" column in agenda base**: The default Agenda base now
  displays a time-of-day column. When a task is marked complete, its local
  completion time is recorded on the task (alongside the completion date) and
  shown in the agenda view. The time is cleared when the task is marked
  incomplete.
- **Completion time block in daily notes**: When a task is completed, a
  "completed time + task name" entry is inserted above the
  `![[agenda-default.base]]` embed in the daily note.

## New files

| File | Description |
|------|-------------|
| `src/types/completedAtInstances.ts` | `CompletedAtInstance` interface |
| `src/utils/completedAtInstances.ts` | Per-occurrence completion time utilities |
| `src/bases/completedAtFormula.ts` | Bases formula for "Completed at" column |
| `src/ui/taskCardPropertyValueExtension.ts` | Extended card property value resolution |
| `src/services/task-service/taskPropertyUpdate-extension.ts` | Extended property update with completion times |
| `src/templates/completedAtBasesExtension.ts` | Agenda base template with completion time column |
| `src/utils/agendaCompletionTime.ts` | Insert completion time entries above agenda base embed |
