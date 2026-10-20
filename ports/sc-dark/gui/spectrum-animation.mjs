// Display-only smoothing. Audio and FFT settings are never changed by this class.
export class SpectrumAnimation {
    bins = [];
    target = [];
    active = false;
    time = 0;

    update(bins, now, immediate = false) {
        const sameGrid = bins.length === this.bins.length && bins.every((bin, index) => bin[0] === this.bins[index][0]);
        this.target = bins.map(bin => bin.slice(0, 3));
        if (immediate || !sameGrid || !this.bins.length) {
            this.bins = this.target.map(bin => [...bin]); this.active = false; this.time = now;
        } else {
            if (!this.active) this.time = now;
            this.active = this.bins.some((bin, index) => Math.abs(bin[1] - this.target[index][1]) > .025 || Math.abs(bin[2] - this.target[index][2]) > .025);
            if (!this.active) this.bins = this.target.map(bin => [...bin]);
        }
    }

    step(now, immediate = false) {
        const elapsed = Math.max(0, Math.min(100, now - this.time)); this.time = now;
        if (!this.active) return false;
        let moving = false;
        for (let index = 0; index < this.bins.length; index++) {
            for (const channel of [1, 2]) {
                const current = this.bins[index][channel], target = this.target[index][channel];
                const tau = channel === 2 ? 60 : target > current ? 35 : 100;
                const next = immediate ? target : current + (target - current) * -Math.expm1(-elapsed / tau);
                this.bins[index][channel] = Math.abs(next - target) <= .025 ? target : next;
                moving ||= this.bins[index][channel] !== target;
            }
        }
        return this.active = moving;
    }
}
