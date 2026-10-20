import assert from 'node:assert/strict';
import test from 'node:test';
import {SpectrumAnimation} from './gui/spectrum-animation.mjs';
import {baseThreshold, thresholdAt, dragValues} from './gui/point-drag.mjs';
import {curveLayout} from './gui/curve-layout.mjs';

test('spectrum animates between 10 Hz readings without overshoot and eventually sleeps', () => {
    const animation = new SpectrumAnimation();
    animation.update([[440, -90, 0]], 0);
    animation.update([[440, -10, -18]], 100);
    let previous = -90, frames = 0;
    for (let time = 116; time < 1300; time += 16) {
        const moving = animation.step(time); frames++;
        assert(animation.bins[0][1] >= previous && animation.bins[0][1] <= -10);
        previous = animation.bins[0][1];
        if (!moving) break;
    }
    assert(frames > 5 && frames < 70); assert.equal(animation.bins[0][1], -10); assert.equal(animation.bins[0][2], -18);
    assert(!animation.active); assert(!animation.step(2000));
    animation.update([[440, -90, 0]], 2000); animation.step(2016);
    assert(animation.bins[0][1] < -10 && animation.bins[0][1] > -90);
});
test('smoothing follows elapsed time rather than display refresh rate', () => {
    const result = fps => {
        const animation = new SpectrumAnimation(); animation.update([[440, -80, 0]], 0);
        animation.update([[440, -20, -12]], 100);
        for (let frame = 1; frame <= fps / 10; frame++) animation.step(100 + frame * 1000 / fps);
        return animation.bins[0];
    };
    const slow = result(60), fast = result(120);
    assert(Math.abs(slow[1] - fast[1]) < 1e-8); assert(Math.abs(slow[2] - fast[2]) < 1e-8);
});
test('reduced motion snaps, changing FFT grids resets, and empty frames clear stale data', () => {
    const animation = new SpectrumAnimation(); animation.update([[100, -90, 0]], 0);
    animation.update([[100, -20, 12]], 100, true);
    assert.deepEqual(animation.bins, [[100, -20, 12]]); assert(!animation.active);
    animation.update([[200, -60, -6]], 200); assert.deepEqual(animation.bins, [[200, -60, -6]]);
    animation.update([], 300); assert.deepEqual(animation.bins, []); assert(!animation.active);
});
test('curve preview uses logarithmic smoothstep offsets and native duplicate ordering', () => {
    const base = [-30, 1000, -3, .5];
    const points = [{enabled: true, frequency: 100, offset: -12}, {enabled: true, frequency: 10000, offset: 12}];
    assert.equal(thresholdAt(base, [], 1000), -30);
    assert(Math.abs(thresholdAt(base, points, 1000) + 30) < 1e-10);
    assert.equal(thresholdAt(base, points, 30), baseThreshold(base, 30) - 12);
    assert.equal(thresholdAt(base, points, 22000), baseThreshold(base, 22000) + 12);
    assert.equal(thresholdAt(base, [...points, {...points[0], offset: 50}], 100), baseThreshold(base, 100) - 12);
});
test('drag maps log frequency and absolute threshold to native offset with hard limits', () => {
    const base = [-30, 1000, -3, .5], point = {frequency: 1000, offset: 5, threshold: -25};
    const plot = curveLayout(1200, 320), start = {point, plot, base};
    assert.deepEqual(dragValues(start, 0, 0), {frequency: plot.frequencyAt(plot.x(1000)), offset: 5});
    const target = dragValues(start, plot.x(2000) - plot.x(1000), plot.y(-15) - plot.y(-25));
    assert(Math.abs(target.frequency - 2000) < 1e-6);
    assert(Math.abs(baseThreshold(base, target.frequency) + target.offset + 15) <= .05);
    assert.equal(dragValues(start, -100000, 100000).frequency, 30);
    assert(Math.abs(dragValues(start, 100000, -100000).frequency - 22000) < 1e-8);
    assert.equal(dragValues(start, 0, 100000).offset, -60);
    assert.equal(dragValues(start, 0, -100000).offset, 60);
});
