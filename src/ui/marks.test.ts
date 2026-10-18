import { test } from 'node:test';
import assert from 'node:assert/strict';
import '../../test/ui.ts';
import { h } from './dom.ts';
import { checkMark, foldAllIcon, planIcon, progress, projectIcon, repeatMark, ring, stepIcon } from './marks.ts';

test('h builds an element with classes, attributes and children, and skips null', () => {
  const li = h('li', 'brain-task brain-draggable', { 'data-state': 'todo', tabindex: '0' }, ['Clean the gutters', null, h('span')]);
  assert.equal(li.tagName, 'LI');
  assert.equal(li.className, 'brain-task brain-draggable');
  assert.equal(li.getAttribute('data-state'), 'todo');
  assert.equal(li.getAttribute('tabindex'), '0');
  assert.equal(li.textContent, 'Clean the gutters');
  assert.equal(li.childNodes.length, 2);
});

test('checkMark: the 18px mark with ring, half, tick and dash', () => {
  const mark = checkMark();
  assert.equal(mark.getAttribute('class'), 'brain-mark');
  assert.equal(mark.getAttribute('viewBox'), '0 0 18 18');
  assert.equal(mark.getAttribute('aria-hidden'), 'true');
  assert.deepEqual(
    [...mark.children].map((part) => part.getAttribute('class')),
    ['brain-mark-ring', 'brain-mark-half', 'brain-mark-tick', 'brain-mark-dash'],
  );
  const [ringPart, half, tick, dash] = mark.children;
  assert.equal(ringPart.getAttribute('pathLength'), '60');
  assert.equal(ringPart.getAttribute('r'), '8');
  assert.equal(half.getAttribute('d'), 'M9 3a6 6 0 0 0 0 12z');
  assert.equal(tick.getAttribute('d'), 'M5 9.25l2.5 2.5L13 6.25');
  assert.equal(dash.getAttribute('d'), 'M5.5 9h7');
});

test('repeatMark: the same ring with a centre dot, hidden by its wrapper instead', () => {
  const mark = repeatMark();
  assert.equal(mark.getAttribute('class'), 'brain-mark');
  assert.equal(mark.hasAttribute('aria-hidden'), false);
  assert.deepEqual([...mark.children].map((part) => part.getAttribute('class')), ['brain-mark-ring', 'brain-mark-dot']);
  assert.equal(mark.children[0].getAttribute('pathLength'), '60');
  assert.equal(mark.children[1].getAttribute('r'), '3');
});

test('ring: a story card, 1 of 3 done (Choose a contractor)', () => {
  const r = ring(1, 3, 16, '1 of 3 done');
  assert.equal(r.getAttribute('class'), 'brain-ring');
  assert.equal(r.getAttribute('viewBox'), '0 0 16 16');
  assert.equal(r.getAttribute('role'), 'img');
  assert.equal(r.getAttribute('aria-label'), '1 of 3 done');
  const [track, fill] = r.children;
  assert.equal(track.getAttribute('class'), 'brain-ring-track');
  assert.deepEqual([track.getAttribute('cx'), track.getAttribute('cy'), track.getAttribute('r')], ['8', '8', '7']);
  assert.equal(fill.getAttribute('class'), 'brain-ring-fill');
  assert.equal(fill.getAttribute('pathLength'), '100');
  assert.equal((fill as SVGElement).style.getPropertyValue('--brain-p'), '33.3');
});

test('ring: 24px for a view head, 2 of 8 is 25%', () => {
  const r = ring(2, 8, 24, '2 of 8 done');
  assert.equal(r.getAttribute('viewBox'), '0 0 24 24');
  assert.equal(r.children[0].getAttribute('r'), '11');
  assert.equal((r.children[1] as SVGElement).style.getPropertyValue('--brain-p'), '25');
});

test('ring: nothing done draws only the track, and a total of 0 is fine', () => {
  assert.equal(ring(0, 4, 24, '0 of 4 done today').children.length, 1);
  const empty = ring(0, 0, 18, '0 of 0 done');
  assert.equal(empty.getAttribute('viewBox'), '0 0 18 18');
  assert.equal(empty.children.length, 1);
  assert.equal(empty.children[0].getAttribute('r'), '8');
  assert.doesNotMatch(empty.outerHTML, /NaN|Infinity/);
});

test('ring: never divides by zero, and never fills past the full circle', () => {
  // A total of 0 with something done would be Infinity: no fill, no Infinity.
  const odd = ring(2, 0, 16, '2 of 0 done');
  assert.equal(odd.children.length, 1);
  assert.doesNotMatch(odd.outerHTML, /NaN|Infinity/);
  assert.equal((ring(5, 3, 16, '5 of 3 done').children[1] as SVGElement).style.getPropertyValue('--brain-p'), '100');
});

