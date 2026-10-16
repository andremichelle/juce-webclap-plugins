// SPDX-License-Identifier: GPL-3.0-or-later
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {writeDependencyNotices} from './dependency-notices.mjs';

const port = fileURLToPath(new URL('.', import.meta.url));
const root = path.resolve(port, '../..');
const build = path.join(root, 'build/sc-dark');
const upstream = JSON.parse(readFileSync(path.join(port, 'upstream.json'), 'utf8'));
const args = new Set(process.argv.slice(2));
for (const arg of args) if (!['--test', '--prepare-only'].includes(arg)) throw new Error(`Unknown option: ${arg}`);
const run = (command, args, options = {}) => {
    const result = spawnSync(command, args, {cwd: root, stdio: 'inherit', ...options});
    if (result.error || result.status !== 0) throw result.error ?? new Error(`${command} exited ${result.status}`);
    return result;
};
const capture = (command, args, options = {}) => run(command, args, {
    encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], maxBuffer: 64 * 1024 * 1024, ...options,
}).stdout;
function files(directory, prefix = '') {
    return readdirSync(directory, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name)).flatMap(entry => {
        if (entry.name === '.DS_Store') return [];
        const relative = path.join(prefix, entry.name);
        return entry.isDirectory() ? files(path.join(directory, entry.name), relative) : [relative];
    });
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');

