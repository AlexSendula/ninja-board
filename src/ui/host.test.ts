// The base blocks and embeds around a view carry the mark the CSS hides their Bases toolbar by. The note around them carries none.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseHTML } from 'linkedom';
import { markHosts } from './host.ts';

function page(html: string) {
  return parseHTML(`<!doctype html><html><body>${html}</body></html>`).document;
}

test('an embed with a view in it is marked; the embed beside it, the note around it and the page are not', () => {
  const doc = page(`
    <div id="outside">
      <section class="markdown-preview-view" id="note">
        <div class="metadata-container"></div>
        <div class="block-language-base" id="embed"><div class="bases-header"></div><div id="body"><div class="brain-view" id="view"></div></div></div>
        <div class="bases-embed" id="beside"></div>
      </section>
    </div>`);
  markHosts(doc.getElementById('view')!);
  assert.equal(doc.getElementById('embed')!.classList.contains('brain-embed-host'), true);
  assert.equal(doc.getElementById('beside')!.classList.contains('brain-embed-host'), false);
  assert.equal(doc.getElementById('note')!.className, 'markdown-preview-view', 'the note gets no mark: it is not reachable when a view loads');
  assert.equal(doc.getElementById('outside')!.className, '');
});

test('a view in an embed inside an embed marks both, however deep the view is', () => {
  const doc = page(`
    <div class="bases-embed" id="outer">
      <div class="internal-embed"><div class="block-language-base" id="inner"><div><div class="brain-view" id="view"></div></div></div></div>
    </div>`);
  markHosts(doc.getElementById('view')!);
  assert.equal(doc.getElementById('outer')!.classList.contains('brain-embed-host'), true);
  assert.equal(doc.getElementById('inner')!.classList.contains('brain-embed-host'), true);
});

test('unmarking clears a host once no other view is in it, and keeps it while one is', () => {
  const doc = page(`<div class="block-language-base" id="embed"><div class="brain-view" id="one"></div><div class="brain-view" id="two"></div></div>`);
  const embed = doc.getElementById('embed')!;
  const unmarkOne = markHosts(doc.getElementById('one')!);
  const unmarkTwo = markHosts(doc.getElementById('two')!);
  unmarkOne();
  assert.equal(embed.classList.contains('brain-embed-host'), true, 'the second view is still in the embed');
  unmarkTwo();
  assert.equal(embed.classList.contains('brain-embed-host'), false);
});
