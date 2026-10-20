export const FORMAT = 'polarity-sc-dark-preset';
export const STORAGE_KEY = 'polarity.sc-dark.presets.v1';
export const MAX_FILE_BYTES = 32768;
export function validatePreset(preset, params) {
    if (!preset || typeof preset !== 'object' || Array.isArray(preset) || preset.format !== FORMAT || preset.version !== 1) throw new Error('Unsupported preset format or version.');
    if (Object.keys(preset).some(key => !['format', 'version', 'name', 'parameters'].includes(key))) throw new Error('Unexpected preset fields.');
    if (typeof preset.name !== 'string' || !preset.name.trim() || [...preset.name].length > 80 || /[\u0000-\u001f\u007f-\u009f]/u.test(preset.name)) throw new Error('Use a preset name of 1–80 characters.');
    const values = preset.parameters;
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).length !== params.length || params.some(param => !Object.hasOwn(values, param.id))) throw new Error('This preset does not contain all settings for this plugin version.');
    if (Object.values(values).some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1)) throw new Error('Preset values must be numbers from 0 to 1.');
    return {format: FORMAT, version: 1, name: preset.name.trim(), parameters: {...values}};
}
export function readLibrary(storage, params) {
    const text = storage.getItem(STORAGE_KEY);
    if (text === null) return [];
    const library = JSON.parse(text);
    if (!Array.isArray(library) || library.length > 128) throw new Error('Invalid preset library. Export your settings and check browser storage.');
    const ids = new Set();
    return library.map(entry => {
        if (!entry || typeof entry.id !== 'string' || !/^user:[a-zA-Z0-9-]{1,80}$/.test(entry.id) || ids.has(entry.id)) throw new Error('Invalid preset library entry.');
        ids.add(entry.id);
        return {id: entry.id, preset: validatePreset(entry.preset, params)};
    });
}
export function saveLibrary(storage, library) {
    if (library.length > 128) throw new Error('The browser library holds up to 128 presets. Export or delete one first.');
    storage.setItem(STORAGE_KEY, JSON.stringify(library));
}
export function matches(preset, params) {
    return params.every(param => Math.abs(preset.parameters[param.id] - param.value) < 0.00001);
}

