import assert from 'node:assert/strict';
import test from 'node:test';
import {dependencyPackages} from './dependency-notices.mjs';

test('license inventory follows the plugin graph, not unrelated workspace members', () => {
    const metadata = {packages: ['plugin', 'runtime', 'macro', 'unrelated'].map(id => ({id})), resolve: {root: 'plugin', nodes: [
        {id: 'plugin', deps: [{pkg: 'runtime'}, {pkg: 'macro'}]}, {id: 'runtime', deps: [{pkg: 'macro'}]},
        {id: 'macro', deps: []}, {id: 'unrelated', deps: []},
    ]}};
    assert.deepEqual(dependencyPackages(metadata).map(pkg => pkg.id), ['macro', 'plugin', 'runtime']);
});
test('license inventory rejects missing roots and incomplete dependency graphs', () => {
    assert.throws(() => dependencyPackages({packages: [], resolve: {root: null, nodes: []}}), /identify/);
    assert.throws(() => dependencyPackages({packages: [], resolve: {root: 'missing', nodes: []}}), /Missing dependency/);
});
