/* Sample data for the about: pages.
 *
 * In the real browser the main process pushed each about page's data in over
 * IPC (VERSION_INFORMATION_UPDATED, HISTORY_UPDATED, ...). Our shim never sends
 * those, so the pages render empty. Here we emit the same messages with mock
 * data right after the page mounts, so passwords/history/brave/bookmarks/newtab
 * show realistic content. Poke the data below to taste.
 */
'use strict'

const messages = require('../js/constants/messages')

// mimic a muon shared_memory handle (history & bookmarks receive one)
function handle (obj) {
  return { memory: function () { return obj } }
}

const DAY = 24 * 60 * 60 * 1000
const NOW = 1526923200000 // fixed timestamp (no Date.now in fixtures)

module.exports = function injectAboutSampleData (aboutUrl, ipc) {
  if (!ipc || typeof ipc.emit !== 'function') return
  const e = {} // fake ipc event arg

  switch (aboutUrl) {
    case 'about:brave':
      if (window.braveNostalgia) {
        // BraveNostalgia: what is actually running.
        ipc.emit(messages.VERSION_INFORMATION_UPDATED, e, {
          'Brave UI': '0.27.3 (BraveNostalgia)',
          'Engine': 'Ladybird',
          'User Agent': navigator.userAgent,
          'OS Platform': navigator.platform
        })
        break
      }
      ipc.emit(messages.VERSION_INFORMATION_UPDATED, e, {
        'Brave': '0.27.3',
        'rev': 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
        'Muon': '8.2.10',
        'libchromiumcontent': '67.0.3396.103',
        'V8': '6.7.288.46',
        'Node': '7.9.0',
        'Update Channel': 'dev',
        'OS Platform': 'Microsoft Windows',
        'OS Release': '10.0.19045',
        'OS Architecture': 'x64'
      })
      break

    case 'about:passwords':
      ipc.emit(messages.PASSWORD_DETAILS_UPDATED, e, [
        { signon_realm: 'https://github.com', origin: 'https://github.com', username: 'brave-fan', password: 'hunter2' },
        { signon_realm: 'https://mail.google.com', origin: 'https://mail.google.com', username: 'you@example.com', password: 'correct horse battery staple' },
        { signon_realm: 'https://reddit.com', origin: 'https://reddit.com', username: 'lurker', password: 'p@ssw0rd!' },
        { signon_realm: 'https://news.ycombinator.com', origin: 'https://news.ycombinator.com', username: 'hnreader', password: 'orangesite' }
      ])
      ipc.emit(messages.PASSWORD_SITE_DETAILS_UPDATED, e, [
        { signon_realm: 'https://intranet.local' }
      ])
      break

    case 'about:history':
      ipc.emit(messages.HISTORY_UPDATED, e, handle({
        updatedStamp: NOW,
        entries: [
          { location: 'https://brave.com', title: 'Brave Software', lastAccessedTime: NOW, count: 12 },
          { location: 'https://github.com/brave/browser-laptop', title: 'brave/browser-laptop', lastAccessedTime: NOW - 2 * 60 * 60 * 1000, count: 8 },
          { location: 'https://en.wikipedia.org/wiki/Brave_(web_browser)', title: 'Brave (web browser) - Wikipedia', lastAccessedTime: NOW - 5 * 60 * 60 * 1000, count: 3 },
          { location: 'https://duckduckgo.com', title: 'DuckDuckGo', lastAccessedTime: NOW - DAY, count: 21 },
          { location: 'https://news.ycombinator.com', title: 'Hacker News', lastAccessedTime: NOW - DAY - 3 * 60 * 60 * 1000, count: 15 },
          { location: 'https://example.com', title: 'Example Domain', lastAccessedTime: NOW - 2 * DAY, count: 1 }
        ]
      }))
      break

    case 'about:bookmarks':
      ipc.emit(messages.BOOKMARKS_UPDATED, e, handle({
        bookmarks: {
          'https://brave.com|0|0': { key: 'https://brave.com|0|0', location: 'https://brave.com', title: 'Brave', parentFolderId: 0, partitionNumber: 0 },
          'https://github.com/brave/browser-laptop|0|0': { key: 'https://github.com/brave/browser-laptop|0|0', location: 'https://github.com/brave/browser-laptop', title: 'browser-laptop on GitHub', parentFolderId: 0, partitionNumber: 0 },
          'https://en.wikipedia.org/wiki/Brave_(web_browser)|0|0': { key: 'https://en.wikipedia.org/wiki/Brave_(web_browser)|0|0', location: 'https://en.wikipedia.org/wiki/Brave_(web_browser)', title: 'Brave on Wikipedia', parentFolderId: 0, partitionNumber: 0 },
          'https://duckduckgo.com|0|0': { key: 'https://duckduckgo.com|0|0', location: 'https://duckduckgo.com', title: 'DuckDuckGo', parentFolderId: 0, partitionNumber: 0 }
        },
        bookmarkFolders: {},
        bookmarkOrder: {
          '0': [
            { key: 'https://brave.com|0|0', order: 0, type: 'bookmark' },
            { key: 'https://github.com/brave/browser-laptop|0|0', order: 1, type: 'bookmark' },
            { key: 'https://en.wikipedia.org/wiki/Brave_(web_browser)|0|0', order: 2, type: 'bookmark' },
            { key: 'https://duckduckgo.com|0|0', order: 3, type: 'bookmark' }
          ]
        }
      }))
      break

    case 'about:newtab':
      if (window.braveNostalgia) {
        // BraveNostalgia: no "new Brave has arrived" notice, and no sample sites.
        ipc.emit(messages.NEWTAB_DATA_UPDATED, e, {
          showEmptyPage: false,
          showImages: false,
          torEnabled: window.location.hash === '#tor',
          isObsolete: false,
          newTabDetail: { updatedStamp: Date.now(), gridLayoutSize: 'medium', pinnedTopSites: [], ignoredTopSites: [], sites: [] }
        })
        break
      }
      ipc.emit(messages.NEWTAB_DATA_UPDATED, e, {
        showEmptyPage: false,
        showImages: false,
        torEnabled: false,
        isObsolete: false,
        newTabDetail: {
          updatedStamp: NOW,
          gridLayoutSize: 'medium',
          pinnedTopSites: [],
          ignoredTopSites: [],
          sites: [
            { key: 'https://brave.com|0|0', location: 'https://brave.com', title: 'Brave', favicon: '' },
            { key: 'https://github.com|0|0', location: 'https://github.com', title: 'GitHub', favicon: '' },
            { key: 'https://en.wikipedia.org|0|0', location: 'https://en.wikipedia.org', title: 'Wikipedia', favicon: '' },
            { key: 'https://duckduckgo.com|0|0', location: 'https://duckduckgo.com', title: 'DuckDuckGo', favicon: '' },
            { key: 'https://news.ycombinator.com|0|0', location: 'https://news.ycombinator.com', title: 'Hacker News', favicon: '' },
            { key: 'https://example.com|0|0', location: 'https://example.com', title: 'Example', favicon: '' }
          ]
        }
      })
      break
  }
}
