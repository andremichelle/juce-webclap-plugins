// The ported plugins. Each gets a page at /<id>. The bundles are the ones openDAW hosts (assets.opendaw.studio,
// by their uuid in its index); in dev, ?local loads the archive the build script left in build/ instead.
// No DOM here: vite.config.ts reads this list too.

export type PluginKind = "instrument" | "audio-fx"

export type PluginEntry = {
    id: string
    name: string
    kind: PluginKind
    description: string
    uuid: string // the hosted bundle (https://assets.opendaw.studio/wclaps/<uuid>.wclap)
    clapId: string // the plugin inside the bundle
    archive: string // the local build of the bundle, relative to the repository root
    build: string // the script that builds it
    credit: string // the original plugin
    source: string // this port
    license: string
}

const port = (name: string) => `https://github.com/andremichelle/open-webclap/tree/main/ports/${name}`

export const Plugins: ReadonlyArray<PluginEntry> = [
    {
        id: "obxf", name: "OB-Xf", kind: "instrument",
        description: "Virtual analog synth after the Oberheim OB-X, the continuation of OB-Xd",
        uuid: "74309023-461a-4633-8f54-39727eb8c260", clapId: "org.surge-synth-team.OB-Xf",
        archive: "build/obxf/obxf.wclap.tar.gz", build: "scripts/build-obxf.sh",
        credit: "https://github.com/surge-synthesizer/OB-Xf", source: port("obxf"), license: "GPL-3.0-or-later"
    },
    {
        id: "six-sines", name: "Six Sines", kind: "instrument",
        description: "Small phase-modulation synth: six sine-based operators in a modulation matrix",
        uuid: "e7842a1c-085a-4956-8de7-d980ef2c1f76", clapId: "org.baconpaul.six-sines",
        archive: "build/six-sines/six-sines.wclap.tar.gz", build: "scripts/build-six-sines.sh",
        credit: "https://github.com/baconpaul/six-sines", source: port("six-sines"), license: "MIT (GPL-3.0 as built)"
    },
    {
        id: "ripplerx", name: "RipplerX", kind: "instrument",
        description: "Physically modeled percussion synth: mallet and noise exciters into coupled resonators",
        uuid: "453e6622-9d92-478c-a8f1-fe8781d33f33", clapId: "com.tilr.ripplerx",
        archive: "build/ripplerx/ripplerx.wclap.tar.gz", build: "scripts/build-ripplerx.sh",
        credit: "https://github.com/tiagolr/ripplerx", source: port("ripplerx"), license: "GPL-3.0"
    },
    {
        id: "odin2", name: "Odin 2", kind: "instrument",
        description: "Polyphonic semi-modular synth: three oscillators, two filters, modulation matrix, effects",
        uuid: "8ad17bd5-edd6-499f-b601-af1a9cc4bbe2", clapId: "com.thewavewarden.odin2",
        archive: "build/odin2/odin2.wclap.tar.gz", build: "scripts/build-odin2.sh",
        credit: "https://github.com/TheWaveWarden/odin2", source: port("odin2"), license: "GPL-3.0-or-later"
    },
    {
        id: "surge-xt", name: "Surge XT", kind: "instrument",
        description: "Hybrid synth: many oscillator, filter and effect types, deep modulation",
        uuid: "81d25736-9a34-4119-bdd2-a234e58fe362", clapId: "org.surge-synth-team.surge-xt",
        archive: "build/surge-xt/surge-xt.wclap.tar.gz", build: "scripts/build-surge-xt.sh",
        credit: "https://github.com/surge-synthesizer/surge", source: port("surge-xt"), license: "GPL-3.0-or-later"
    },
    {
        id: "coopiano", name: "coopiano", kind: "instrument",
        description: "Physically modelled piano: hammer, strings, soundboard, sympathetic resonance and room, no samples",
        uuid: "bf482395-174e-40e4-86c0-cc4e6fbea568", clapId: "com.peterc.coopiano",
        archive: "build/coopiano/coopiano.wclap.tar.gz", build: "scripts/build-coopiano.sh",
        credit: "https://github.com/peterc/coopiano", source: port("coopiano"), license: "MIT"
    },
    {
        id: "sc-dark", name: "Polarity SC Dark", kind: "audio-fx",
        description: "Spectral compressor with upward and downward compression",
        uuid: "728df9f2-0d68-4029-9ec8-1e1efa34083b", clapId: "de.polarity-music.polarity-sc-dark",
        archive: "build/sc-dark/polarity-sc-dark.wclap.tar.gz", build: "scripts/build-sc-dark.sh",
        credit: "https://github.com/polarity/plugin.nih.polarity-sc-dark", source: port("sc-dark"),
        license: "GPL-3.0-or-later"
    }
]
