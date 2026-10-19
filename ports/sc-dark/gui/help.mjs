import {helpFor, guideSections, referenceGroups} from './help-content.mjs';

const element = (tag, text, className) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
};

export function renderTopic(container, data) {
    container.replaceChildren();
    for (const [title, text, className] of [['What it does', data.meaning, ''], ['What to do', data.tryIt, 'help-try'], ['Important', data.caution, 'help-caution']]) {
        if (!text) continue;
        const section = element('section', '', className);
        section.append(element('h3', title), element('p', text)); container.append(section);
    }
}

export function renderGuide(container, openTopic) {
    container.replaceChildren();
    container.append(element('p', 'This guide explains the effect and its controls. Small ? buttons beside processing settings open the same help.', 'help-lead'));
    const directions = element('div', '', 'help-directions');
    for (const [name, text, className] of [['Downward', 'Decreases loud detail.', 'down'], ['Upward', 'Increases quiet detail.', 'up']]) {
        const card = element('div', '', className); card.append(element('strong', name), element('p', text)); directions.append(card);
    }
    container.append(directions);
    const nav = element('nav', '', 'help-contents'); nav.setAttribute('aria-label', 'Guide sections');
    for (const section of guideSections) {
        const link = element('a', section.title); link.href = `#guide-${section.id}`;
        link.onclick = event => { event.preventDefault(); container.querySelector(`#guide-${section.id}`).scrollIntoView({block: 'start'}); };
        nav.append(link);
    }
    container.append(nav);
    for (const data of guideSections) {
        const section = element('section'); section.id = `guide-${data.id}`;
        section.append(element('h3', data.title));
        for (const text of data.paragraphs ?? []) section.append(element('p', text));
        if (data.steps) { const list = element('ol'); for (const step of data.steps) list.append(element('li', step)); section.append(list); }
        if (data.terms) {
            const list = element('dl');
            for (const [word, text] of data.terms) list.append(element('dt', word), element('dd', text));
            section.append(list);
        }
        container.append(section);
    }
    const reference = element('section'); reference.id = 'guide-settings'; reference.append(element('h3', 'Every control, explained'));
    reference.append(element('p', 'Select a control for information. Each numbered point has the same three controls.'));
    for (const [name, ids] of referenceGroups) {
        const group = element('div', '', 'help-reference-group'); group.append(element('h4', name));
        const buttons = element('div', '', 'help-topic-links');
        for (const id of ids) {
            const button = element('button', helpFor(id).title); button.type = 'button';
            button.onclick = () => openTopic(id, button); buttons.append(button);
        }
        group.append(buttons); reference.append(group);
    }
    container.append(reference);
}

export function createHelpUI({beforeOpen = () => {}, guidePage = false} = {}) {
    const dialog = document.querySelector('#help-dialog'), body = document.querySelector('#help-body');
    const title = document.querySelector('#help-title'), back = document.querySelector('#help-back');
    let opener;
    function show(source) {
        if (!dialog.open) {
            beforeOpen(); opener = source ?? document.activeElement; dialog.showModal();
            document.querySelector('#help-close').focus();
        } else title.focus();
        body.scrollTop = 0;
    }
    function open(id, source) {
        const data = helpFor(id) ?? {title: 'Setting help', meaning: 'This version does not include help for this setting.', tryIt: 'Read the beginner guide for general information.', caution: ''};
        title.textContent = data.title; renderTopic(body, data); back.hidden = guidePage;
        show(source);
    }
    function openGuide(source) {
        title.textContent = 'SC Dark: a beginner’s guide'; renderGuide(body, open); back.hidden = true;
        show(source);
    }
    function button(id, label = helpFor(id)?.title ?? id) {
        const node = element('button', '?', 'help-button'); node.type = 'button'; node.dataset.help = id;
        node.setAttribute('aria-label', `Explain ${label}`); node.setAttribute('aria-haspopup', 'dialog');
        node.setAttribute('aria-controls', 'help-dialog'); node.title = `Explain ${label}`;
        node.onclick = event => { event.stopPropagation(); open(id, node); };
        return node;
    }
    document.querySelector('#help-close').onclick = () => dialog.close();
    back.onclick = () => openGuide();
    dialog.addEventListener('close', () => { if (opener?.isConnected) opener.focus({preventScroll: true}); });
    dialog.addEventListener('keydown', event => {
        if (event.key === 'Escape') event.stopPropagation();
        if (event.key !== 'Tab') return;
        // Native dialog focus can leave an embedded frame at its first/last stop.
        const stops = [...dialog.querySelectorAll('button:not([disabled]), a[href]')].filter(node => node.getClientRects().length);
        const first = stops[0], last = stops.at(-1), active = document.activeElement;
        if (event.shiftKey && (active === first || active === title)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && active === last) { event.preventDefault(); first?.focus(); }
    });
    dialog.addEventListener('click', event => {
        const bounds = dialog.getBoundingClientRect();
        if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
    });
    for (const source of document.querySelectorAll('[data-help]')) source.onclick = () => open(source.dataset.help, source);
    document.querySelector('#about')?.addEventListener('click', event => openGuide(event.currentTarget));
    return {open, openGuide, button};
}
