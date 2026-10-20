// SPDX-License-Identifier: GPL-3.0-or-later
const escape = text => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');

export function licensePage({license, frameworkLicense, notices, sourceURL}) {
    const source = new URL(sourceURL);
    if (source.protocol !== 'https:') throw new Error('The source link must use HTTPS');
    return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SC Dark · License and credits</title><link rel="stylesheet" href="./style.css"></head>
<body class="guide-page">
<header><div><p class="help-eyebrow">SC Dark · WebCLAP version</p><h1>License and credits</h1>
<p>Original audio processing by Robbert van der Helm and Robert Polarity Agthe.</p></div></header>
<main class="help-prose">
<p>This browser port uses GPL-3.0-or-later. It is not an official Polarity release.</p>
<p><a href="${escape(source.href)}" target="_blank" rel="noopener">Source code and build instructions</a></p>
<h2>Port and component notices</h2><pre class="license-text">${escape(notices)}</pre>
<h2>GNU General Public License, version 3</h2><pre class="license-text">${escape(license)}</pre>
<h2>NIH-plug · ISC License</h2><pre class="license-text">${escape(frameworkLicense)}</pre>
</main><footer>The license text is bundled with the plugin. You can read it without an internet connection.</footer>
</body></html>
`;
}
