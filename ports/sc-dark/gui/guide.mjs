import {createHelpUI, renderGuide} from './help.mjs';
const help = createHelpUI({guidePage: true});
renderGuide(document.querySelector('#guide'), help.open);
