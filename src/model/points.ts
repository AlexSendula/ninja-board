// Story points (deviation 5): an optional estimate on a story, a task note inside a project, of 1, 2, 3, 5 or 8. The week's
// target is the config's points_per_week (8 when absent). Pure: the model, the planner card and the edit all read it here.
import type { PointsVM } from './types.ts';

export const POINTS = [1, 2, 3, 5, 8] as const;
export type Points = (typeof POINTS)[number];

/** The week's target when the config holds none (or one that isn't a positive number). */
export const DEFAULT_TARGET = 8;

/** A story's points from its frontmatter: one of the values, else none. */
export function pointsOf(v: unknown): Points | undefined {
  return POINTS.find((p) => p === v);
}

/** The week's target from the config's frontmatter: `points_per_week`, a positive number, else the default. */
export function targetOf(fm: Record<string, unknown> | undefined): number {
  const v = fm?.points_per_week;
  return typeof v === 'number' && v > 0 ? v : DEFAULT_TARGET;
}

/** A story's points in its frontmatter: set (replacing any), or removed (null). Nothing else changes. */
export function applyNotePoints(fm: Record<string, unknown>, points: Points | null): void {
  if (points === null) delete fm.points;
  else fm.points = points;
}

/**
 * A week's points from its stories: planned is every story's points, open and done; done is the done stories' points.
 * Undefined when no story in the week has points, so the figure is not drawn.
 */
export function pointsOfWeek(stories: { points?: number; done: boolean }[], target: number): PointsVM | undefined {
  if (!stories.some((s) => s.points !== undefined)) return undefined;
  const sum = (list: { points?: number }[]) => list.reduce((n, s) => n + (s.points ?? 0), 0);
  return { planned: sum(stories), done: sum(stories.filter((s) => s.done)), target };
}
