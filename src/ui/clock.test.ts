import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { EventVM } from '../model/types.ts';
import { hasEnded, minutes, nextChange, wakeAt } from './clock.ts';

const ev = (start: string, end?: string): EventVM => ({ key: start, path: 'a.md', title: 'x', start, end });

test('minutes reads HH:MM and fails everything else', () => {
  assert.equal(minutes('20:15'), 1215);
  assert.equal(minutes('9:05'), 545);
  assert.ok(Number.isNaN(minutes('')));
  assert.ok(Number.isNaN(minutes('later')));
});

test('an appointment with an end is over when the end has passed; with only a start, when the start has', () => {
  assert.equal(hasEnded(ev('09:30', '10:00'), '09:59'), false);
  assert.equal(hasEnded(ev('09:30', '10:00'), '10:00'), true);
  assert.equal(hasEnded(ev('09:30', '10:00'), '10:01'), true);
  assert.equal(hasEnded(ev('10:00'), '09:59'), false);
  assert.equal(hasEnded(ev('10:00'), '10:00'), true);
  assert.equal(hasEnded(ev('10:00', ''), '10:05'), true);   // an empty end is no end
});

test('an appointment with no time is not over, and neither is one that runs past midnight', () => {
  assert.equal(hasEnded(ev(''), '23:59'), false);
  assert.equal(hasEnded(ev('23:00', '01:00'), '11:10'), false);
  assert.equal(hasEnded(ev('09:00', '10:00'), ''), false);   // no clock: nothing has ended
});

test('nextChange is the earliest end still ahead, or the start where there is no end', () => {
  const day = [ev('08:00', '09:00'), ev('09:30', '10:00'), ev('11:30', '12:30'), ev('13:00'), ev('15:00', '15:45'), ev('')];
  assert.equal(nextChange(day, '07:00'), '09:00');
  assert.equal(nextChange(day, '09:00'), '10:00');   // 09:00 itself has come
  assert.equal(nextChange(day, '11:10'), '12:30');
  assert.equal(nextChange(day, '12:30'), '13:00');
  assert.equal(nextChange(day, '15:45'), undefined);
  assert.equal(nextChange([], '11:10'), undefined);
  assert.equal(nextChange([ev('23:00', '01:00')], '11:10'), undefined);   // over tomorrow, not today
});

test('wakeAt fires once at the next end, a second into the minute (fake clock)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 15, 11, 10, 30) });
  const fire = mock.fn();
  wakeAt('12:30', new Date(), fire);
  t.mock.timers.tick(79 * 60_000 + 30_000);   // 12:30:00, a second short
  assert.equal(fire.mock.callCount(), 0);
  t.mock.timers.tick(2000);
  assert.equal(fire.mock.callCount(), 1);
  t.mock.timers.tick(60 * 60_000);
  assert.equal(fire.mock.callCount(), 1);
});

test('wakeAt can be cancelled, and a time already past fires at once', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: new Date(2026, 9, 15, 11, 10, 0) });
  const fire = mock.fn();
  wakeAt('12:30', new Date(), fire)();
  t.mock.timers.tick(2 * 60 * 60_000);
  assert.equal(fire.mock.callCount(), 0);
  wakeAt('09:00', new Date(), fire);
  t.mock.timers.tick(0);
  assert.equal(fire.mock.callCount(), 1);
});
