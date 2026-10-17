// The page head's Undo button: top right, above the figures, hidden with nothing to undo, named for the step on top.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { absent } from '../../test/ui.ts';
import type { Actions } from './actions.ts';
import { viewHead } from './header.ts';

/** An Undo pair for the head: the label it shows, whether the app runs on a Mac, and a count of the presses. */
function undo(label: string | undefined, mac = false) {
  let presses = 0;
  return {
    mac,
    presses: () => presses,
    undoLabel: (): string | undefined => label,
    undo: (): void => {
      presses++;
    },
  } satisfies Pick<Actions, 'undo' | 'undoLabel' | 'mac'> & { presses: () => number };
}

test('with a step to undo, the button names it and presses undo it', () => {
  const u = undo('untick “Pay the window cleaner”');
  const head = viewHead({ label: 'Today', title: 'Tuesday', undo: u, figure: { strong: '4', rest: 'left' } });
  const button = head.querySelector<HTMLButtonElement>('.brain-head-end > button.brain-undo');
  assert.ok(button, 'the button leads the figures in the head end');
  assert.equal(button.hasAttribute('hidden'), false);
  assert.equal(button.getAttribute('aria-label'), 'Undo: untick “Pay the window cleaner”', 'the accessible label has no shortcut');
  assert.match(button.getAttribute('title') ?? '', /^Undo: untick “Pay the window cleaner” \((⌘Z|Ctrl\+Z)\)$/);
  button.click();
  assert.equal(u.presses(), 1);
});

test('the shortcut in the tooltip is ⌘Z on a Mac and Ctrl+Z elsewhere, whatever the browser says', () => {
  const title = (mac: boolean) => viewHead({ label: 'Today', title: 'Tuesday', undo: undo('tick “A”', mac) })
    .querySelector('.brain-head-end > button.brain-undo')?.getAttribute('title');
  assert.equal(title(true), 'Undo: tick “A” (⌘Z)');
  assert.equal(title(false), 'Undo: tick “A” (Ctrl+Z)');
});

test('with nothing to undo, the button is still drawn, disabled and aria-hidden, so the head keeps its height', () => {
  // Taken out of the layout (hidden), the first step would move the figures and the page below them.
  const head = viewHead({ label: 'Week', title: '5–11 October', undo: undo(undefined) });
  const button = head.querySelector<HTMLButtonElement>('.brain-head-end > button.brain-undo');
  assert.ok(button, 'the button is in the head');
  assert.equal(button.hasAttribute('hidden'), false);
  assert.equal(button.hasAttribute('disabled'), true, 'so it takes no tab stop');
  assert.equal(button.getAttribute('aria-hidden'), 'true', 'and no reader');
  assert.equal(button.getAttribute('aria-label'), 'Undo');
});

test('with a step to undo, the button is enabled and read out', () => {
  const button = viewHead({ label: 'Today', title: 'Tuesday', undo: undo('tick “A”') })
    .querySelector<HTMLButtonElement>('.brain-head-end > button.brain-undo');
  assert.equal(button?.hasAttribute('disabled'), false);
  assert.equal(button?.hasAttribute('aria-hidden'), false);
});

test('a page without figures keeps the button at the top right, and a page without undo (the Guide) has no head end', () => {
  const withUndo = viewHead({ label: 'Backlog', title: '3 to sort', undo: undo('tick “A”') });
  assert.ok(withUndo.querySelector('.brain-head-end > button.brain-undo'));
  const guide = viewHead({ label: 'Ninja Board', title: 'Guide' });
  absent(guide.querySelector('.brain-head-end'));
});

test('a week with its figures keeps the button above them', () => {
  const head = viewHead({
    label: 'This week', title: '12–18 October', undo: undo('tick “A”'),
    tasks: { done: 2, total: 16 }, tally: { inWeek: 5, due: 3 },
  });
  const end = head.querySelector('.brain-head-end');
  assert.ok(end);
  assert.equal(end.firstElementChild?.tagName, 'BUTTON');
  assert.ok(end.querySelector(':scope > .brain-figures'));
});
