import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBoardPage } from './isBoardPage.ts';

test('a cssclasses list that holds ninja-board marks a board page, among other classes too', () => {
  assert.equal(isBoardPage({ cssclasses: ['ninja-board'] }), true);
  assert.equal(isBoardPage({ type: 'note', cssclasses: ['wide', 'ninja-board', 'tidy'] }), true);
});

test('a cssclasses string that is ninja-board marks a board page, as Obsidian accepts a single class as a string', () => {
  assert.equal(isBoardPage({ cssclasses: 'ninja-board' }), true);
});

test('other classes, an absent or empty cssclasses and no frontmatter are no board page', () => {
  assert.equal(isBoardPage({ cssclasses: ['wide'] }), false);
  assert.equal(isBoardPage({ cssclasses: [] }), false);
  assert.equal(isBoardPage({ cssclasses: 'wide' }), false);
  assert.equal(isBoardPage({ type: 'note' }), false);
  assert.equal(isBoardPage({}), false);
  assert.equal(isBoardPage(undefined), false);
  assert.equal(isBoardPage(null), false);
});

test('a class that only starts with, or holds, ninja-board is no board page: the match is exact', () => {
  assert.equal(isBoardPage({ cssclasses: ['ninja-board-x'] }), false);
  assert.equal(isBoardPage({ cssclasses: 'ninja-board-x' }), false);
  assert.equal(isBoardPage({ cssclasses: ['my-ninja-board'] }), false);
  assert.equal(isBoardPage({ cssclasses: ['Ninja-Board'] }), false);
  assert.equal(isBoardPage({ cssclasses: 'wide ninja-board' }), false, 'a string is one class, not split');
});

test('the key is found in any case, and each item is trimmed, as Obsidian does for the class it applies', () => {
  assert.equal(isBoardPage({ CSSClasses: ['ninja-board'] }), true);
  assert.equal(isBoardPage({ cssClasses: 'ninja-board' }), true);
  assert.equal(isBoardPage({ cssclasses: [' ninja-board'] }), true);
  assert.equal(isBoardPage({ cssclasses: ['wide', "ninja-board\t"] }), true);
  assert.equal(isBoardPage({ cssclasses: ' ninja-board ' }), true);
});

test('Obsidian drops a class with a space in it, and ignores the old singular cssclass key, so neither is a board page', () => {
  assert.equal(isBoardPage({ cssclasses: ['wide ninja-board'] }), false);
  assert.equal(isBoardPage({ cssclass: 'ninja-board' }), false);
  assert.equal(isBoardPage({ cssclass: ['ninja-board'] }), false);
});

test('a non-string item does not count, and does not hide a real one next to it', () => {
  assert.equal(isBoardPage({ cssclasses: [1, null, { 'ninja-board': true }] }), false);
  assert.equal(isBoardPage({ cssclasses: [null, 'ninja-board'] }), true);
  assert.equal(isBoardPage({ cssclasses: 42 }), false);
  assert.equal(isBoardPage({ cssclasses: true }), false);
});

test('anything that is not a frontmatter object is no board page', () => {
  assert.equal(isBoardPage('ninja-board'), false);
  assert.equal(isBoardPage(['ninja-board']), false);
  assert.equal(isBoardPage(7), false);
});
