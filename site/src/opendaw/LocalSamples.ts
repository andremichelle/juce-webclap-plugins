import {panic, Progress, UUID} from "@opendaw/lib-std"
import {AudioData} from "@opendaw/lib-dsp"
import {Sample, SampleMetaData} from "@opendaw/studio-adapters"
import {SampleProvider} from "@opendaw/studio-core"

// The signals an effect plays, held in memory: decoded audio files and the generated test signals. Nothing
// is stored, a sample lives as long as the page uses it.
export namespace LocalSamples {
    const samples = new Map<string, [AudioData, SampleMetaData]>()

    export const fetch: SampleProvider["fetch"] = async (uuid: UUID.Bytes, progress: Progress.Handler) => {
        const entry = samples.get(UUID.toString(uuid))
        progress(1.0)
        return entry ?? panic(`Unknown sample ${UUID.toString(uuid)}`)
    }

    // bpm 0: a seconds-timebase region, played as it is whatever the project tempo
    export const add = (name: string, audioData: AudioData): Sample => {
        const uuid = UUID.toString(UUID.generate())
        const meta: SampleMetaData = {
            name, bpm: 0, duration: audioData.numberOfFrames / audioData.sampleRate,
            sample_rate: audioData.sampleRate, origin: "import"
        }
        samples.set(uuid, [audioData, meta])
        return {uuid, ...meta}
    }

    export const remove = (uuid: string): void => {samples.delete(uuid)}

    export const fromAudioBuffer = (buffer: AudioBuffer): AudioData => {
        const audioData = AudioData.create(buffer.sampleRate, buffer.length, Math.min(2, buffer.numberOfChannels))
        audioData.frames.forEach((frame, channel) => frame.set(buffer.getChannelData(channel)))
        return audioData
    }

    export const noise = (sampleRate: number, seconds: number = 2.0): AudioData =>
        generate(sampleRate, seconds, () => (Math.random() * 2.0 - 1.0) * 0.25)

    // a band-limited sawtooth (eight harmonics) at the given frequency
    export const tone = (sampleRate: number, frequency: number = 220.0, seconds: number = 2.0): AudioData =>
        generate(sampleRate, seconds, (index: number) => {
            const phase = 2.0 * Math.PI * frequency * index / sampleRate
            let sum = 0.0
            for (let harmonic = 1; harmonic <= 8; harmonic++) {sum += Math.sin(phase * harmonic) / harmonic}
            return sum * 0.2
        })

    const generate = (sampleRate: number, seconds: number, sample: (index: number) => number): AudioData => {
        const audioData = AudioData.create(sampleRate, Math.round(sampleRate * seconds), 2)
        const [left, right] = audioData.frames
        for (let i = 0; i < left.length; i++) {left[i] = right[i] = sample(i)}
        return audioData
    }
}
