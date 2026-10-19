import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {helpFor, hasInlineHelp} from './gui/help-content.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? 'playwright');
const profile = process.env.SC_DARK_TEST_PROFILE;
assert(profile?.startsWith('/private/tmp/sc-dark-browser.'), 'Use a separate /private/tmp/sc-dark-browser.* test profile');
const root = fileURLToPath(new URL('../..', import.meta.url));
const results = `${root}/build/sc-dark/browser-check`;
mkdirSync(results, {recursive: true});
let context, page;
try {
    context = await chromium.launchPersistentContext(profile, {channel: 'chrome', headless: true,
        viewport: {width: 1440, height: 1100}, args: ['--autoplay-policy=no-user-gesture-required']});
    // Exercise openDAW's file-input fallback, which Playwright can supply without a native OS picker.
    await context.addInitScript(() => Object.defineProperty(window, 'showOpenFilePicker', {value: undefined}));
    page = await context.newPage();
    page.setDefaultTimeout(12000);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const checkPinnedGraph = async frame => {
        const previous = await frame.evaluate(() => {
            const main = document.querySelector('main'), details = document.querySelector('#curve-details');
            const previous = {scroll: main.scrollTop, open: details.open}; details.open = true;
            main.scrollTop = main.scrollHeight; return previous;
        });
        await frame.waitForTimeout(150);
        const geometry = await frame.evaluate(() => {
            const main = document.querySelector('main'), analyzer = document.querySelector('.analyzer');
            const viewport = main.getBoundingClientRect(), graph = analyzer.getBoundingClientRect();
            return {scroll: main.scrollTop, top: graph.top, bottom: graph.bottom, mainTop: viewport.top, mainBottom: viewport.bottom};
        });
        assert(geometry.scroll > 100, 'Test must scroll past the curve-point section');
        assert(Math.abs(geometry.top - geometry.mainTop) <= 1 && geometry.bottom < geometry.mainBottom,
            `Graph must remain visible above the controls: ${JSON.stringify(geometry)}`);
        await frame.evaluate(previous => {
            document.querySelector('#curve-details').open = previous.open;
            document.querySelector('main').scrollTop = previous.scroll;
        }, previous);
    };
    const open = async () => {
        await page.goto(process.env.OPENDAW_URL ?? 'http://localhost:8084/');
        const project = page.getByText('SC Dark browser test', {exact: true});
        await project.waitFor({timeout: 45000}); await project.click();
        await page.getByText('Not now', {exact: true}).waitFor();
        await page.getByText('Not now', {exact: true}).click({force: true});
        await page.getByText('Load Plugin', {exact: true}).waitFor();
    };
    const openUI = async () => {
        await page.getByText('Open UI', {exact: true}).click({force: true});
        await page.waitForTimeout(700);
        const ui = page.frames().find(frame => frame.url().endsWith('/gui/index.html'));
        assert(ui, 'Plugin UI frame must open');
        await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).waitFor();
        await ui.evaluate(() => {
            if (window.recordingGraph) return;
            window.recordingGraph = true;
            window.addEventListener('message', event => {
                if (!(event.data instanceof ArrayBuffer)) return;
                try { const data = JSON.parse(new TextDecoder().decode(event.data)); if (data.type === 'state') window.latestGraphState = data; } catch {}
            });
        });
        await ui.waitForFunction(() => window.latestGraphState?.curvePoints);
        return ui;
    };
    await open();
    await page.getByText('Load Plugin', {exact: true}).click(); await page.waitForTimeout(350);
    const picker = page.waitForEvent('filechooser');
    await page.getByText('Import WebCLAP...', {exact: true}).locator('..').click();
    await (await picker).setFiles(`${root}/build/sc-dark/polarity-sc-dark.wclap.tar.gz`);
    await page.waitForTimeout(800);
    let ui = await openUI();
    const helpValues = await ui.evaluate(() => window.latestGraphState.params.map(({id, value}) => [id, value]));
    const inlineValues = helpValues.filter(([id]) => hasInlineHelp(id));
    assert.equal(inlineValues.length, 44);
    assert.equal(await ui.locator('.control .help-button').count(), 44);
    assert.equal(await ui.locator('header .help-button, .presets .help-button, .legend .help-button').count(), 0);
    for (const id of ['output', 'bypass', 'dry_wet']) assert.equal(await ui.locator(`button[data-help="${id}"]`).count(), 0);
    const helpStyle = await ui.locator('.control-label').first().evaluate(element => {
        const label = getComputedStyle(element.querySelector('label')), button = element.querySelector('button'), help = getComputedStyle(button);
        return {labelFont: [label.fontFamily, label.fontSize, label.fontWeight], helpFont: [help.fontFamily, help.fontSize, help.fontWeight],
            border: help.borderTopWidth, background: help.backgroundColor, width: button.offsetWidth, height: button.offsetHeight};
    });
    assert.equal(helpStyle.helpFont[0], helpStyle.labelFont[0], 'Help button must keep the control-label font family');
    assert(parseFloat(helpStyle.border) >= 1 && helpStyle.background !== 'rgba(0, 0, 0, 0)', 'Help must look like a button before hover');
    assert(helpStyle.width >= 24 && helpStyle.height >= 24, 'Help button must retain a usable click target');
    const actionWidths = await ui.locator('#actions > button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
    assert(Math.abs(actionWidths[0] - actionWidths[1]) < 1, 'Listening action buttons must have equal widths');
    const arrow = await ui.locator('#preset-select').evaluate(element => {
        const css = getComputedStyle(element); return {appearance: css.appearance, image: css.backgroundImage, position: css.backgroundPosition, padding: parseFloat(css.paddingRight)};
    });
    assert.equal(arrow.appearance, 'none'); assert(arrow.image.includes('data:image/svg+xml'));
    assert(arrow.position.includes('10px') && arrow.padding >= 32, 'Dropdown arrow must have an inset and separate text space');
    assert.equal(await ui.locator('.badge').textContent(), 'WebCLAP version');
    await checkPinnedGraph(ui);
    await page.screenshot({path: `${results}/compact-help.png`});
    await ui.locator('#curve-details summary').click();
    for (const [id] of inlineValues) {
        const button = ui.locator(`.control .help-button[data-help="${id}"]`);
        await button.focus(); await button.press('Enter');
        await ui.locator('#help-dialog').waitFor({state: 'visible'});
        assert.equal(await ui.locator('#help-title').innerText(), helpFor(id).title);
        assert((await ui.locator('#help-body').innerText()).includes(helpFor(id).meaning));
        if (id === inlineValues[0][0]) {
            await ui.locator('#help-close').focus(); await page.keyboard.press('Shift+Tab');
            assert(await ui.evaluate(() => document.querySelector('#help-dialog').contains(document.activeElement)), 'Keyboard focus must stay in the help dialog');
            await page.keyboard.press('Tab');
            assert(await ui.locator('#help-close').evaluate(element => document.activeElement === element), 'Tab must wrap to the close button, not change the Studio screen');
            await page.keyboard.press('Space');
        } else if (id === inlineValues[1][0]) {
            await page.keyboard.press('Escape');
        } else await ui.getByRole('button', {name: 'Close help', exact: true}).click();
        await ui.locator('#help-dialog').waitFor({state: 'hidden'});
        assert(await button.evaluate(element => document.activeElement === element), 'Closing help must return focus to its help button');
    }
    await ui.locator('#curve-details summary').click();
    await ui.getByRole('button', {name: 'About / Help', exact: true}).click();
    await ui.locator('#help-body').getByRole('heading', {name: 'What is SC Dark?', exact: true}).waitFor();
    for (const id of ['output', 'bypass', 'dry_wet', 'delta', 'match', 'graph', 'presets', 'preset-save', 'preset-export', 'preset-import', 'preset-delete']) {
        await ui.locator('#help-body').getByRole('button', {name: helpFor(id).title, exact: true}).click();
        assert.equal(await ui.locator('#help-title').innerText(), helpFor(id).title);
        await ui.getByRole('button', {name: 'Beginner guide', exact: true}).click();
    }
    await ui.locator('#help-body').getByRole('button', {name: 'Smoothing', exact: true}).click();
    assert.equal(await ui.locator('#help-title').innerText(), 'Smoothing');
    await ui.getByRole('button', {name: 'Beginner guide', exact: true}).click();
    await ui.locator('#help-body').evaluate(element => element.scrollTop = 0);
    await page.screenshot({path: `${results}/beginner-guide.png`});
    const [guide] = await Promise.all([context.waitForEvent('page'), ui.getByRole('link', {name: 'Open guide in a tab', exact: true}).click()]);
    guide.on('pageerror', error => errors.push(error.message));
    await guide.locator('#guide').getByRole('heading', {name: 'What is SC Dark?', exact: true}).waitFor();
    await guide.setViewportSize({width: 360, height: 780});
    assert(await guide.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Standalone guide must fit a phone-width viewport');
    await guide.screenshot({path: `${results}/beginner-guide-mobile.png`});
    try {
        await context.setOffline(true); await guide.reload();
        await guide.locator('#guide').getByRole('button', {name: 'Upward Ratio', exact: true}).click();
        assert.equal(await guide.locator('#help-title').innerText(), 'Upward Ratio');
        assert(await guide.evaluate(() => {
            const box = document.querySelector('#help-dialog').getBoundingClientRect();
            return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
        }), 'Setting-help dialog must also fit the phone viewport');
        await guide.screenshot({path: `${results}/setting-help-mobile.png`});
    } finally { await context.setOffline(false); }
    await guide.close(); await page.bringToFront();
    await ui.getByRole('button', {name: 'Close help', exact: true}).click();
    await ui.getByRole('button', {name: 'Explain Global Threshold', exact: true}).click();
    await page.screenshot({path: `${results}/setting-help.png`});
    await ui.getByRole('button', {name: 'Close help', exact: true}).click();
    assert.deepEqual(await ui.evaluate(() => window.latestGraphState.params.map(({id, value}) => [id, value])), helpValues, 'Reading help must not change any settings');
    const [license] = await Promise.all([context.waitForEvent('page'), ui.getByRole('link', {name: /^GPL-3.0-or-later/}).click()]);
    license.on('pageerror', error => errors.push(error.message));
    await license.getByRole('heading', {name: 'License and credits', exact: true}).waitFor();
    assert(license.url().endsWith('/gui/license.html'), 'Footer must open a supported HTML resource, not extensionless LICENSE');
    assert((await license.reload()).ok());
    assert((await license.locator('.license-text').first().innerText()).includes('RealFFT'));
    assert((await license.locator('.license-text').nth(1).innerText()).includes('GNU GENERAL PUBLIC LICENSE'));
    try {
        await context.setOffline(true); await license.reload();
        await license.getByRole('heading', {name: 'License and credits', exact: true}).waitFor();
    } finally { await context.setOffline(false); }
    await license.close(); await page.bringToFront();
    console.log('PASS selective help buttons, all explanations through guide, keyboard focus/Escape, equal actions, dropdown spacing, pinned graph, offline guide and license page; parameters unchanged');
    assert.notEqual(await ui.locator('#p-stft_window').inputValue(), '', 'FFT window dropdown must show a selected option');
    const set = async (name, text, expected) => {
        const input = ui.getByRole('textbox', {name: `${name} exact value`, exact: true});
        await input.fill(text); await input.press('Enter');
        await ui.waitForFunction(({name, expected}) =>
            document.querySelector(`[aria-label="${name} exact value"]`).value === expected, {name, expected});
    };
    const stamp = Date.now(), savedName = `Preset check ${stamp}`, importedName = `Imported check ${stamp}`;
    await ui.locator('#preset-select option').filter({hasText: 'Detail Lift'}).waitFor({state: 'attached'});
    await ui.locator('#preset-select').selectOption({label: 'Detail Lift'});
    await ui.waitForFunction(() => document.querySelector('[aria-label="Downwards Ratio exact value"]').value === '8.00:1' && !document.querySelector('#preset-save').disabled);
    assert.equal(await ui.getByRole('textbox', {name: 'Upwards Ratio exact value', exact: true}).inputValue(), '3.00:1');
    await ui.getByRole('button', {name: 'Save preset…', exact: true}).click();
    await ui.locator('#preset-name').fill(savedName); await ui.locator('#preset-name').press('Enter');
    await ui.locator('#preset-select option').filter({hasText: savedName}).waitFor({state: 'attached'});
    assert.equal(await ui.locator('#preset-select').locator('option:checked').textContent(), savedName);
    const downloadEvent = page.waitForEvent('download'); await ui.getByRole('button', {name: 'Export', exact: true}).click();
    const download = await downloadEvent; await download.saveAs(`${results}/preset.scdark.json`);
    const exported = JSON.parse(readFileSync(`${results}/preset.scdark.json`, 'utf8'));
    assert.equal(exported.name, savedName); assert.equal(Object.keys(exported.parameters).length, 47);
    await page.getByText('Close UI', {exact: true}).click({force: true});
    await page.keyboard.press('Meta+s'); await page.waitForTimeout(700); await open(); ui = await openUI();
    await ui.locator('#preset-select option').filter({hasText: savedName}).waitFor({state: 'attached'});
    assert.equal(await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).inputValue(), '8.00:1');
    const importFile = async preset => {
        const picker = page.waitForEvent('filechooser'); await ui.getByRole('button', {name: 'Import', exact: true}).click();
        await (await picker).setFiles({name: 'test.scdark.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preset))});
    };
    const imported = {...exported, name: importedName, parameters: {...exported.parameters, downwards_ratio: 0}};
    await importFile(imported); await ui.locator('#preset-select option').filter({hasText: importedName}).waitFor({state: 'attached'});
    assert.equal(await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).inputValue(), '8.00:1', 'Importing must not silently apply a preset');
    await ui.locator('#preset-select').selectOption({label: importedName});
    await ui.waitForFunction(() => document.querySelector('[aria-label="Downwards Ratio exact value"]').value === '1.00:1' && !document.querySelector('#preset-save').disabled);
    await importFile({...exported, version: 999});
    await ui.locator('#status').filter({hasText: 'Unsupported preset format'}).waitFor();
    assert.equal(await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).inputValue(), '1.00:1');
    await ui.getByRole('button', {name: 'Delete', exact: true}).click();
    await ui.locator('#preset-delete-dialog').getByRole('button', {name: 'Cancel', exact: true}).click();
    assert.equal(await ui.locator('#preset-select option').filter({hasText: importedName}).count(), 1);
    for (const name of [importedName, savedName]) {
        await ui.locator('#preset-select').selectOption({label: name});
        await ui.waitForFunction(() => !document.querySelector('#preset-save').disabled);
        await ui.getByRole('button', {name: 'Delete', exact: true}).click();
        await ui.locator('#preset-delete-dialog').getByRole('button', {name: 'Delete preset', exact: true}).click();
        await ui.locator('#preset-select option').filter({hasText: name}).waitFor({state: 'detached'});
    }
    console.log('PASS browser factory preset, user save/reopen, JSON export/import, invalid-file rejection and confirmed deletion');
    await set('Downwards Ratio', '4', '4.00:1');
    await set('Global Threshold', '-30', '-30.0 dB');
    await set('Output Gain', '-6', '-6.00 dB');
    // The graph and point controls are tested in a real adopted/popout iframe, not a mock page.
    await ui.locator('#curve-details summary').click();
    for (const [index, frequency, offset] of [[1, '250', '-12'], [2, '2500', '9']]) {
        for (const [field, text] of [['Frequency', frequency], ['Offset', offset]]) {
            const input = ui.getByRole('textbox', {name: `Curve Point ${index} ${field} exact value`, exact: true});
            await input.fill(text); await input.press('Enter');
        }
        await ui.locator(`#p-curve_point_enabled_${index}`).check();
    }
    await ui.locator('#point-count').filter({hasText: '2 / 8 enabled'}).waitFor();
    assert.equal(await ui.locator('.point-marker:visible').count(), 2);
    assert(await ui.evaluate(() => document.querySelector('#curve-details').compareDocumentPosition(document.querySelector('#controls')) & Node.DOCUMENT_POSITION_FOLLOWING));
    const firstX = await ui.locator('.point-marker').nth(0).evaluate(element => Number.parseFloat(element.style.left));
    const frequency = ui.getByRole('textbox', {name: 'Curve Point 1 Frequency exact value', exact: true});
    await frequency.fill('800'); await frequency.press('Enter');
    await ui.waitForFunction(x => Number.parseFloat(document.querySelector('.point-marker').style.left) > x + 40, firstX);
    await ui.locator('#curve-details summary').click();
    await ui.locator('.point-marker').first().click();
    assert(await ui.locator('#curve-details').evaluate(element => element.open));
    assert.equal(await ui.locator('#points .selected').getAttribute('data-point'), '1');
    const nativePoint = () => ui.evaluate(() => window.latestGraphState.curvePoints[0]);
    const beginDrag = async (dx, dy) => {
        const marker = ui.locator('.point-marker').first(), box = await marker.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2 + dy, {steps: 12});
        await page.waitForTimeout(180);
        return marker;
    };
    const initialPoint = await nativePoint();
    await beginDrag(75, -18); await page.mouse.up();
    await ui.waitForFunction(before => {
        const point = window.latestGraphState.curvePoints[0]; return point.frequency > before.frequency * 1.1 && point.offset > before.offset;
    }, initialPoint);
    const draggedPoint = await nativePoint();
    const waitRestored = () => ui.waitForFunction(expected => {
        const point = window.latestGraphState.curvePoints[0]; return Math.abs(point.frequency - expected.frequency) < .01 && Math.abs(point.offset - expected.offset) < .01;
    }, draggedPoint);
    await beginDrag(-50, 22); await page.keyboard.press('Escape'); await page.mouse.up(); await waitRestored();
    for (const cancel of ['pointercancel', 'lostpointercapture', 'blur']) {
        const marker = await beginDrag(-50, 22);
        assert(Math.abs((await nativePoint()).frequency - draggedPoint.frequency) > 20, 'The drag must change actual plugin parameters before testing cancellation');
        if (cancel === 'blur') await ui.evaluate(() => window.dispatchEvent(new Event('blur')));
        else {
            const pointer = await marker.evaluate(element => {
                for (let id = 1; id < 20; id++) if (element.hasPointerCapture(id)) return id;
            });
            assert(pointer, 'The marker must own pointer capture');
            if (cancel === 'pointercancel') await marker.dispatchEvent('pointercancel', {pointerId: pointer});
            else await marker.evaluate((element, pointer) => element.releasePointerCapture(pointer), pointer);
        }
        await page.mouse.up(); await waitRestored();
    }
    const draggedParams = await ui.evaluate(() => window.latestGraphState.params
        .filter(param => ['curve_point_frequency_1', 'curve_point_offset_1'].includes(param.id)).map(({id, value}) => [id, value]));
    await page.screenshot({path: `${results}/point-drag.png`});
    console.log('PASS graph dragging changes native parameters; Escape, pointer cancellation, capture loss and blur restore them', {initialPoint, draggedPoint});
    const panel = page.locator('div:has(> div.body > iframe[src*="wclap-frame"])');
    const grip = panel.locator(':scope > .grip.corner');
    assert.equal(await grip.count(), 1, 'Resizable WebCLAP must expose resize grips');
    const previous = await ui.evaluate(() => ({width: innerWidth, height: innerHeight, graph: document.querySelector('canvas').clientHeight}));
    const box = await grip.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
    await page.mouse.move(box.x + 200, box.y + 150, {steps: 8}); await page.mouse.up();
    await ui.waitForFunction(({width, height}) => innerWidth > width + 100 && innerHeight > height + 60, previous);
    const [popup] = await Promise.all([page.waitForEvent('popup'),
        panel.locator(':scope > header [data-class=button] label').first().click()]);
    popup.on('pageerror', error => errors.push(error.message));
    await popup.waitForTimeout(1000);
    ui = popup.frames().find(frame => frame.url().endsWith('/gui/index.html'));
    assert(ui, 'Plugin must reconnect in its popout');
    await ui.locator('#p-downwards_ratio').waitFor();
    await popup.setViewportSize({width: 1700, height: 1200});
    await ui.waitForFunction(() => innerWidth >= 1650 && innerHeight >= 1100);
    await ui.locator('#curve-details summary').click();
    const large = await ui.evaluate(() => ({width: innerWidth, height: innerHeight, graph: document.querySelector('canvas').clientHeight,
        points: document.querySelector('#points').getBoundingClientRect().bottom, footer: document.querySelector('footer').getBoundingClientRect().top}));
    assert(large.graph > previous.graph + 50, 'Graph must grow with available space');
    assert(large.points < large.footer, 'Large popout must expose all eight point controls');
    assert.equal(await ui.locator('.point-marker:visible').count(), 2);
    await popup.screenshot({path: `${results}/curve-expanded.png`});
    await popup.setViewportSize({width: 600, height: 600});
    await ui.waitForFunction(() => innerWidth <= 610);
    await ui.locator('[data-point="8"] input[type=checkbox]').scrollIntoViewIfNeeded();
    await ui.locator('[data-point="8"] input[type=checkbox]').check();
    await ui.locator('#point-count').filter({hasText: '3 / 8 enabled'}).waitFor();
    const narrow = await ui.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        height: innerHeight, footer: document.querySelector('footer').getBoundingClientRect().bottom}));
    assert(narrow.scrollWidth <= narrow.width && narrow.footer <= narrow.height);
    await checkPinnedGraph(ui);
    const narrowWidths = await ui.locator('#actions > button').evaluateAll(buttons => buttons.map(button => button.getBoundingClientRect().width));
    assert(Math.abs(narrowWidths[0] - narrowWidths[1]) < 1, 'Stacked listening buttons must also have equal widths');
    await popup.screenshot({path: `${results}/review-narrow.png`});
    await ui.locator('[data-point="8"] input[type=checkbox]').uncheck();
    await popup.locator('div:has(> div.body > iframe[src*="wclap-frame"]) > header [data-class=button] label').first().click();
    await page.waitForTimeout(1000); ui = page.frames().find(frame => frame.url().endsWith('/gui/index.html'));
    await ui.locator('#p-downwards_ratio').waitFor();
    console.log('PASS curve point previews, marker selection, docked resize, large and narrow popout resize and dock-in', {previous, large, narrow});
    const layout = await ui.evaluate(() => ({width: innerWidth, scrollWidth: document.documentElement.scrollWidth,
        height: innerHeight, footer: document.querySelector('footer').getBoundingClientRect().bottom}));
    assert(layout.scrollWidth <= layout.width, 'No horizontal overflow at the default size');
    assert(layout.footer <= layout.height, 'Status and latency must remain visible');
    console.log('UI layout', layout);
    await page.screenshot({path: `${results}/controls.png`});
    await page.getByText('Close UI', {exact: true}).click({force: true});
    await page.keyboard.press('Meta+s'); await page.waitForTimeout(1000);
    await open(); ui = await openUI();
    assert.equal(await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).inputValue(), '4.00:1');
    assert.equal(await ui.getByRole('textbox', {name: 'Global Threshold exact value', exact: true}).inputValue(), '-30.0 dB');
    assert.equal(await ui.getByRole('textbox', {name: 'Output Gain exact value', exact: true}).inputValue(), '-6.00 dB');
    await ui.locator('#point-count').filter({hasText: '2 / 8 enabled'}).waitFor();
    assert.equal(await ui.locator('.point-marker:visible').count(), 2, 'Curve points must survive project save/reopen');
    assert.deepEqual(await ui.evaluate(() => window.latestGraphState.params
        .filter(param => ['curve_point_frequency_1', 'curve_point_offset_1'].includes(param.id)).map(({id, value}) => [id, value])), draggedParams,
        'Graph-dragged parameters must survive save/reopen');
    await ui.locator('#curve-details summary').click();
    for (const index of [1, 2]) await ui.locator(`#p-curve_point_enabled_${index}`).uncheck();
    await page.screenshot({path: `${results}/restored.png`});
    // Closing the frame releases focus from its checkbox before using the Studio shortcut.
    await page.getByText('Close UI', {exact: true}).click({force: true});
    await page.bringToFront();
    await page.locator('.channel-capture label').first().click();
    await page.keyboard.press('Meta+k');
    await page.getByText('MIDI Keyboard', {exact: true}).waitFor();
    ui = await openUI();
    await ui.evaluate(() => {
        window.testAudio = {max: -200, gain: 0, messages: 0, paints: 0};
        const originalClear = CanvasRenderingContext2D.prototype.clearRect;
        CanvasRenderingContext2D.prototype.clearRect = function (...args) { window.testAudio.paints++; return originalClear.apply(this, args); };
        window.addEventListener('message', event => {
            if (!(event.data instanceof ArrayBuffer)) return;
            let data;
            try { data = JSON.parse(new TextDecoder().decode(event.data)); } catch { return; }
            if (data.type !== 'state') return;
            window.testAudio.messages++;
            for (const bin of data.bins) {
                window.testAudio.max = Math.max(window.testAudio.max, bin[1]);
                window.testAudio.gain = Math.min(window.testAudio.gain, bin[2]);
            }
        });
    });
    try { await page.keyboard.down('a'); await page.waitForTimeout(1800); }
    finally { await page.keyboard.up('a'); }
    const signal = await ui.evaluate(() => window.testAudio);
    assert(signal.max > -50 && signal.gain < -0.1, 'Live MIDI audio must reach the compressor and show gain reduction');
    assert(signal.paints > signal.messages * 2, 'Display must animate between the 10 Hz engine snapshots');
    console.log('Browser live note signal', signal);
    await page.screenshot({path: `${results}/audio.png`});
    await page.emulateMedia({reducedMotion: 'reduce'});
    await page.waitForTimeout(150);
    await ui.evaluate(() => { window.testAudio.paints = 0; window.testAudio.messages = 0; });
    try { await page.keyboard.down('a'); await page.waitForTimeout(1000); }
    finally { await page.keyboard.up('a'); }
    const reduced = await ui.evaluate(() => ({paints: window.testAudio.paints, messages: window.testAudio.messages}));
    assert(reduced.messages >= 5 && reduced.paints <= reduced.messages + 3, 'Reduced motion must disable between-snapshot animation');
    console.log('PASS smooth painting between snapshots and reduced-motion fallback', {animated: signal, reduced});
    await page.emulateMedia({reducedMotion: 'no-preference'});
    await page.getByText('Close UI', {exact: true}).click({force: true});
    await page.keyboard.press('Meta+k');
    await page.keyboard.press('Meta+s'); await page.waitForTimeout(500);
    await open(); ui = await openUI();
    await ui.locator('#point-count').filter({hasText: '0 / 8 enabled'}).waitFor();
    assert.equal(await ui.getByRole('textbox', {name: 'Downwards Ratio exact value', exact: true}).inputValue(), '4.00:1');
    await page.getByText('Close UI', {exact: true}).click({force: true});
    assert.equal(errors.length, 0, JSON.stringify(errors));
    console.log('PASS browser import, controls, layout, saved project reopen and live note signal; no page errors');
} catch (error) {
    if (page) { console.error((await page.locator('body').innerText()).slice(-3000)); await page.screenshot({path: `${results}/error.png`}); }
    throw error;
} finally {
    await context?.close();
}
