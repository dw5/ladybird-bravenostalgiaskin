/* Boot for Brave's about: pages (about:brave, about:preferences, ...) inside Ladybird.
 * Ladybird serves each one as about:<name> from resource://ladybird/about-pages/<name>.html;
 * js/about/entry.js picks the page from the URL and shows it with the harness sample data. */
window.braveNostalgia = true
// New Private Tab (with Tor) opens about:newtab#private (#tor): show Brave's private new tab page, for looks only.
if (window.location.hash === '#private' || window.location.hash === '#tor') {
  window.chrome = window.chrome || {}
  window.chrome.extension = Object.assign({}, window.chrome.extension, { inIncognitoContext: true })
}
require('./l10n').start()
require('../../js/about/entry')
