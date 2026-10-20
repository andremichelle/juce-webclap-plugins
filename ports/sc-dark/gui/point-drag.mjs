// GPL-3.0-or-later. Visual preview follows plugin/src/curve.rs, by the original SC Dark authors.
// Parameter conversion and audio processing still use the Rust implementation.
export function baseThreshold(base, frequency) {
    const [intercept, center, slope, curve] = base, x = Math.log(frequency) - Math.log(center);
    return intercept + slope * x + curve * x * x;
}

export function thresholdAt(base, points, frequency) {
    let left, right;
    for (const point of points) {
        if (!point.enabled) continue;
        if (point.frequency <= frequency && (!left || point.frequency > left.frequency)) left = point;
        if (point.frequency >= frequency && (!right || point.frequency < right.frequency)) right = point;
    }
    let offset = (left ?? right)?.offset ?? 0;
    if (left && right && right.frequency !== left.frequency) {
        const t = (Math.log(frequency) - Math.log(left.frequency)) / (Math.log(right.frequency) - Math.log(left.frequency));
        offset = left.offset + (right.offset - left.offset) * t * t * (3 - 2 * t);
    }
    return baseThreshold(base, frequency) + offset;
}

export function dragValues(start, dx, dy) {
    const frequency = start.plot.frequencyAt(start.plot.x(start.point.frequency) + dx);
    const delta = start.plot.dbAt(start.plot.y(start.point.threshold) + dy) - start.point.threshold;
    const offset = Math.max(-60, Math.min(60, start.point.offset + delta
        + baseThreshold(start.base, start.point.frequency) - baseThreshold(start.base, frequency)));
    return {frequency, offset: Math.round(offset * 10) / 10};
}

export class PointDragging {
    drag;
    preview;
    constructor({send, getState, getPlot, invalidate, select}) {
        Object.assign(this, {send, getState, getPlot, invalidate, select});
        window.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.drag) { event.preventDefault(); event.stopPropagation(); this.finish(true); }
        }, true);
        window.addEventListener('blur', () => this.finish(true));
        window.addEventListener('pagehide', () => this.finish(true));
        window.addEventListener('resize', () => this.finish(true));
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.finish(true); });
    }

    bind(marker, index) {
        let suppressClick = false;
        marker.addEventListener('pointerdown', event => {
            if (event.button !== 0 || this.drag || this.preview) return;
            const state = this.getState(), point = state?.curvePoints.find(point => point.index === index);
            if (!point?.enabled || !state.curveBase) return;
            suppressClick = false;
            const ids = [`curve_point_frequency_${index}`, `curve_point_offset_${index}`];
            this.drag = {marker, pointer: event.pointerId, index, point: {...point}, base: [...state.curveBase],
                plot: this.getPlot(), x: event.clientX, y: event.clientY, ids,
                original: ids.map(id => state.params.find(param => param.id === id).value), moved: false, dirty: false};
            marker.setPointerCapture(event.pointerId); marker.classList.add('dragging'); this.select(index);
        });
        marker.addEventListener('pointermove', event => {
            const drag = this.drag;
            if (!drag || drag.marker !== marker || event.pointerId !== drag.pointer) return;
            const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
            if (!drag.moved && Math.hypot(dx, dy) < 3) return;
            event.preventDefault();
            if (!drag.moved) { drag.moved = true; drag.ids.forEach(id => this.send({op: 'begin', id})); }
            suppressClick = true;
            this.preview = {index, ...dragValues(drag, dx, dy), base: drag.base};
            drag.dirty = true; this.invalidate();
        });
        marker.addEventListener('pointerup', event => { if (this.drag?.pointer === event.pointerId) this.finish(false); });
        for (const type of ['pointercancel', 'lostpointercapture']) marker.addEventListener(type, event => {
            if (this.drag?.pointer === event.pointerId) this.finish(true);
        });
        // Preserve click-to-edit and keyboard activation, but do not scroll after a drag.
        marker.addEventListener('click', event => {
            if (suppressClick && event.detail > 0) { event.preventDefault(); event.stopImmediatePropagation(); suppressClick = false; }
        });
    }

    flush() {
        if (!this.drag?.dirty || !this.preview) return;
        this.drag.dirty = false;
        this.send({op: 'point-set', point: this.preview.index, frequency: this.preview.frequency, offset: this.preview.offset});
    }

    finish(cancel) {
        const drag = this.drag;
        if (!drag) return;
        if (drag.moved) {
            if (cancel) {
                drag.ids.forEach((id, index) => this.send({op: 'set', id, value: drag.original[index]}));
                this.preview = {index: drag.index, frequency: drag.point.frequency, offset: drag.point.offset, base: drag.base};
            } else this.flush();
            drag.ids.forEach(id => this.send({op: 'end', id}));
            this.preview.expires = performance.now() + 1500;
        }
        this.drag = undefined;
        drag.marker.classList.remove('dragging');
        if (drag.marker.hasPointerCapture(drag.pointer)) drag.marker.releasePointerCapture(drag.pointer);
        this.invalidate();
    }

    reconcile(state, now) {
        if (this.drag || !this.preview) return;
        const point = state.curvePoints.find(point => point.index === this.preview.index);
        if (!point?.enabled || now > this.preview.expires || (!state.pendingParameters
            && Math.abs(point.frequency - this.preview.frequency) < Math.max(.1, point.frequency * 1e-5)
            && Math.abs(point.offset - this.preview.offset) < .06)) this.preview = undefined;
    }

    display(state) {
        if (!this.preview || !state) return state;
        const {index, frequency, offset, base} = this.preview;
        const points = state.curvePoints.map(point => point.index === index ? {...point, frequency, offset} : {...point});
        for (const point of points) point.threshold = thresholdAt(base, points, point.frequency);
        return {...state, curvePoints: points, thresholds: state.thresholds.map(([frequency]) => [frequency, thresholdAt(base, points, frequency)])};
    }
}
