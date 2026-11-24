const ReactDOM = require('react-dom')
const {getSourceAboutUrl, getBaseUrl} = require('../lib/appUrlUtil')
const {ABOUT_COMPONENT_INITIALIZED} = require('../constants/messages')
const ipc = window.chrome.ipcRenderer

let getElementOp

ipc.on('language', (e, detail) => {
  if (document.l10n) {
    document.l10n.requestLanguages([detail.langCode])
    document.getElementsByName('availableLanguages')[0].content = detail.languageCodes.join(', ')
  } else {
    console.error('Missing document.l10n object.')
  }
})
ipc.send('request-language')

// STANDALONE EXTRACTION NOTE: pages are served as http://.../about-<name>.html
// rather than Muon's chrome-extension:// target URLs, so derive the about: page
// from the filename here (falling back to the original resolver).
const __basename = window.location.pathname.split('/').pop().replace(/\.html$/, '')
// BraveNostalgia: inside Ladybird the page is loaded as about:<name> itself.
const __aboutUrl = window.location.protocol === 'about:'
  ? 'about:' + window.location.pathname
  : __basename && __basename.indexOf('about-') === 0
  ? 'about:' + __basename.slice('about-'.length)
  : getBaseUrl(getSourceAboutUrl(window.location.href))

switch (__aboutUrl) {
  case 'about:about':
    getElementOp = import('./about')
    break
  case 'about:adblock':
    getElementOp = import('./adblock')
    break
  case 'about:autofill':
    getElementOp = import('./autofill')
    break
  case 'about:brave':
    getElementOp = import('./brave')
    break
  case 'about:bookmarks':
    getElementOp = import('../../app/renderer/about/bookmarks/bookmarks')
    break
  case 'about:printkeys':
    getElementOp = import('../../app/renderer/about/ledger/printKeys')
    break
  case 'about:certerror':
    getElementOp = import('./certerror')
    break
  case 'about:downloads':
    getElementOp = import('./downloads')
    break
  case 'about:error':
    getElementOp = import('./errorPage')
    break
  case 'about:extensions':
    getElementOp = import('./extensions')
    break
  case 'about:history':
    getElementOp = import('./history')
    break
  case 'about:newtab':
    getElementOp = import('./newtab').then(module => module.AboutNewTab)
    break
  case 'about:passwords':
    getElementOp = import('./passwords')
    break
  case 'about:preferences':
    getElementOp = import('./preferences').then(module => module.AboutPreferences)
    break
  case 'about:safebrowsing':
    getElementOp = import('./safebrowsing')
    break
  case 'about:styles':
    getElementOp = import('./styles')
    break
  case 'about:contributions':
    getElementOp = import('./contributionStatement')
    break
  case 'about:welcome':
    getElementOp = import('../../app/renderer/about/welcome')
    break
}

// BraveNostalgia: in Ladybird, pages with a Ladybird counterpart get real data.
const __ladybirdData = window.braveNostalgia ? require('../../harness/ladybird/aboutData') : null
const __realData = !!__ladybirdData && __ladybirdData.install(__aboutUrl, ipc)

if (getElementOp) {
  getElementOp.then(element => {
    const component = ReactDOM.render(element, document.querySelector('#appContainer'))
    ipc.on('state-updated', (e, detail) => {
      if (detail) {
        component.setState(detail)
      }
    })
    ipc.send(ABOUT_COMPONENT_INITIALIZED)
    // STANDALONE EXTRACTION: the main process normally pushes each about page's
    // data over IPC. Emit sample data locally so pages aren't empty.
    if (__realData) {
      __ladybirdData.mounted()
      return
    }
    try {
      require('../../harness/aboutSampleData')(__aboutUrl, ipc)
    } catch (err) {
      console.error('sample data injection failed', err)
    }
  })
}
