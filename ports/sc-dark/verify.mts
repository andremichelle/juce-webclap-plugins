import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gunzipSync } from 'node:zlib';
import nodeProcess from 'node:process';
import {thresholdAt} from './gui/point-drag.mjs';
import {helpFor} from './gui/help-content.mjs';

const root = nodeProcess.env.OPENDAW_ROOT;
assert(root, 'Set OPENDAW_ROOT to a built openDAW checkout');
const { WclapBridges } = await import(pathToFileURL(`${root}/packages/studio/core-wasm/src/wclap/wclap-bridge.ts`).href);
const archive = gunzipSync(readFileSync(new URL('../../build/sc-dark/polarity-sc-dark.wclap.tar.gz', import.meta.url)));
const files = [];
const text = (offset, size) => archive.subarray(offset, offset + size).toString('utf8').split('\0')[0];
for (let offset = 0; offset + 512 <= archive.length && archive[offset] !== 0;) {
    const size = parseInt(text(offset + 124, 12).trim() || '0', 8);
    const name = text(offset, 100), prefix = text(offset + 345, 155), type = text(offset + 156, 1);
    if (type === '0' || type === '') {
        const path = `${prefix ? `${prefix}/` : ''}${name}`.replace(/^polarity-sc-dark\.wclap\//, '');
        files.push({path, bytes: new Uint8Array(archive.subarray(offset + 512, offset + 512 + size))});
    }
    offset += 512 + Math.ceil(size / 512) * 512;
}
for (const path of ['module.wasm', 'gui/index.html', 'gui/app.js', 'gui/style.css', 'gui/help.mjs', 'gui/help-content.mjs', 'gui/guide.html', 'gui/guide.mjs', 'README.md', 'DEVELOPMENT.md', 'WRITING.md', 'LICENSE', 'NOTICES.md', 'licenses/NIH-plug-ISC.txt', 'licenses/dependencies.json', 'licenses/Rust-library.html', 'source.json']) assert(files.some(file => file.path === path), `Bundle missing ${path}`);
const bundledText = path => new TextDecoder().decode(files.find(file => file.path === path)!.bytes);
const provenance = JSON.parse(bundledText('source.json'));
assert.equal(provenance.upstreamRevision, 'cc990a190545c515b590b05d5e0f4cdcae175b5b');
assert.equal(provenance.license, 'GPL-3.0-or-later');
assert(bundledText('NOTICES.md').includes(provenance.portRevision));
const dependencies = JSON.parse(bundledText('licenses/dependencies.json'));
assert.deepEqual(dependencies.filter(pkg => pkg.missingLicenseText).map(pkg => pkg.name), ['realfft']);
const bundle = {files};
const UUID = '01020304-0506-0708-090a-0b0c0d0e0f10', ID = 'de.polarity-music.polarity-sc-dark';
const encoder = new TextEncoder(), decoder = new TextDecoder();
const passed = [];
async function test(name, run) { await run(); passed.push(name); console.log(`PASS ${name}`); }

async function createHost(sampleRate = 48000, savedState) {
    const memory = new WebAssembly.Memory({initial: 16});
    const host = {memory, statuses: [], params: [], states: [], loads: [], messages: [], reported: [], frame: 0, sampleRate};
    host.bridge = new WclapBridges(memory, sampleRate, {
        loadBundle: async () => bundle,
        sendGui: (_uuid, bytes) => host.messages.push(JSON.parse(decoder.decode(bytes))),
        sendState: (_uuid, bytes) => host.states.push(new Uint8Array(bytes)),
        sendParams: (_uuid, params) => { host.params = params; },
        sendParam: (_uuid, id, value, gesture) => host.reported.push({id, value, gesture}),
        sendHovered: () => {}, requestGuiResize: () => {}, requestSave: () => {},
        sendStatus: (_uuid, status) => host.statuses.push(status), track: promise => host.loads.push(promise),
    });
    host.api = host.bridge.imports();
    const bytes = new Uint8Array(memory.buffer);
    bytes.set(Uint8Array.from({length: 16}, (_, index) => index + 1));
    bytes.set(encoder.encode('sc-dark'), 16); bytes.set(encoder.encode(ID), 1024);
    host.handle = host.api.host_wclap_create(0);
    if (savedState) {
        const encoded = encoder.encode(Buffer.from(savedState).toString('base64'));
        bytes.set(encoded, 8192); host.api.host_wclap_state(host.handle, 8192, encoded.length);
    }
    host.api.host_wclap_load(host.handle, 16, 7, 1024, ID.length);
    await Promise.all(host.loads);
    assert.equal(host.statuses.at(-1)?.state, 'ready', JSON.stringify(host.statuses));
    return host;
}
function close(host) { host.api.host_wclap_release(host.handle); }
function process(host, frames = 128, amplitude = 0.1, sidechain = 0) {
    for (const offset of [4096, 4608]) {
        const samples = new Float32Array(host.memory.buffer, offset, frames);
        samples.forEach((_, index) => { samples[index] = Math.sin((host.frame + index) * 2 * Math.PI * 440 / host.sampleRate) * amplitude; });
    }
    if (sidechain) {
        for (const offset of [6144, 6656]) new Float32Array(host.memory.buffer, offset, frames).fill(sidechain);
        host.api.host_wclap_input(host.handle, 1, 6144, 6656, frames);
    }
    assert.equal(host.api.host_wclap_process(host.handle, 4096, 4608, 5120, 5632, frames, 120, host.frame / host.sampleRate * 2, 4), 1, JSON.stringify(host.statuses));
    host.frame += frames;
    const left = new Float32Array(host.memory.buffer, 5120, frames).slice(), right = new Float32Array(host.memory.buffer, 5632, frames);
    assert(left.every(Number.isFinite) && right.every(Number.isFinite));
    return left;
}
function energy(host, blocks = 200, amplitude = 0.1) {
    let sum = 0;
    for (let block = 0; block < blocks; block++) for (const value of process(host, 128, amplitude)) sum += value * value;
    return sum / (blocks * 128);
}
function message(host, data) { host.bridge.receive(UUID, encoder.encode(JSON.stringify(data)).buffer); }
function snapshot(host) { message(host, {op: 'poll'}); assert(host.messages.length > 0); return host.messages.at(-1); }
function textValue(host, id, text) { message(host, {op: 'text', id, text}); process(host); }
function valueOf(host, id) { const param = snapshot(host).params.find(param => param.id === id); assert(param, id); return param; }
function gui(host) {
    const info = host.bridge.openGui(UUID);
    assert.equal(info.uri, '/gui/index.html'); assert(info.width >= 560 && info.height >= 500 && info.resizable);
    return info;
}

await test('bundle discovery, parameter metadata, stereo and sidechain ports', async () => {
    const host = await createHost();
    assert.equal((await host.bridge.describe('sc-dark'))[0].clapId, ID);
    assert.equal(host.params.length, 47); assert.equal(host.statuses.at(-1).inputs.length, 2);
    gui(host);
    const snap = snapshot(host);
    assert.equal(snap.params.length, 47);
    for (const param of snap.params) assert(helpFor(param.id)?.meaning, `Actual parameter is missing help: ${param.id}`);
    assert.equal(snap.params.filter(param => /^curve_point_enabled_/.test(param.id)).length, 8);
    assert.equal(valueOf(host, 'downwards_ratio').text, '1.00:1');
    assert.deepEqual(host.bridge.resizeGui(UUID, 10, 10), {width: 560, height: 500});
    assert.deepEqual(host.bridge.resizeGui(UUID, 1600, 1100), {width: 1600, height: 1100});
    host.bridge.closeGui(UUID);
    const reopened = gui(host); assert.equal(reopened.width, 1600); assert.equal(reopened.height, 1100);
    const other = await createHost(); assert.equal(gui(other).width, 1200); close(other);
    close(host);
});
await test('curve point positions use the original curve and update before the next FFT snapshot', async () => {
    const host = await createHost(); gui(host);
    const before = snapshot(host); assert.equal(before.thresholds.length, 192); assert.equal(before.curvePoints.length, 8);
    textValue(host, 'curve_point_frequency_1', '1000');
    textValue(host, 'curve_point_offset_1', '12');
    textValue(host, 'curve_point_enabled_1', 'On');
    const enabled = snapshot(host), point = enabled.curvePoints[0];
    assert(point.enabled); assert(Math.abs(point.frequency - 1000) < 1); assert(Math.abs(point.offset - 12) < .01);
    assert(enabled.thresholds.every(([, db], index) => Math.abs(db - before.thresholds[index][1] - 12) < .01));
    textValue(host, 'curve_point_offset_1', '-6');
    const changed = snapshot(host);
    assert(Math.abs(changed.curvePoints[0].threshold - point.threshold + 18) < .01);
    textValue(host, 'curve_point_enabled_1', 'Off');
    assert(snapshot(host).thresholds.every(([, db], index) => Math.abs(db - before.thresholds[index][1]) < .01));
    close(host);
});
await test('graph point edits use physical values, paired gestures, bounded parameters and unchanged DSP curve previews', async () => {
    const host = await createHost(); gui(host);
    const before = snapshot(host), ids = ['curve_point_frequency_1', 'curve_point_offset_1'];
    const original = ids.map(id => before.params.find(param => param.id === id).value);
    ids.forEach(id => message(host, {op: 'begin', id}));
    message(host, {op: 'point-set', point: 1, frequency: 2500, offset: -12});
    ids.forEach(id => message(host, {op: 'end', id})); process(host);
    let point = snapshot(host).curvePoints[0];
    assert(Math.abs(point.frequency - 2500) < 1); assert.equal(point.offset, -12);
    assert.equal(host.reported.filter(event => event.gesture === 1).length, 2);
    assert.equal(host.reported.filter(event => event.gesture === 2).length, 2);
    message(host, {op: 'point-set', point: 1, frequency: -100, offset: 100}); process(host);
    point = snapshot(host).curvePoints[0]; assert.equal(point.frequency, 30); assert.equal(point.offset, 60);
    const bounded = point;
    for (const edit of [{point: 0, frequency: 500, offset: 1}, {point: 9, frequency: 500, offset: 1},
        {point: 1, frequency: 500}, {point: 1, frequency: null, offset: 0}]) message(host, {op: 'point-set', ...edit});
    process(host); assert.deepEqual(snapshot(host).curvePoints[0], bounded);
    // Escape restores the original normalized pair inside the same gesture.
    ids.forEach(id => message(host, {op: 'begin', id}));
    message(host, {op: 'point-set', point: 1, frequency: 12000, offset: 40});
    ids.forEach((id, index) => message(host, {op: 'set', id, value: original[index]}));
    ids.forEach(id => message(host, {op: 'end', id})); process(host);
    ids.forEach((id, index) => assert.equal(valueOf(host, id).value, original[index]));
    textValue(host, 'curve_point_enabled_1', 'On'); textValue(host, 'curve_point_frequency_1', '250'); textValue(host, 'curve_point_offset_1', '-20');
    textValue(host, 'curve_point_enabled_2', 'On'); textValue(host, 'curve_point_frequency_2', '7000'); textValue(host, 'curve_point_offset_2', '15');
    textValue(host, 'thresh_curve_curve', '0.5');
    const snap = snapshot(host);
    for (const [frequency, threshold] of snap.thresholds) assert(Math.abs(thresholdAt(snap.curveBase, snap.curvePoints, frequency) - threshold) < .002);
    close(host);
});
await test('original unity defaults pass audio with FFT latency at 44.1/48/96 kHz', async () => {
    for (const rate of [44100, 48000, 96000]) {
        const host = await createHost(rate);
        energy(host); assert(Math.abs(energy(host) - 0.005) < 0.0001);
        for (const size of [1, 17, 64, 127, 128]) process(host, size);
        energy(host, 400, 0); assert(energy(host, 20, 0) < 1e-12);
        close(host);
    }
});
await test('browser edits report gestures and original downward compression changes audio', async () => {
    const host = await createHost(); gui(host); energy(host);
    const before = energy(host);
    textValue(host, 'downwards_ratio', '8'); textValue(host, 'tresh_global', '-40');
    assert(valueOf(host, 'downwards_ratio').text.startsWith('8.00'));
    assert(valueOf(host, 'tresh_global').text.includes('-40'));
    energy(host, 700); assert(energy(host) < before * 0.3);
    assert(host.reported.some(event => event.gesture === 1)); assert(host.reported.some(event => event.gesture === 2));
    const state = snapshot(host); assert.equal(state.bins.length, 192);
    assert(state.bins.every(bin => bin.every(Number.isFinite))); assert(state.bins.some(bin => bin[2] < -1));
    close(host);
});
await test('upward compression, freeze, delta and all sidechain modes remain finite', async () => {
    const host = await createHost(); gui(host);
    const before = energy(host, 500, 0.001);
    textValue(host, 'upwards_ratio', '3'); energy(host, 700, 0.001);
    assert(energy(host, 100, 0.001) > before * 2);
    textValue(host, 'compressor_freeze', 'On');
    for (let index = 0; index < 10; index++) process(host);
    message(host, {op: 'delta'}); assert(snapshot(host).delta);
    host.bridge.closeGui(UUID); gui(host); assert(!snapshot(host).delta);
    for (const value of [0, 0.5, 1]) {
        message(host, {op: 'begin', id: 'thresh_mode'}); message(host, {op: 'set', id: 'thresh_mode', value}); message(host, {op: 'end', id: 'thresh_mode'});
        for (let block = 0; block < 50; block++) process(host, 128, 0.1, 0.2);
    }
    close(host);
});
await test('parameter state restores in a fresh WebCLAP instance', async () => {
    const host = await createHost(); gui(host);
    textValue(host, 'downwards_ratio', '6'); textValue(host, 'dry_wet', '35%'); textValue(host, 'curve_point_frequency_1', '2200');
    host.bridge.saveState(UUID);
    const saved = host.states.at(-1); assert(saved?.length > 1000);
    const expected = snapshot(host).params.map(({id, value}) => [id, value]); close(host);
    const restored = await createHost(48000, saved); gui(restored); process(restored);
    assert.deepEqual(snapshot(restored).params.map(({id, value}) => [id, value]), expected); close(restored);
});
await test('invalid messages and parameter ids do not trap or alter the plugin', async () => {
    const host = await createHost(); gui(host);
    host.bridge.receive(UUID, encoder.encode('not-json').buffer);
    message(host, {op: 'set', id: 'missing', value: 1}); message(host, {op: 'text', id: 'downwards_ratio', text: 'nonsense'});
    assert(valueOf(host, 'downwards_ratio').text.startsWith('1.00')); assert(energy(host) > 0); close(host);
});
await test('original five-second Match Level completes and survives save', async () => {
    const host = await createHost(); gui(host);
    textValue(host, 'output', '6'); energy(host, 300); message(host, {op: 'match'}); energy(host, 1900);
    assert.equal(snapshot(host).status, 'Level matched'); process(host);
    assert(Math.abs(Number.parseFloat(valueOf(host, 'output').text)) < 0.1);
    host.bridge.saveState(UUID); assert(host.states.at(-1).length > 0); close(host);
});
await test('factory presets apply all settings and persist through project state', async () => {
    const host = await createHost(); gui(host);
    message(host, {op: 'factory-presets', request: 'factories'});
    const factories = host.messages.at(-1).presets; assert.equal(factories.length, 3);
    const detail = factories.find(preset => preset.name === 'Detail Lift'); assert(detail);
    textValue(host, 'curve_point_enabled_1', 'On');
    message(host, {op: 'apply-preset', preset: detail, request: 'apply'});
    assert.equal(host.messages.at(-1).ok, true); process(host);
    assert(valueOf(host, 'downwards_ratio').text.startsWith('8.00'));
    assert(valueOf(host, 'upwards_ratio').text.startsWith('3.00'));
    assert.equal(valueOf(host, 'curve_point_enabled_1').value, 0);
    assert.equal(valueOf(host, 'output').text, '-6.00 dB');
    energy(host, 200); host.bridge.saveState(UUID);
    const saved = host.states.at(-1), expected = snapshot(host).params.map(({id, value}) => [id, value]); close(host);
    const restored = await createHost(48000, saved); gui(restored); process(restored);
    assert.deepEqual(snapshot(restored).params.map(({id, value}) => [id, value]), expected); close(restored);
});
await test('capture waits for queued edits and invalid presets change nothing', async () => {
    const host = await createHost(); gui(host);
    message(host, {op: 'begin', id: 'output'}); message(host, {op: 'set', id: 'output', value: .4}); message(host, {op: 'end', id: 'output'});
    message(host, {op: 'capture-preset', text: 'Immediate save', request: 'capture'}); assert.equal(host.messages.at(-1).busy, true);
    process(host); message(host, {op: 'capture-preset', text: 'Immediate save', request: 'capture'});
    const captured = host.messages.at(-1); assert.equal(captured.busy, false); assert(Math.abs(captured.preset.parameters.output - .4) < 1e-6);
    const before = snapshot(host).params.map(({id, value}) => [id, value]);
    for (const bad of [{...captured.preset, version: 2}, {...captured.preset, parameters: {...captured.preset.parameters, output: 1.1}}, {...captured.preset, parameters: {output: .5}}]) {
        message(host, {op: 'apply-preset', preset: bad, request: 'invalid'}); assert.equal(host.messages.at(-1).ok, false); process(host);
        assert.deepEqual(snapshot(host).params.map(({id, value}) => [id, value]), before);
    }
    close(host);
});
await test('loading a preset cancels delta and an unfinished level match', async () => {
    const host = await createHost(); gui(host);
    message(host, {op: 'factory-presets'}); const init = host.messages.at(-1).presets[0];
    textValue(host, 'output', '6'); message(host, {op: 'match'}); process(host); message(host, {op: 'delta'});
    message(host, {op: 'apply-preset', preset: init}); assert(host.messages.at(-1).ok); process(host);
    energy(host, 1900); assert.equal(snapshot(host).delta, false);
    assert.equal(valueOf(host, 'output').text, '0.00 dB'); close(host);
});
console.log(`${passed.length} WebCLAP integration checks passed`);