test('progress: the 16px ring and a count that screen readers skip', () => {
  const p = progress(0, 2);
  assert.equal(p.className, 'brain-progress');
  assert.equal(p.querySelector('.brain-ring')?.getAttribute('aria-label'), '0 of 2 done');
  assert.equal(p.querySelector('.brain-ring')?.children.length, 1);   // 0 of 2: only the track (mockup)
  const count = p.children[1];
  assert.equal(count.getAttribute('aria-hidden'), 'true');
  assert.equal(count.textContent, '0/2');
});

test('stepIcon: the pager chevrons, ‹ and ›, hidden from screen readers', () => {
  const paths = (dir: 'prev' | 'next') => {
    const icon = stepIcon(dir);
    assert.equal(icon.getAttribute('class'), 'brain-step-icon');
    assert.equal(icon.getAttribute('viewBox'), '0 0 16 16');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    return [...icon.children].map((p) => p.getAttribute('d'));
  };
  assert.deepEqual(paths('prev'), ['M10 3.5 5.5 8l4.5 4.5']);
  assert.deepEqual(paths('next'), ['M6 3.5l4.5 4.5L6 12.5']);
});

test('planIcon: a 16px svg, hidden from screen readers, with its calendar, arrow and clock shapes', () => {
  const cal = planIcon('cal');
  assert.deepEqual([cal.getAttribute('class'), cal.getAttribute('viewBox'), cal.getAttribute('aria-hidden')], ['brain-plan-icon', '0 0 16 16', 'true']);
  assert.deepEqual([cal.querySelector('rect')?.getAttribute('rx'), cal.querySelector('rect')?.getAttribute('width')], ['2', '12']);
  assert.deepEqual([...cal.querySelectorAll('path')].map((p) => p.getAttribute('d')), ['M2 6.75h12M5.25 1.75v2.5M10.75 1.75v2.5']);
  assert.deepEqual([...planIcon('back').querySelectorAll('path')].map((p) => p.getAttribute('d')), ['M13 8H3M7 3.5 2.5 8 7 12.5']);
  assert.deepEqual([...planIcon('fwd').querySelectorAll('path')].map((p) => p.getAttribute('d')), ['M3 8h10M9 3.5 13.5 8 9 12.5']);
  const clock = planIcon('clock');
  assert.equal(clock.querySelector('circle')?.getAttribute('r'), '6');
  assert.deepEqual([...clock.querySelectorAll('path')].map((p) => p.getAttribute('d')), ['M8 4.75V8l2.25 1.5']);
});

test('projectIcon: one shape per status, in the 18px box, hidden from screen readers', () => {
  const statuses = ['active', 'paused', 'someday', 'done', 'dropped'] as const;
  const shapes = statuses.map((status) => {
    const icon = projectIcon(status);
    assert.equal(icon.getAttribute('viewBox'), '0 0 18 18');
    assert.equal(icon.getAttribute('aria-hidden'), 'true');
    assert.equal(icon.getAttribute('class'), 'brain-mark brain-state-icon');
    return icon.children.length;
  });
  assert.deepEqual(shapes, [1, 2, 1, 2, 2]);
  assert.equal(projectIcon('someday').children[0].getAttribute('transform'), 'translate(0 .6) scale(.75)');
});

test('foldAllIcon: Collapse all is a compact list (a dot and a short line, three times); Expand all is a detailed list (two squares, two lines each)', () => {
  const shapes = (name: 'collapse' | 'expand') => {
    const icon = foldAllIcon(name);
    assert.deepEqual([icon.getAttribute('class'), icon.getAttribute('viewBox'), icon.getAttribute('aria-hidden')], ['brain-fold-icon', '0 0 16 16', 'true']);
    return [...icon.children].map((part) => part.localName);
  };
  assert.deepEqual(shapes('collapse'), ['path']);
  const dotsAndLines = foldAllIcon('collapse').querySelector('path')?.getAttribute('d')?.match(/M[\d. ]+h[\d.]+/g);
  assert.deepEqual(dotsAndLines?.map((part) => part.split('h')[1]), ['.01', '8.5', '.01', '8.5', '.01', '8.5']);
  assert.deepEqual(shapes('expand'), ['rect', 'rect', 'path']);
  const lines = foldAllIcon('expand').querySelector('path')?.getAttribute('d')?.match(/M[\d. ]+h[\d.]+/g);
  assert.equal(lines?.length, 4);
});