// Keep the download cache pristine. Each patch/overlay revision gets a separate build source tree.
const cache = path.join(root, 'external/sc-dark');
const bundledSource = path.join(root, `sources/sc-dark-${upstream.revision}`);
if (!existsSync(bundledSource) && !existsSync(cache)) {
    mkdirSync(path.dirname(cache), {recursive: true});
    run('git', ['clone', '--no-checkout', upstream.repository, cache]);
}
if (!existsSync(bundledSource)) {
    const remote = capture('git', ['-C', cache, 'remote', 'get-url', 'origin']).trim();
    if (remote !== upstream.repository) throw new Error(`Unexpected upstream cache remote: ${remote}`);
    const hasCommit = spawnSync('git', ['-C', cache, 'cat-file', '-e', `${upstream.revision}^{commit}`]);
    if (hasCommit.status !== 0) run('git', ['-C', cache, 'fetch', 'origin', upstream.revision]);
}
function extractUpstream(destination) {
    if (existsSync(bundledSource)) cpSync(bundledSource, destination, {recursive: true});
    else {
        const archive = capture('git', ['-C', cache, 'archive', upstream.revision], {encoding: null});
        run('tar', ['-xf', '-', '-C', destination], {input: archive, stdio: ['pipe', 'inherit', 'inherit']});
    }
}
const patch = path.join(root, 'patches/sc-dark-webclap.patch');
const overlay = path.join(port, 'overlay');
const inputs = ['prepare-v2', upstream.revision, readFileSync(patch), ...files(overlay).flatMap(file => [file, readFileSync(path.join(overlay, file))])];
const identity = createHash('sha256');
for (const input of inputs) { identity.update(input); identity.update('\0'); }
const source = path.join(build, `source-${identity.digest('hex').slice(0, 16)}`);
const manifest = `${source}.json`;
mkdirSync(build, {recursive: true});
if (!existsSync(source)) {
    mkdirSync(source);
    extractUpstream(source);
    // Do not let git apply discover the parent port repository and silently skip these paths.
    const patchOptions = {cwd: source, env: {...process.env, GIT_CEILING_DIRECTORIES: path.dirname(source)}};
    run('git', ['apply', '--check', patch], patchOptions);
    run('git', ['apply', patch], patchOptions);
    cpSync(overlay, source, {recursive: true, filter: file => path.basename(file) !== '.DS_Store'});
    writeFileSync(manifest, JSON.stringify(Object.fromEntries(files(source).map(file => [file, sha256(readFileSync(path.join(source, file)))])), null, 2));
} else {
    if (!existsSync(manifest)) throw new Error(`Incomplete source directory: ${source}. Move it aside before retrying.`);
    const expected = JSON.parse(readFileSync(manifest, 'utf8'));
    const actual = Object.fromEntries(files(source).map(file => [file, sha256(readFileSync(path.join(source, file)))]));
    if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error(`Build sources changed: ${source}. Move them aside before retrying.`);
}
console.log(`Pinned source: ${source}`);
const cargoOptions = {cwd: source, env: {...process.env, CARGO_TARGET_DIR: path.join(build, 'cargo-target')}};
if (args.has('--test')) {
    run('cargo', ['test', '--locked', '-p', 'polarity_sc_dark', '--lib', '--no-default-features', '--features', 'webclap'], cargoOptions);
    run('node', ['--test', ...files(port).filter(file => !file.includes(path.sep) && file.endsWith('.test.mjs')).map(file => path.join(port, file))]);
}
if (!args.has('--prepare-only')) {
    run('cargo', ['rustc', '--locked', '-p', 'polarity_sc_dark', '--lib', '--release', '--no-default-features', '--features', 'webclap', '--target', 'wasm32-wasip1', '--',
        '-C', 'link-arg=--export-table', '-C', 'link-arg=--growable-table', '-C', 'link-arg=--export=clap_entry', '-C', 'link-arg=--export=malloc'], cargoOptions);
    const bundle = path.join(build, 'web/polarity-sc-dark.wclap');
    mkdirSync(bundle, {recursive: true});
    copyFileSync(path.join(build, 'cargo-target/wasm32-wasip1/release/polarity_sc_dark.wasm'), path.join(bundle, 'module.wasm'));
    // Reject stale assets rather than silently shipping files from an earlier build.
    if (existsSync(path.join(bundle, 'gui'))) {
        const expected = new Set(files(path.join(port, 'gui')));
        for (const file of files(path.join(bundle, 'gui'))) if (!expected.has(file)) throw new Error(`Stale GUI asset: ${file}. Move the bundle aside.`);
    }
    cpSync(path.join(port, 'gui'), path.join(bundle, 'gui'), {recursive: true, filter: file => path.basename(file) !== '.DS_Store'});
    for (const file of ['LICENSE', 'README.md', 'DEVELOPMENT.md', 'WRITING.md']) copyFileSync(path.join(port, file), path.join(bundle, file));
    mkdirSync(path.join(bundle, 'licenses'), {recursive: true});
    copyFileSync(path.join(port, 'licenses/NIH-plug-ISC.txt'), path.join(bundle, 'licenses/NIH-plug-ISC.txt'));
    const metadata = JSON.parse(capture('cargo', ['metadata', '--locked', '--format-version', '1', '--filter-platform', 'wasm32-wasip1',
        '--manifest-path', 'plugin/Cargo.toml', '--no-default-features', '--features', 'webclap'], cargoOptions));
    const dependencies = writeDependencyNotices(metadata, bundle, port);
    console.log(`License inventory: ${dependencies.length} packages, including build/test dependencies`);
    const sysroot = capture('rustc', ['--print', 'sysroot']).trim();
    const rustDocs = path.join(sysroot, 'share/doc/rust');
    if (existsSync(path.join(rustDocs, 'COPYRIGHT-library.html'))) {
        copyFileSync(path.join(rustDocs, 'COPYRIGHT-library.html'), path.join(bundle, 'licenses/Rust-library.html'));
        cpSync(path.join(rustDocs, 'licenses'), path.join(bundle, 'licenses/rust'), {recursive: true});
    } else throw new Error('Install the rust-docs component to include the Rust library notices.');
    const hasGit = existsSync(path.join(root, '.git'));
    const archived = hasGit ? null : JSON.parse(readFileSync(path.join(root, 'source-build.json'), 'utf8'));
    const revision = hasGit ? capture('git', ['rev-parse', 'HEAD']).trim() : archived.portRevision;
    const dirty = hasGit ? capture('git', ['status', '--porcelain']).trim().length > 0 : archived.dirty;
    const remote = hasGit ? capture('git', ['remote', 'get-url', 'origin']).trim().replace(/^git@github.com:/, 'https://github.com/').replace(/\.git$/, '') : archived.repository;
    const sourceURL = `${remote}/tree/${revision}`;
    const notices = readFileSync(path.join(port, 'NOTICES.md.in'), 'utf8')
        .replaceAll('@SOURCE_URL@', sourceURL + (dirty ? ' (plus local changes; not a release build)' : ''));
    writeFileSync(path.join(bundle, 'NOTICES.md'), notices);
    writeFileSync(path.join(bundle, 'memory.json'), JSON.stringify({recommendedInitialBytes: 64 * 1024 * 1024}));
    writeFileSync(path.join(bundle, 'source.json'), JSON.stringify({original: upstream.repository, upstreamRevision: upstream.revision,
        portSource: sourceURL, portRevision: revision, dirty, version: `${upstream.version}-webclap-preview`, modified: true,
        license: 'GPL-3.0-or-later', sourceArchive: 'polarity-sc-dark-webclap-source.tar.gz'}, null, 2));
    const module = await WebAssembly.compile(readFileSync(path.join(bundle, 'module.wasm')));
    const exports = WebAssembly.Module.exports(module).map(entry => entry.name);
    for (const name of ['memory', '__indirect_function_table', 'clap_entry', 'malloc']) if (!exports.includes(name)) throw new Error(`Missing export: ${name}`);
    run('python3', [path.join(root, 'scripts/pack-wclap.py'), bundle, path.join(build, 'polarity-sc-dark.wclap.tar.gz')]);
    // Include the pinned upstream tree and this port's complete build recipe, not local browser data or binaries.
    const recipe = hasGit ? capture('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(file => file && !file.split('/').includes('.DS_Store'))
        : files(root).filter(file => !['build', 'external', 'sources', '.git'].includes(file.split(path.sep)[0]));
    const stage = mkdtempSync(path.join(build, 'source-archive-'));
    const stageRoot = path.join(stage, 'juce-webclap-plugins');
    for (const file of recipe) {
        mkdirSync(path.dirname(path.join(stageRoot, file)), {recursive: true});
        copyFileSync(path.join(root, file), path.join(stageRoot, file));
    }
    const pristine = path.join(stageRoot, `sources/sc-dark-${upstream.revision}`);
    mkdirSync(pristine, {recursive: true});
    extractUpstream(pristine);
    writeFileSync(path.join(stageRoot, 'source-build.json'), JSON.stringify({repository: remote, portRevision: revision, dirty}, null, 2));
    run('tar', ['-czf', path.join(build, 'polarity-sc-dark-webclap-source.tar.gz'), '-C', stage, 'juce-webclap-plugins'], {
        env: {...process.env, COPYFILE_DISABLE: '1'},
    });
    console.log(`Import: ${path.join(build, 'polarity-sc-dark.wclap.tar.gz')}`);
    console.log(`Source: ${path.join(build, 'polarity-sc-dark-webclap-source.tar.gz')}`);
}