export function createPresetUI({send, status}) {
    const select = document.querySelector('#preset-select'), save = document.querySelector('#preset-save');
    const remove = document.querySelector('#preset-delete'), exportButton = document.querySelector('#preset-export');
    const importButton = document.querySelector('#preset-import'), file = document.querySelector('#preset-file');
    const nameDialog = document.querySelector('#preset-name-dialog'), nameInput = document.querySelector('#preset-name');
    const deleteDialog = document.querySelector('#preset-delete-dialog');
    let params = [], factories = [], users = [], started = false, busy = false, menuVersion = '';
    const requests = new Map();
    const request = payload => new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(() => { requests.delete(id); reject(new Error('The audio engine did not answer. Try again when it is running.')); }, 5000);
        requests.set(id, {resolve, reject, timer}); send({...payload, request: id});
    });
    const retry = async payload => {
        const deadline = Date.now() + 5000;
        while (Date.now() < deadline) {
            const reply = await request(payload);
            if (!reply.busy) return reply;
            await new Promise(resolve => setTimeout(resolve, 75));
        }
        throw new Error('Finish the current control edit and try again.');
    };
    const currentEntry = () => [...factories, ...users].find(entry => entry.id === select.value);
    const refresh = () => {
        const previous = select.value;
        const version = JSON.stringify([...factories, ...users].map(entry => [entry.id, entry.preset.name]));
        if (version !== menuVersion) {
            menuVersion = version; select.replaceChildren(new Option('Current settings / edited', ''));
            for (const [name, entries] of [['Factory', factories], ['My presets · this browser', users]]) {
                const group = document.createElement('optgroup'); group.label = name;
                for (const entry of entries) group.append(new Option(entry.preset.name, entry.id));
                select.append(group);
            }
            select.value = previous;
        }
        const candidates = [...factories, ...users];
        const match = candidates.find(entry => entry.id === previous && matches(entry.preset, params)) ?? candidates.find(entry => matches(entry.preset, params));
        if (!busy && document.activeElement !== select) select.value = match?.id ?? '';
        select.disabled = busy || !started; save.disabled = busy || !params.length;
        exportButton.disabled = busy || !params.length; importButton.disabled = busy || !params.length;
        remove.disabled = busy || !select.value.startsWith('user:');
    };
    const action = run => async () => {
        if (busy) return;
        busy = true; refresh();
        try { await run(); } catch (error) { status(error instanceof Error ? error.message : String(error)); }
        finally { busy = false; refresh(); }
    };
    const capture = async name => {
        const reply = await retry({op: 'capture-preset', text: name});
        const preset = validatePreset(reply.preset, params);
        params = params.map(param => ({...param, value: preset.parameters[param.id]}));
        return preset;
    };
    const store = preset => {
        const library = readLibrary(localStorage, params);
        if (library.some(entry => entry.preset.name.toLocaleLowerCase() === preset.name.toLocaleLowerCase())) throw new Error('That preset name already exists. Choose a different name.');
        const entry = {id: `user:${crypto.randomUUID()}`, preset};
        saveLibrary(localStorage, [...library, entry]); users = [...library, entry];
        return entry;
    };
    const askName = () => new Promise(resolve => {
        nameInput.value = '';
        nameDialog.returnValue = 'cancel';
        nameDialog.addEventListener('close', () => resolve(nameDialog.returnValue === 'save' ? nameInput.value.trim() : null), {once: true});
        nameDialog.showModal(); nameInput.focus();
    });
    document.querySelector('#preset-name-cancel').onclick = () => nameDialog.close('cancel');
    select.onchange = () => {
        const entry = currentEntry(); if (!entry) return;
        action(async () => {
            validatePreset(entry.preset, params);
            const reply = await retry({op: 'apply-preset', preset: entry.preset});
            if (!reply.ok) throw new Error(reply.message);
            await capture(entry.preset.name);
            document.querySelector('#match').disabled = false;
            status(`Loaded ${entry.preset.name}. Start at low volume.`);
        })();
    };
    save.onclick = action(async () => {
        const name = await askName(); if (name === null) return;
        if (!name) throw new Error('Enter a preset name.');
        const preset = await capture(name), entry = store(preset);
        refresh(); select.value = entry.id; status(`Saved ${preset.name} in this browser. Export a file for backup.`);
    });
    exportButton.onclick = action(async () => {
        const preset = await capture(currentEntry()?.preset.name ?? 'Custom');
        const url = URL.createObjectURL(new Blob([JSON.stringify(preset, null, 2)], {type: 'application/json'}));
        const link = document.createElement('a'); link.href = url;
        link.download = `${preset.name.replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'SC-Dark'}.scdark.json`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        status('Preset file download requested.');
    });
    importButton.onclick = () => { if (!busy) file.click(); };
    file.onchange = action(async () => {
        const selected = file.files?.[0]; file.value = ''; if (!selected) return;
        if (selected.size > MAX_FILE_BYTES) throw new Error('Preset file is too large (maximum 32 KiB).');
        const preset = validatePreset(JSON.parse(await selected.text()), params);
        store(preset); status(`Imported ${preset.name}. Select it from My presets to load it.`);
    });
    remove.onclick = action(async () => {
        const entry = currentEntry(); if (!entry?.id.startsWith('user:')) return;
        document.querySelector('#preset-delete-name').textContent = entry.preset.name;
        const approved = await new Promise(resolve => {
            deleteDialog.returnValue = 'cancel';
            deleteDialog.addEventListener('close', () => resolve(deleteDialog.returnValue === 'delete'), {once: true});
            deleteDialog.showModal();
        });
        if (!approved) return;
        const library = readLibrary(localStorage, params).filter(item => item.id !== entry.id);
        saveLibrary(localStorage, library); users = library;
        status(`Deleted ${entry.preset.name} from this browser. Current effect settings are unchanged.`);
    });
    window.addEventListener('storage', event => {
        if (event.key !== STORAGE_KEY || !params.length) return;
        try { users = readLibrary(localStorage, params); refresh(); } catch (error) { status(error.message); }
    });
    return {
        receive(message) {
            const waiting = requests.get(message.request);
            if (!waiting) return false;
            clearTimeout(waiting.timer); requests.delete(message.request); waiting.resolve(message); return true;
        },
        updateState(message) {
            params = message.params;
            if (!started) {
                started = true;
                try { users = readLibrary(localStorage, params); } catch (error) { status(`Could not read presets: ${error.message}`); }
                request({op: 'factory-presets'}).then(reply => {
                    factories = reply.presets.map((preset, index) => ({id: `factory:${index}`, preset: validatePreset(preset, params)})); refresh();
                }).catch(error => status(error.message));
            }
            if (!busy) refresh();
        },
    };
}
