import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { installObsidianDom } from '../preview/obsidian-dom.ts';

// The views call Obsidian's setCssProps and setCssStyles on HTML and SVG elements alike; the preview and the tests install them here.
const win = parseHTML('<!doctype html><html><body></body></html>');
installObsidianDom(win.document, win.HTMLElement as unknown as typeof HTMLElement, win.SVGElement as unknown as typeof SVGElement);

test('setCssProps sets custom properties, on an HTML element and on an SVG one', () => {
  const div = win.document.createElement('div');
  div.setCssProps({ '--brain-at': '12', '--brain-len': '3' });
  assert.equal(div.style.getPropertyValue('--brain-at'), '12');
  assert.equal(div.style.getPropertyValue('--brain-len'), '3');
  const circle = win.document.createElementNS('http://www.w3.org/2000/svg', 'circle') as unknown as SVGElement;
  circle.setCssProps({ '--brain-p': '5' });
  assert.equal(circle.style.getPropertyValue('--brain-p'), '5');
});

test('setCssStyles takes camelCase keys and sets their CSS names, on an HTML element and on an SVG one', () => {
  const div = win.document.createElement('div');
  div.setCssStyles({ maxWidth: '10px', maxHeight: '20px', left: '3px', top: '4px', translate: '1px 2px' });
  assert.equal(div.style.getPropertyValue('max-width'), '10px');
  assert.equal(div.style.getPropertyValue('max-height'), '20px');
  assert.equal(div.style.getPropertyValue('left'), '3px');
  assert.equal(div.style.getPropertyValue('top'), '4px');
  assert.equal(div.style.getPropertyValue('translate'), '1px 2px');
  const circle = win.document.createElementNS('http://www.w3.org/2000/svg', 'circle') as unknown as SVGElement;
  circle.setCssStyles({ left: '5px' });
  assert.equal(circle.style.getPropertyValue('left'), '5px');
});
