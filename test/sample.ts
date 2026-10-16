import { readdirSync, readFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { buildSnapshot } from '../src/model/snapshot.ts';
import type { RawNote, VaultSnapshot } from '../src/model/types.ts';

const SAMPLE_VAULT = fileURLToPath(new URL('../sample-vault/', import.meta.url));

/** The sample vault as a snapshot, the way the views receive it. */
export function loadSample(dir: string = SAMPLE_VAULT): VaultSnapshot {
  return buildSnapshot(readSample(dir));
}

/**
 * The sample as it was before story points (deviation 5): the same notes with `points`, `points_planned` and `points_done`
 * taken out. The tests written before points read this, so their figures are the ones they expect; a test about points
 * reads loadSample() or readSample().
 */
export function loadSampleWithoutPoints(): VaultSnapshot {
  return buildSnapshot(readSampleWithoutPoints());
}

const POINT_FIELDS = ['points', 'points_planned', 'points_done'];

export function readSampleWithoutPoints(dir: string = SAMPLE_VAULT): RawNote[] {
  return readSample(dir).map((n) => {
    const frontmatter = n.frontmatter && { ...n.frontmatter };
    if (frontmatter) for (const f of POINT_FIELDS) delete frontmatter[f];
    return { ...n, frontmatter };
  });
}

/** The sample vault's notes, by path, as buildSnapshot takes them. The preview's sample.json is this as JSON. */
export function readSample(dir: string = SAMPLE_VAULT): RawNote[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => readNote(dir, f));
}

function readNote(dir: string, file: string): RawNote {
  // All lines, frontmatter included, so task line numbers match the file.
  // Split on \r?\n so a note saved with CRLF still parses (parseTaskLine's regex does not match '\r').
  const lines = readFileSync(join(dir, file), 'utf8').split(/\r?\n/);
  return { path: file.split(sep).join('/'), frontmatter: frontmatterOf(lines), lines };
}

/** The YAML between a leading '---' line and the next one. yaml's core schema keeps dates as strings, as Obsidian does. */
function frontmatterOf(lines: string[]): Record<string, unknown> | undefined {
  if (lines[0] !== '---') return undefined;
  const end = lines.indexOf('---', 1);
  if (end < 0) return undefined;
  const data: unknown = parse(lines.slice(1, end).join('\n'));
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
}
