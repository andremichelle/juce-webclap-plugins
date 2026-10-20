import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FORMAT, STORAGE_KEY, validatePreset, readLibrary, saveLibrary, matches} from './gui/presets.mjs';
const params = [{id: 'output', value: .5}, {id: 'ratio', value: .2}];
const preset = () => ({format: FORMAT, version: 1, name: 'Test', parameters: {output: .5, ratio: .2}});
test('preset format round trips without sharing mutable parameter objects', () => {
    const source = preset(), result = validatePreset(JSON.parse(JSON.stringify(source)), params);
    assert.deepEqual(result, source); result.parameters.output = .9; assert.equal(source.parameters.output, .5);
});
test('rejects wrong versions, incomplete and foreign settings, nonfinite and out-of-range values', () => {
    for (const value of [null, [], {}, {...preset(), version: 2}, {...preset(), format: 'other'}, {...preset(), extra: 1},
        {...preset(), parameters: {output: .5}}, {...preset(), parameters: {output: .5, foreign: .5}},
        ...[NaN, Infinity, -1, 2, '0.5', null].map(value => ({...preset(), parameters: {output: value, ratio: .2}}))]) {
        assert.throws(() => validatePreset(value, params));
    }
});
test('names are bounded and safe text, with whitespace normalized', () => {
    assert.equal(validatePreset({...preset(), name: '  Bass  '}, params).name, 'Bass');
    for (const name of ['', '   ', '\nName', 'x'.repeat(81), 123]) assert.throws(() => validatePreset({...preset(), name}, params));
    assert.equal(validatePreset({...preset(), name: '<script>'}, params).name, '<script>');
});
test('user library survives storage round trip without overwriting factory entries', () => {
    const memory = new Map(), storage = {getItem: key => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value)};
    assert.deepEqual(readLibrary(storage, params), []);
    const library = [{id: 'user:test-1', preset: preset()}]; saveLibrary(storage, library);
    assert.deepEqual(readLibrary(storage, params), library); assert(memory.has(STORAGE_KEY));
});
test('malformed, duplicate, oversized libraries and unavailable storage report failure', () => {
    const entry = {id: 'user:test', preset: preset()};
    for (const text of ['broken', '{}', JSON.stringify([entry, entry]), JSON.stringify([{...entry, id: 'factory:0'}]), JSON.stringify(Array(129).fill(entry))]) {
        assert.throws(() => readLibrary({getItem: () => text}, params));
    }
    assert.throws(() => saveLibrary({setItem: () => {throw new Error('quota');}}, [entry]), /quota/);
    assert.throws(() => saveLibrary({setItem: () => assert.fail('must not write')}, Array(129).fill(entry)));
});
test('edited settings are detected, allowing small float round-trip error', () => {
    assert(matches(preset(), params)); assert(matches(preset(), [{id: 'output', value: .50000001}, params[1]]));
    assert(!matches(preset(), [{id: 'output', value: .6}, params[1]]));
});
