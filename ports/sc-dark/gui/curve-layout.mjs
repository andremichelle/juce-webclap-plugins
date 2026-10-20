// Display geometry only. The Rust engine supplies the original threshold curve.
export function curveLayout(width, height, thresholds = [], offsets = [0, 0]) {
    const left = 42, right = Math.max(left + 1, width - 18), top = 20, bottom = Math.max(top + 40, height - 24);
    const split = top + (bottom - top) * .76;
    let low = -96, high = 12;
    for (const [, db] of thresholds) {
        if (!Number.isFinite(db)) continue;
        low = Math.min(low, db, ...offsets.map(offset => db + offset));
        high = Math.max(high, db, ...offsets.map(offset => db + offset));
    }
    const step = Math.max(12, Math.ceil((high - low) / 6 / 12) * 12);
    const min = Math.floor(low / step) * step, max = Math.ceil(high / step) * step;
    const ticks = [];
    for (let db = min; db <= max; db += step) ticks.push(db);
    return {left, right, top, bottom, split, min, max, ticks,
        x: frequency => left + Math.log(Math.max(30, Math.min(22000, frequency)) / 30) / Math.log(22000 / 30) * (right - left),
        frequencyAt: px => 30 * (22000 / 30) ** Math.max(0, Math.min(1, (px - left) / (right - left))),
        y: db => split - (Math.max(min, Math.min(max, db)) - min) / (max - min) * (split - top),
        // Deliberately allow extrapolation while dragging beyond the plot, then clamp the parameter.
        dbAt: py => min + (split - py) / (split - top) * (max - min),
        gainY: db => (split + bottom) * .5 - Math.max(-24, Math.min(24, db)) / 48 * (bottom - split - 8)};
}
