/* Generate public/index.html (the chrome shell) and public/about-*.html hosts.
 * Run: node harness/buildHtml.js
 */
const fs = require('fs')
const path = require('path')

const publicDir = path.resolve(__dirname, '..', 'public')

// Every localization bundle we shipped in public/locales/en-US. l20n loads each
// and ignores tokens a given page doesn't use, so a superset is fine.
const localeProps = fs.readdirSync(path.join(publicDir, 'locales', 'en-US'))
  .filter(f => f.endsWith('.properties'))
  .map(f => f.replace(/\.properties$/, ''))

const l10nLinks = localeProps
  .map(name => `    <link rel="localization" href="/locales/{locale}/${name}.properties">`)
  .join('\n')

function page (opts) {
  return `<!DOCTYPE html>
<!-- Extracted from Brave (Muon) browser-laptop. Standalone host page. -->
<html>
  <head>
    <meta charset="utf-8">
    <meta name="availableLanguages" content="">
    <meta name="defaultLanguage" content="en-US">
    <meta name="theme-color" content="#ff5000">
    <meta name="referrer" content="no-referrer">
    <link rel="shortcut icon" type="image/x-icon" href="/img/favicon.ico">
    <title>${opts.title}</title>
    <script src="/ext/l20n.min.js"></script>
    <script src="${opts.bundle}" async></script>
${l10nLinks}
  </head>
  <body${opts.bodyStyle ? ` style="${opts.bodyStyle}"` : ''}>
    <div id="appContainer"></div>
  </body>
</html>
`
}

// ---- the chrome shell ----
fs.writeFileSync(path.join(publicDir, 'index.html'), page({
  title: 'Brave (Legacy UI)',
  bundle: '/gen/app.entry.js'
}))

// ---- about:* pages (all served from the single aboutPages bundle) ----
const aboutPages = [
  ['about', 'About Pages'],
  ['adblock', 'Adblock'],
  ['autofill', 'Autofill'],
  ['bookmarks', 'Bookmarks'],
  ['brave', 'About Brave'],
  ['downloads', 'Downloads'],
  ['extensions', 'Extensions'],
  ['history', 'History'],
  ['newtab', 'New Tab'],
  ['passwords', 'Passwords'],
  ['preferences', 'Preferences'],
  ['safebrowsing', 'Safe Browsing'],
  ['styles', 'Style Guide']
]

for (const [name, title] of aboutPages) {
  fs.writeFileSync(path.join(publicDir, `about-${name}.html`), page({
    title: title,
    bundle: '/gen/aboutPages.entry.js',
    bodyStyle: name === 'newtab' ? 'background:#222' : null
  }))
}

// ---- a tiny landing/index of everything, for poking ----
const links = ['<a href="/index.html">index.html &mdash; the classic browser chrome shell</a>']
  .concat(aboutPages.map(([n, t]) => `<a href="/about-${n}.html">about-${n}.html &mdash; ${t}</a>`))
  .map(a => `      <li>${a}</li>`).join('\n')
fs.writeFileSync(path.join(publicDir, 'gallery.html'), `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Brave Legacy UI &mdash; Gallery</title>
<style>
  body{font-family:sans-serif;background:#1a1a1a;color:#ddd;max-width:720px;margin:40px auto;padding:0 20px;line-height:1.7}
  h1{color:#ff5000} a{color:#7aa7ff;text-decoration:none} a:hover{text-decoration:underline}
  ul{list-style:none;padding:0} li{padding:6px 0;border-bottom:1px solid #333}
  .hint{color:#888;font-size:13px}
</style></head>
<body>
  <h1>Brave Legacy UI</h1>
  <p class="hint">The old Brave (Muon) browser interface, extracted to run in a plain browser. Poke around:</p>
  <ul>
${links}
  </ul>
</body></html>
`)

console.log('Wrote index.html, gallery.html, and ' + aboutPages.length + ' about-*.html pages to public/')
