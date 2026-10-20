import assert from 'node:assert/strict';
import test from 'node:test';
import {curveLayout} from './gui/curve-layout.mjs';

test('log frequency axis maps endpoints and geometric middle at different sizes', () => {
    for (const [width, height] of [[500, 180], [1200, 420], [1800, 360]]) {
        const plot = curveLayout(width, height);
        assert.equal(plot.x(30), plot.left); assert.equal(plot.x(22000), plot.right);
        assert(Math.abs(plot.x(Math.sqrt(30 * 22000)) - (plot.left + plot.right) / 2) < 1e-9);
        assert.equal(plot.x(1), plot.left); assert.equal(plot.x(96000), plot.right);
        assert.equal(plot.y(plot.min), plot.split); assert.equal(plot.y(plot.max), plot.top);
    }
});
test('scale includes base curve and both compression offsets without clipping points', () => {
    const plot = curveLayout(1200, 300, [[30, -120], [1000, -35], [22000, 80]], [-20, 40]);
    assert(plot.min <= -140); assert(plot.max >= 120);
    for (const db of [-140, -120, -35, 80, 120]) assert(plot.y(db) >= plot.top && plot.y(db) <= plot.split);
    assert(plot.ticks.length >= 4 && plot.ticks.length <= 10);
    assert(plot.gainY(-24) > plot.gainY(0) && plot.gainY(0) > plot.gainY(24));
});
test('empty and non-finite curve data keep a usable finite scale', () => {
    for (const thresholds of [[], [[100, NaN], [200, Infinity]]]) {
        const plot = curveLayout(560, 180, thresholds);
        assert(plot.max > plot.min); assert(Number.isFinite(plot.y(-30)));
        assert(plot.ticks.every(Number.isFinite));
    }
});
