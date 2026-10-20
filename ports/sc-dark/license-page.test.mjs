import assert from 'node:assert/strict';
import test from 'node:test';
import {licensePage} from './license-page.mjs';

test('license page embeds the full texts and escapes source content without remote asset dependencies', () => {
    const page = licensePage({license: 'GPL text <license> & "terms"', frameworkLicense: 'ISC text', notices: 'Component notices',
        sourceURL: 'https://github.com/example/port/tree/123'});
    assert(page.includes('GPL text &lt;license&gt; &amp; &quot;terms&quot;'));
    assert(page.includes('ISC text') && page.includes('Component notices'));
    assert(page.includes('href="./style.css"'));
    assert(!/<script|<iframe|fetch\(/.test(page));
});
test('license page rejects an executable source URL', () => {
    assert.throws(() => licensePage({license: '', frameworkLicense: '', notices: '', sourceURL: 'javascript:alert(1)'}), /HTTPS/);
});
