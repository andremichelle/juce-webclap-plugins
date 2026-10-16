import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {helpFor, topics, guideSections, referenceGroups} from './gui/help-content.mjs';

const parameterIds = ['tresh_global', 'thresh_center_freq', 'thresh_curve_slope', 'thresh_curve_curve', 'thresh_mode', 'thresh_sc_link', 'gain_smoothing',
    'output', 'bypass', 'dry_wet', 'stft_window', 'stft_overlap', 'attack', 'release', 'compressor_freeze',
    ...['downwards', 'upwards'].flatMap(prefix => ['threshold_offset', 'ratio', 'high_freq_rolloff', 'knee'].map(field => `${prefix}_${field}`)),
    ...Array.from({length: 8}, (_, index) => ['enabled', 'frequency', 'offset'].map(field => `curve_point_${field}_${index + 1}`)).flat()];

test('all 47 parameters have a complete short explanation, example and caution', () => {
    assert.equal(new Set(parameterIds).size, 47);
    for (const id of parameterIds) {
        const help = helpFor(id); assert(help, `Missing ${id}`);
        for (const field of ['title', 'meaning', 'tryIt', 'caution']) assert.equal(typeof help[field], 'string');
        assert(help.meaning.length > 30 && help.tryIt.length > 20 && help.caution.length > 20, id);
        assert(Object.values(help).join(' ').split(/\s+/).length < 160, `Keep ${id} short`);
    }
});
test('point help preserves the selected number and rejects nonexistent controls', () => {
    for (let index = 1; index <= 8; index++) assert(helpFor(`curve_point_offset_${index}`).title.startsWith(`Point ${index}:`));
    for (const id of ['missing', '__proto__', 'constructor', 'curve_point_enabled_0', 'curve_point_enabled_9', 'curve_point_offset_1_extra']) assert.equal(helpFor(id), undefined);
});
test('guide references only available topics and covers the full set of non-point controls', () => {
    const references = new Set(referenceGroups.flatMap(([, ids]) => ids));
    for (const id of references) assert(helpFor(id), id);
    for (const id of parameterIds.filter(id => !id.startsWith('curve_point_'))) assert(references.has(id), id);
    for (const id of Object.keys(topics)) assert(references.has(id), id);
    assert.equal(new Set(guideSections.map(section => section.id)).size, guideSections.length);
    assert(guideSections.find(section => section.id === 'start').steps.length >= 4);
});
test('help distinguishes controls that are easy to confuse and explains important limits', () => {
    assert(helpFor('gain_smoothing').caution.includes('graph animation'));
    assert(helpFor('output').caution.includes('0% Mix'));
    assert(helpFor('thresh_mode').meaning.includes('does not add noise'));
    assert(helpFor('thresh_sc_link').meaning.includes('sidechain modes'));
    assert(helpFor('upwards_high_freq_rolloff').caution.includes('not a filter that directly decreases'));
    assert(helpFor('match').caution.includes('not a limiter'));
    assert(helpFor('compressor_freeze').caution.includes('not the captured gain pattern'));
    assert(helpFor('preset-import').meaning.includes('does not change the current control values'));
});

const sentences = text => [...new Intl.Segmenter('en', {granularity: 'sentence'}).segment(text)].map(item => item.segment.trim()).filter(Boolean);
const words = text => text.split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
function checkLength(text, limit, context) {
    for (const sentence of sentences(text)) assert(words(sentence) <= limit, `${context}: ${words(sentence)} words, limit ${limit}: ${sentence}`);
}
test('help uses short sentences and paragraphs under conservative project length checks', () => {
    for (const id of [...parameterIds, ...Object.keys(topics)]) {
        const help = helpFor(id);
        checkLength(help.meaning, 25, `${id}: description`);
        checkLength(help.tryIt, 20, `${id}: instructions`);
        checkLength(help.caution, 25, `${id}: limits`);
        for (const text of [help.meaning, help.tryIt, help.caution]) assert(sentences(text).length <= 6, id);
    }
    for (const section of guideSections) {
        for (const text of section.paragraphs ?? []) { checkLength(text, 25, section.id); assert(sentences(text).length <= 6); }
        for (const text of section.steps ?? []) checkLength(text, 20, section.id);
        for (const [, text] of section.terms ?? []) { checkLength(text, 25, section.id); assert(sentences(text).length <= 6); }
    }
});
test('browser explanations and current documentation have no removed product comparisons', () => {
    const text = JSON.stringify({topics, guideSections}) + ['README.md', 'DEVELOPMENT.md', 'WRITING.md'].map(path =>
        readFileSync(new URL(path, import.meta.url), 'utf8')).join('\n');
    assert(!/\b(?:OTT|Ableton|Abelton)\b/i.test(text));
});
test('current documentation keeps sentences within conservative project length limits', () => {
    for (const path of ['README.md', 'DEVELOPMENT.md', 'WRITING.md']) {
        const text = readFileSync(new URL(path, import.meta.url), 'utf8').replace(/```[\s\S]*?```/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/`([^`]+)`/g, '$1');
        for (const line of text.split('\n')) {
            if (!line.trim() || /^\s*[#|]/.test(line)) continue;
            checkLength(line.replace(/^\s*(?:\d+\.|-)\s*/, ''), /^\s*\d+\./.test(line) ? 20 : 25, path);
        }
    }
});
