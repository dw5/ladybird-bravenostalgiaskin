/* Mock global AppStore state for the standalone chrome shell.
 *
 * This is the "poke here" file: it mirrors the schema documented in
 * browser-laptop/docs/state.md. Missing settings fall back to appConfig
 * defaults (js/settings.getSetting), so you only need to specify what you
 * want to differ from defaults. Tabs here pair up with the frames in
 * windowState.js by tabId.
 */

const WINDOW_ID = 1

module.exports = {
  firstRunTimestamp: 1500000000000,
  defaultBrowserCheckComplete: true,
  windowReady: true,
  // when Brave was flagged deprecated (drives the obsoletion banner in main.js)
  deprecatedOn: 1526923200000,

  settings: {
    'bookmarks.toolbar.show': true,
    'general.bookmarks-toolbar-mode': true,
    'general.show-home-button': true,
    'tabs.paint-tabs': true,
    'payments.enabled': false
  },

  siteSettings: {},
  temporarySiteSettings: {},

  // One entry per open tab; tabId links to a frame in windowState.js.
  tabs: [
    {
      tabId: 1, id: 1, windowId: WINDOW_ID, windowUUID: 'win-uuid',
      index: 0, active: true, pinned: false,
      url: 'https://example.com', title: 'Example Domain',
      favIconUrl: '', canGoBack: false, canGoForward: false,
      audible: false, muted: false
    },
    {
      tabId: 2, id: 2, windowId: WINDOW_ID, windowUUID: 'win-uuid',
      index: 1, active: false, pinned: false,
      url: 'https://brave.com', title: 'Brave Software',
      favIconUrl: '', canGoBack: true, canGoForward: false,
      audible: false, muted: false
    },
    {
      tabId: 3, id: 3, windowId: WINDOW_ID, windowUUID: 'win-uuid',
      index: 2, active: false, pinned: false, isPrivate: true,
      url: 'about:newtab', title: 'New Tab',
      favIconUrl: '', canGoBack: false, canGoForward: false
    }
  ],
  tabsInternal: { index: { 1: 0, 2: 1, 3: 2 }, displayIndex: {}, displayIndexInternal: {} },

  windows: [
    {
      windowId: WINDOW_ID, windowUUID: 'win-uuid', focused: true,
      type: 'normal', state: 'normal',
      top: 40, left: 40, width: 1200, height: 760
    }
  ],

  bookmarks: {
    'https://brave.com|0|0': {
      key: 'https://brave.com|0|0', location: 'https://brave.com',
      title: 'Brave', parentFolderId: 0, partitionNumber: 0, favicon: ''
    },
    'https://github.com/brave/browser-laptop|0|0': {
      key: 'https://github.com/brave/browser-laptop|0|0',
      location: 'https://github.com/brave/browser-laptop',
      title: 'browser-laptop on GitHub', parentFolderId: 0, partitionNumber: 0, favicon: ''
    }
  },
  bookmarkFolders: {},
  cache: {
    bookmarkLocation: {
      'https://brave.com': ['https://brave.com|0|0'],
      'https://github.com/brave/browser-laptop': ['https://github.com/brave/browser-laptop|0|0']
    },
    bookmarkOrder: {
      '0': [
        { key: 'https://brave.com|0|0', order: 0, type: 'bookmark' },
        { key: 'https://github.com/brave/browser-laptop|0|0', order: 1, type: 'bookmark' }
      ]
    }
  },

  // Payments/ledger is disabled here, but several nav components call
  // ledgerState.*(state, url) which asserts state.ledger is an Immutable.Map.
  ledger: { locations: {}, synopsis: { publishers: {} }, info: {}, about: {} },

  historySites: {},
  pinnedSites: {},
  downloads: {},
  notifications: [],
  extensions: {},
  autofill: { addresses: { guid: [] }, creditCards: { guid: [] } },

  menu: { template: [] },

  searchDetail: {
    searchURL: 'https://duckduckgo.com/?q={searchTerms}',
    autocompleteURL: 'https://ac.duckduckgo.com/ac/?q={searchTerms}&type=list'
  },

  about: {
    newtab: {
      gridLayoutSize: 'small',
      sites: [],
      ignoredTopSites: [],
      pinnedTopSites: [],
      updatedStamp: 1500000000000
    },
    brave: { versionInformation: {}, arch: 'x64' },
    history: { entries: [] }
  }
}
