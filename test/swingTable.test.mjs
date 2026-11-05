// Part of the APK.audio project — http://APK.audio — made by Anthony Kuzub
// MIT Licence. Free, for everyone, for ever. Full text in LICENSE at the root.
// THE ONE TABLE (ROAD-3494): the groove guide is APKTable 'sampler-swing-guide'.
// The guide's rows and the lit-row rule are taken out of SeqControls.jsx and
// drawn on the vendored apk-table in a stub DOM (apk-table-shim.cjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const { loadApkTable, rowsOf } = createRequire(import.meta.url)('./apk-table-shim.cjs');
const APP = new URL('..', import.meta.url).pathname;
const src = readFileSync(APP + 'libControl/Sequencer/SeqControls.jsx', 'utf8');

test('the groove guide is APKTable sampler-swing-guide, the knob\'s row lit', () => {
  const { window, document } = loadApkTable(APP + 'vendor/apk-table/apk-table.js');
  const guide = vm.runInContext(`(${/const SWING_GUIDE = (\[[\s\S]*?\n\]);/.exec(src)[1]})`, window);
  const t = window.APKTable.create(document.createElement('div'), {
    id: 'sampler-swing-guide', editable: false, sortable: false, toolbar: false,
    columns: [{ key: 'pct' }, { key: 'feel' }, { key: 'ratio' }], rows: guide,
    rowClass: (r) => (r.lit(66) ? 'seq-swing-on' : ''),
  });
  assert.equal(window.APKTable.get('sampler-swing-guide'), t);
  assert.deepEqual(rowsOf(t).map((r) => r[0]), ['50%', '54-62%', '66%', '75%']);
  assert.deepEqual(t.el.querySelector('tbody').children.map((tr) => tr.classList.contains('seq-swing-on')), [false, false, true, false]);
  assert.match(src, /window\.APKTable\.create\(host, \{\s*id: 'sampler-swing-guide'/);
  assert.doesNotMatch(src, /<table/);
});

test('the page loads the vendored table before the bundle', () => {
  const html = readFileSync(APP + 'index.html', 'utf8');
  assert.ok(html.indexOf('vendor/apk-table/apk-table.js') < html.indexOf('dist/app.js'));
});
