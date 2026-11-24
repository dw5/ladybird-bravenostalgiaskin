/* Mock per-window WindowStore state for the standalone chrome shell.
 *
 * Schema mirrors browser-laptop/docs/state.md (WindowStore section). Each frame
 * is an open tab's UI state; `key` is the frame key, `tabId` links to a tab in
 * appState.js. `activeFrameKey` picks which one is focused. Poke at these to add
 * tabs, flip isPrivate, change titles, etc.
 */

function frame (key, tabId, index, location, title, extra) {
  return Object.assign({
    key: key,
    tabId: tabId,
    index: index,
    location: location,
    src: location,
    title: title,
    provisionalLocation: location,
    loading: false,
    isPrivate: false,
    partitionNumber: 0,
    tabStripWindowId: 1,
    hasBeenActivated: true,
    themeColor: undefined,
    computedThemeColor: undefined,
    icon: undefined,
    security: { isSecure: true, runInsecureContent: false, blockedRunInsecureContent: [] },
    navbar: {
      urlbar: {
        location: location,
        focused: false,
        active: false,
        selected: false,
        suggestions: { shouldRender: false, suggestionList: null, selectedIndex: null, autocompleteEnabled: true },
        searchDetail: null
      }
    },
    adblock: { blocked: [] },
    trackingProtection: { blocked: [] },
    httpsEverywhere: {},
    noScript: { blocked: [] },
    fingerprintingProtection: { blocked: [] }
  }, extra || {})
}

module.exports = {
  activeFrameKey: 1,
  previewFrameKey: null,
  frames: [
    // Active tab points at a framing-friendly site so the content area shows a
    // real page by default (proves the <iframe> swap works). Tabs 2 & 3 point at
    // sites that forbid framing / an about: page — click them to see that some
    // sites block embedding (expected) and that about:* loads the local pages.
    frame(1, 1, 0, 'https://example.com', 'Example Domain'),
    frame(2, 2, 1, 'https://brave.com', 'Brave Software', { canGoBack: true }),
    frame(3, 3, 2, 'about:newtab', 'New Tab', { isPrivate: true })
  ],
  tabs: [
    { key: 1, index: 0 },
    { key: 2, index: 1 },
    { key: 3, index: 2 }
  ],
  closedFrames: [],
  framesInternal: {
    index: { 1: 0, 2: 1, 3: 2 },
    tabIndex: { 1: 0, 2: 1, 3: 2 }
  },

  ui: {
    isFocused: true,
    mouseInTitlebar: false,
    tabs: {
      tabPageIndex: 0,
      previewTabPageIndex: null,
      hoverTabIndex: null,
      previewMode: false,
      intersectionRatio: 1
    },
    bookmarksToolbar: { selectedFolderId: null },
    downloadsToolbar: { isVisible: false },
    menubar: { isVisible: false, selectedIndex: null, lastFocusedSelector: null },
    siteInfo: { isVisible: false },
    releaseNotes: { isVisible: false },
    noScriptInfo: { isVisible: false },
    isClearBrowsingDataPanelVisible: false
  },

  windowInfo: {
    focused: true, type: 'normal', state: 'normal',
    top: 40, left: 40, width: 1200, height: 760
  },

  // NOTE: keys like contextMenuDetail / popupWindowDetail / bookmarkDetail /
  // autofill*Detail are intentionally ABSENT. Panels mount based on
  // currentWindow.has(<key>), and Immutable .has() is true for a present-but-
  // null value — so setting them to null would mount an empty panel that then
  // crashes. Omit them to keep those panels closed.
  searchResults: []
}
