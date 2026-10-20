// SPDX-License-Identifier: GPL-3.0-or-later
import {copyFileSync, mkdirSync, readdirSync, writeFileSync} from 'node:fs';
import path from 'node:path';

export function dependencyPackages(metadata) {
    const nodes = new Map(metadata.resolve.nodes.map(node => [node.id, node]));
    const visited = new Set();
    function visit(id) {
        if (visited.has(id)) return;
        const node = nodes.get(id);
        if (!node) throw new Error(`Missing dependency node: ${id}`);
        visited.add(id);
        for (const dependency of node.deps) visit(dependency.pkg);
    }
    if (!metadata.resolve.root) throw new Error('Cargo metadata must identify the plugin package');
    visit(metadata.resolve.root);
    return metadata.packages.filter(pkg => visited.has(pkg.id)).sort((a, b) => a.id.localeCompare(b.id));
}

export function writeDependencyNotices(metadata, bundle, port) {
    const inventory = [];
    for (const pkg of dependencyPackages(metadata)) {
        if (!/^[a-zA-Z0-9_.+-]+$/.test(pkg.name + pkg.version)) throw new Error('Unsafe dependency path');
        const source = path.dirname(pkg.manifest_path);
        const destination = path.join(bundle, 'licenses/dependencies', `${pkg.name}-${pkg.version}`);
        mkdirSync(destination, {recursive: true});
        const texts = [];
        for (const entry of readdirSync(source, {withFileTypes: true})) {
            if (entry.isFile() && /^(?:licen[sc]e|copying|notice|unlicense)(?:[._-]|$)/i.test(entry.name)) {
                copyFileSync(path.join(source, entry.name), path.join(destination, entry.name));
                texts.push(entry.name);
            }
        }
        if (pkg.license_file) {
            const filename = path.basename(pkg.license_file);
            copyFileSync(path.resolve(source, pkg.license_file), path.join(destination, filename));
            if (!texts.includes(filename)) texts.push(filename);
        }
        if (!texts.length && ['nih_plug', 'nih_plug_derive'].includes(pkg.name)) {
            copyFileSync(path.join(port, 'licenses/NIH-plug-ISC.txt'), path.join(destination, 'ISC.txt'));
            texts.push('ISC.txt');
        }
        const missingLicenseText = !texts.length;
        if (missingLicenseText && pkg.name === 'realfft' && pkg.version === '3.5.0') {
            // The published crate and its exact upstream revision declare MIT but contain no license file.
            // Preserve that evidence; do not invent a copyright notice or claim a complete license audit.
            for (const file of ['Cargo.toml', 'README.md']) copyFileSync(path.join(source, file), path.join(destination, file));
            console.warn('RealFFT 3.5.0 declares MIT without a license text. Review notices before binary distribution.');
        } else if (missingLicenseText) throw new Error(`No license text found for ${pkg.name} ${pkg.version}`);
        inventory.push({name: pkg.name, version: pkg.version, license: pkg.license, authors: pkg.authors,
            repository: pkg.repository, source: pkg.source, texts: texts.sort(), missingLicenseText});
    }
    writeFileSync(path.join(bundle, 'licenses/dependencies.json'), JSON.stringify(inventory, null, 2));
    return inventory;
}
