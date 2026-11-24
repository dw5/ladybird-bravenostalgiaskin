/* Bridge between the Brave (Muon) chrome and Ladybird.
 *
 * The chrome is loaded by Ladybird as about:brave-chrome, a WebUI page. Ladybird
 * gives such pages `ladybird.sendMessage(name, data)` for page -> C++, and fires a
 * `WebUIMessage` DOM event (detail: { name, data }) for C++ -> page.
 *
 * C++ -> page:
 *   dismissPopups (the user clicked the page while a popup was open)
 *   tabsChanged { tabs: [{ id, title, url, favicon, loading, active, canGoBack, canGoForward, isPrivate }],
 *                 window: { maximized, fullScreen } }
 * page -> C++:
 *   chromeReady, newTab {url}, navigate {tabId, url}, activateTab {tabId}, closeTab {tabId},
 *   goBack {tabId}, goForward {tabId}, reload, stop, closeWindow, setChromeHeight {height, overlay, region},
 *   minimizeWindow, maximizeWindow, unmaximizeWindow, exitFullScreen, toggleMaximizeWindow, startWindowDrag
 *
 * Ladybird owns the truth about tabs. Every tabsChanged rebuilds the tab-related
 * parts of both Brave stores; user actions that would have gone to Muon's main
 * process are forwarded to Ladybird instead.
 */

const Immutable = require('immutable')
const appActions = require('../../js/actions/appActions')
const windowActions = require('../../js/actions/windowActions')
const windowStore = require('../../js/stores/windowStore')
const appStoreRenderer = require('../../js/stores/appStoreRenderer')
const messages = require('../../js/constants/messages')
const ipc = require('electron').ipcRenderer

const WINDOW_ID = 1

function send (name, data) {
  if (window.ladybird && typeof window.ladybird.sendMessage === 'function') {
    window.ladybird.sendMessage(name, data || {})
  } else {
    console.log('[brave-chrome] (no ladybird) ' + name, JSON.stringify(data || {}))
  }
}

// ---- page -> C++ -----------------------------------------------------------

function intercept (obj, name, fn) {
  const original = obj[name]
  obj[name] = function () {
    fn.apply(null, arguments)
    // Let window-local UI reducers still see the action (e.g. closing the URL bar dropdown).
    if (obj === windowActions && typeof original === 'function') return original.apply(obj, arguments)
  }
}

function installActionForwarding () {
  intercept(appActions, 'createTabRequested', (props) => {
    let url = (props && props.url) || ''
    // Ladybird has no private tabs inside a normal window: these only show Brave's private and Tor new tab pages.
    if (!url && props && props.isPrivate) url = props.isTor ? 'about:newtab#tor' : 'about:newtab#private'
    send('newTab', { url: url })
  })
  intercept(appActions, 'loadURLRequested', (tabId, url) => send('navigate', { tabId: tabId, url: url }))
  intercept(appActions, 'tabActivateRequested', (tabId) => send('activateTab', { tabId: tabId }))
  intercept(appActions, 'tabCloseRequested', (tabId) => send('closeTab', { tabId: tabId }))
  intercept(appActions, 'onGoBack', (tabId) => send('goBack', { tabId: tabId }))
  intercept(appActions, 'onGoForward', (tabId) => send('goForward', { tabId: tabId }))
  intercept(appActions, 'onGoBackLong', () => {})
  intercept(appActions, 'onGoForwardLong', () => {})
  intercept(appActions, 'closeWindow', () => send('closeWindow'))
  intercept(windowActions, 'onStop', () => send('stop'))
  intercept(windowActions, 'shouldMinimize', () => send('minimizeWindow'))
  intercept(windowActions, 'shouldMaximize', () => send('maximizeWindow'))
  intercept(windowActions, 'shouldUnmaximize', () => send('unmaximizeWindow'))
  intercept(windowActions, 'shouldExitFullScreen', () => send('exitFullScreen'))

  // Reload and stop buttons talk to the active frame via local IPC shortcuts.
  const emit = ipc.emit.bind(ipc)
  ipc.emit = function (channel) {
    if (channel === messages.SHORTCUT_ACTIVE_FRAME_RELOAD ||
        channel === messages.SHORTCUT_ACTIVE_FRAME_CLEAN_RELOAD) {
      send('reload')
    } else if (channel === messages.SHORTCUT_ACTIVE_FRAME_STOP) {
      send('stop')
    }
    return emit.apply(null, arguments)
  }
}

// ---- C++ -> page -----------------------------------------------------------

function newFrame (tab) {
  return Immutable.fromJS({
    key: tab.id,
    tabId: tab.id,
    isPrivate: !!tab.isPrivate,
    partitionNumber: 0,
    tabStripWindowId: WINDOW_ID,
    hasBeenActivated: true,
    security: { isSecure: false, runInsecureContent: false, blockedRunInsecureContent: [] },
    navbar: {
      urlbar: {
        location: '',
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
  })
}

function isNewTabUrl (url) {
  return !url || url === 'about:blank' || url === 'about:newtab'
}

function applyWindow (win) {
  if (!win) return
  const state = win.fullScreen ? 'fullscreen' : win.maximized ? 'maximized' : 'normal'
  const windows = appStoreRenderer.state.get('windows')
  if (!windows) return
  const index = windows.findIndex((w) => w.get('windowId') === WINDOW_ID)
  if (index === -1 || windows.getIn([index, 'state']) === state) return
  appStoreRenderer.state = appStoreRenderer.state.setIn(['windows', index, 'state'], state)
}

function applyTabs (tabs) {
  if (!tabs.length) return

  let windowState = windowStore.state
  const oldFrames = windowState.get('frames') || Immutable.List()
  const oldByKey = {}
  oldFrames.forEach((f) => { oldByKey[f.get('key')] = f })

  let activeKey = null
  const frames = tabs.map((tab, index) => {
    let frame = oldByKey[tab.id] || newFrame(tab)
    const urlbarPath = ['navbar', 'urlbar']
    const editing = frame.getIn(urlbarPath.concat('focused')) || frame.getIn(urlbarPath.concat('active'))
    const shownUrl = isNewTabUrl(tab.url) ? '' : tab.url
    if (tab.active) activeKey = tab.id

    frame = frame.merge({
      index: index,
      location: tab.url,
      src: tab.url,
      provisionalLocation: tab.url,
      title: tab.title || shownUrl || 'New Tab',
      loading: !!tab.loading,
      icon: tab.favicon || undefined,
      canGoBack: !!tab.canGoBack,
      canGoForward: !!tab.canGoForward
    })
    frame = frame.setIn(['security', 'isSecure'], /^https:/.test(tab.url || ''))
    if (!editing || frame.get('location') !== (oldByKey[tab.id] && oldByKey[tab.id].get('location'))) {
      frame = frame.setIn(urlbarPath.concat('location'), shownUrl)
    }
    return frame
  })

  const frameIndex = {}
  const tabIndex = {}
  tabs.forEach((tab, index) => { frameIndex[tab.id] = index; tabIndex[tab.id] = index })

  windowState = windowState.merge({
    activeFrameKey: activeKey != null ? activeKey : tabs[0].id,
    frames: Immutable.List(frames),
    tabs: Immutable.fromJS(tabs.map((tab, index) => ({ key: tab.id, index: index }))),
    framesInternal: Immutable.fromJS({ index: frameIndex, tabIndex: tabIndex })
  })
  windowStore.state = windowState
  windowStore.emitChanges()

  const appTabs = tabs.map((tab, index) => ({
    tabId: tab.id,
    id: tab.id,
    windowId: WINDOW_ID,
    windowUUID: 'win-uuid',
    index: index,
    active: !!tab.active,
    pinned: false,
    isPrivate: !!tab.isPrivate,
    url: tab.url,
    title: tab.title || '',
    favIconUrl: tab.favicon || '',
    canGoBack: !!tab.canGoBack,
    canGoForward: !!tab.canGoForward,
    audible: false,
    muted: false
  }))
  appStoreRenderer.state = appStoreRenderer.state.merge({
    tabs: Immutable.fromJS(appTabs),
    tabsInternal: Immutable.fromJS({ index: tabIndex, displayIndex: {}, displayIndexInternal: {} })
  })
}

// ---- bookmarks -------------------------------------------------------------

// Ladybird's bookmark tree, in the shape Brave's app state keeps bookmarks:
// folders are numbered (0 is the bookmarks toolbar, i.e. Ladybird's top level)
// and a bookmark's key is `location|0|folderId`, as bookmarkUtil.getKey makes it.
const bookmarkLocationCache = require('../../app/common/cache/bookmarkLocationCache')
const bookmarkIds = { byKey: {}, folderByNumber: { 0: null }, parentOf: {}, order: {} }

function applyBookmarks (items) {
  const bookmarks = {}
  const folders = {}
  const order = {}
  const ids = { byKey: {}, folderByNumber: { 0: null }, parentOf: {}, order: {} }
  let nextFolder = 1
  const walk = (list, folderNumber) => {
    const folderKey = String(folderNumber)
    order[folderKey] = []
    ids.order[folderKey] = []
    ;(list || []).forEach((item, index) => {
      if (item.type === 'folder') {
        const number = nextFolder++
        const key = String(number)
        folders[key] = { key: key, folderId: number, parentFolderId: folderNumber, title: item.title || '', type: 'bookmark-folder' }
        ids.byKey[key] = item.id
        ids.folderByNumber[number] = item.id
        ids.parentOf[key] = folderNumber
        ids.order[folderKey].push(key)
        order[folderKey].push({ key: key, order: index, type: 'bookmark-folder' })
        walk(item.children, number)
      } else {
        const key = item.url + '|0|' + folderNumber
        bookmarks[key] = {
          key: key,
          location: item.url,
          title: item.title || '',
          favicon: item.favicon ? 'data:image/png;base64,' + item.favicon : '',
          parentFolderId: folderNumber,
          partitionNumber: 0,
          type: 'bookmark'
        }
        ids.byKey[key] = item.id
        ids.parentOf[key] = folderNumber
        ids.order[folderKey].push(key)
        order[folderKey].push({ key: key, order: index, type: 'bookmark' })
      }
    })
  }
  walk(items, 0)
  Object.assign(bookmarkIds, ids)

  let state = appStoreRenderer.state.merge({
    bookmarks: Immutable.fromJS(bookmarks),
    bookmarkFolders: Immutable.fromJS(folders)
  })
  state = state.setIn(['cache', 'bookmarkOrder'], Immutable.fromJS(order))
  state = state.setIn(['cache', 'bookmarkLocation'], Immutable.Map())
  Object.keys(bookmarks).forEach((key) => {
    state = bookmarkLocationCache.addCacheKey(state, bookmarks[key].location, key)
  })
  appStoreRenderer.state = state
  windowStore.emitChanges()
}

const plain = (value) => (value && typeof value.toJS === 'function') ? value.toJS() : (value || {})
const folderIdFor = (number) => bookmarkIds.folderByNumber[Number(number) || 0] || undefined

function moveBookmarkItem (key, destinationKey, append, moveIntoParent) {
  const id = bookmarkIds.byKey[key]
  if (!id) return
  const destinationIsFolder = /^\d+$/.test(String(destinationKey))
  if (moveIntoParent && destinationIsFolder) {
    const number = Number(destinationKey)
    send('bookmarkMove', { id: id, folderId: folderIdFor(number), index: (bookmarkIds.order[String(number)] || []).length })
    return
  }
  const folderNumber = bookmarkIds.parentOf[destinationKey] || 0
  const siblings = bookmarkIds.order[String(folderNumber)] || []
  let index = siblings.indexOf(destinationKey) + (append ? 1 : 0)
  const current = siblings.indexOf(key)
  if (current !== -1 && current < index) index--
  send('bookmarkMove', { id: id, folderId: folderIdFor(folderNumber), index: Math.max(0, index) })
}

function installBookmarkForwarding () {
  // Ladybird's store is the source of truth: these send the change and the new
  // tree comes back as bookmarksChanged. Brave's own reducers are skipped.
  appActions.addBookmark = (detail) => {
    const d = plain(detail)
    if (!d.location) return
    const number = d.parentFolderId !== undefined ? d.parentFolderId : d.folderId
    send('bookmarkAdd', { url: d.location, title: d.title || '', folderId: folderIdFor(number) })
  }
  appActions.editBookmark = (editKey, detail) => {
    const id = bookmarkIds.byKey[editKey]
    const d = plain(detail)
    if (!id) return
    const location = d.location || (appStoreRenderer.state.getIn(['bookmarks', editKey, 'location']))
    send('bookmarkEdit', { id: id, url: location, title: d.title || '' })
    const number = Number(d.parentFolderId || 0)
    if (d.parentFolderId !== undefined && number !== (bookmarkIds.parentOf[editKey] || 0)) {
      send('bookmarkMove', { id: id, folderId: folderIdFor(number), index: (bookmarkIds.order[String(number)] || []).length })
    }
  }
  appActions.removeBookmark = (key) => {
    const keys = Array.isArray(key) ? key : (key && key.toJS ? key.toJS() : [key])
    ;(Array.isArray(keys) ? keys : [keys]).forEach((k) => {
      const id = bookmarkIds.byKey[k]
      if (id) send('bookmarkRemove', { id: id })
    })
  }
  appActions.addBookmarkFolder = (detail) => {
    const d = plain(detail)
    send('bookmarkAddFolder', { title: d.title || '', folderId: folderIdFor(d.parentFolderId) })
  }
  appActions.editBookmarkFolder = (editKey, detail) => {
    const id = bookmarkIds.byKey[String(editKey)]
    if (id) send('bookmarkEditFolder', { id: id, title: plain(detail).title || '' })
  }
  appActions.removeBookmarkFolder = (folder) => {
    const f = plain(folder)
    const key = typeof folder === 'string' || typeof folder === 'number' ? String(folder) : String(f.key !== undefined ? f.key : f.folderId)
    const id = bookmarkIds.byKey[key]
    if (id) send('bookmarkRemove', { id: id })
  }
  appActions.moveBookmark = moveBookmarkItem
  appActions.moveBookmarkFolder = moveBookmarkItem
}

// ---- chrome height ---------------------------------------------------------

// The chrome view sits above the page view. Normally it is exactly as tall as
// the tab strip + navbar (+ bookmarks bar); while a dropdown or panel is open it
// asks to overlay the whole window so the popup isn't clipped.
function overlayWanted () {
  const s = windowStore.state
  const active = s.get('frames') && s.get('frames').find((f) => f.get('key') === s.get('activeFrameKey'))
  return !!(
    (active && active.getIn(['navbar', 'urlbar', 'suggestions', 'shouldRender'])) ||
    s.get('contextMenuDetail') || s.get('popupWindowDetail') || s.get('braveryPanelDetail') ||
    s.get('bookmarkDetail') || s.get('bookmarkFolderDetail') ||
    s.getIn(['ui', 'siteInfo', 'isVisible']) || s.getIn(['ui', 'noScriptInfo', 'isVisible']) ||
    s.getIn(['ui', 'isClearBrowsingDataPanelVisible'])
  )
}

// While overlaid, the chrome view covers the window but shows only the toolbar
// and the open popups: these rectangles. Full-window backdrops (Brave dims the
// page behind some panels) are left out, so the live page stays visible.
// Ladybird fills a page's canvas with an opaque color, so a margin left for the
// popup's drop shadow would show as a white band; keep to the popup's own box.
const POPUP_SHADOW = 0

function paintsBackground (style) {
  if (style.backgroundImage && style.backgroundImage !== 'none') return true
  const m = /rgba?\(([^)]+)\)/.exec(style.backgroundColor || '')
  if (!m) return false
  const parts = m[1].split(',').map((p) => parseFloat(p))
  return parts.length < 4 || parts[3] > 0
}

// The boxes below the toolbar that paint a background: a popup's wrapper is
// usually an invisible box spanning several menus, so it is the painted boxes
// inside it that are kept, not the wrapper. Full-window backdrops are skipped.
function popupRects (topHeight) {
  const rects = []
  const viewportArea = window.innerWidth * window.innerHeight
  const walk = (el) => {
    for (const child of el.children) {
      const style = window.getComputedStyle(child)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const r = child.getBoundingClientRect()
      const paintedPopup = r.bottom > topHeight + 1 && r.width > 0 && r.height > 0 &&
        r.width * r.height < 0.9 * viewportArea && paintsBackground(style)
      if (paintedPopup) {
        if (window.braveNostalgiaDebug) {
          console.log('[brave-chrome] popup box ' + [r.left, r.top, r.width, r.height].map(Math.round).join(',') +
            ' ' + child.tagName + '.' + String(child.className).slice(0, 80) + ' bg=' + style.backgroundColor)
        }
        rects.push([
          Math.floor(r.left) - POPUP_SHADOW,
          Math.floor(r.top) - POPUP_SHADOW,
          Math.ceil(r.width) + 2 * POPUP_SHADOW,
          Math.ceil(r.height) + 2 * POPUP_SHADOW
        ])
      } else {
        walk(child)
      }
    }
  }
  const root = document.getElementById('window')
  if (root) walk(root)
  return rects
}

let lastReport = ''
function reportHeight () {
  const top = document.querySelector('#window > .top')
  if (!top) return
  const height = Math.ceil(top.getBoundingClientRect().height)
  const overlay = overlayWanted()
  const region = overlay ? [[0, 0, window.innerWidth, height]].concat(popupRects(height)) : []
  const report = JSON.stringify([height, overlay, region])
  if (report === lastReport) return
  lastReport = report
  send('setChromeHeight', { height: height, overlay: overlay, region: region })
}

// A click on the page while a popup is open closes it, as a click outside did in Brave.
// The lion toggles its panel: Brave relied on the panel's full-window backdrop
// catching the second click, but here clicks outside the panel go elsewhere.
function installShieldsToggle () {
  const original = windowActions.setBraveryPanelDetail
  windowActions.setBraveryPanelDetail = function (detail) {
    const open = !!windowStore.getState().get('braveryPanelDetail')
    if (detail && open && Object.keys(detail).length === 0) return original.call(this)
    return original.apply(this, arguments)
  }
}

function dismissPopups () {
  const call = (name, ...args) => { if (typeof windowActions[name] === 'function') windowActions[name](...args) }
  call('setBraveryPanelDetail')
  call('setContextMenuDetail')
  call('setPopupWindowDetail')
  call('onBookmarkClose')
  call('setRenderUrlBarSuggestions', false)
  call('setSiteInfoVisible', false)
  call('setNoScriptVisible', false)
  call('setClearBrowsingDataPanelVisible', false)
  call('setImportBrowserDataDetail')
}

function installHeightReporting () {
  windowStore.addChangeListener(() => {
    setTimeout(reportHeight, 0)
    setTimeout(reportHeight, 250)
  })
  if (typeof ResizeObserver === 'function') {
    const observe = () => {
      const top = document.querySelector('#window > .top')
      if (top) new ResizeObserver(reportHeight).observe(top)
      else setTimeout(observe, 50)
    }
    observe()
  }
}

// ---- window dragging -------------------------------------------------------

// Muon used `-webkit-app-region: drag`; here a press on empty chrome asks
// Ladybird to start a system move, and a double click toggles maximize.
const NOT_DRAGGABLE = [
  'button', 'input', 'a', 'select', 'textarea', '[role="button"]',
  '[data-test-id="tab"]', '.urlbarForm', '.browserButton', '.navigationButtonContainer',
  '.bookmarkToolbarButton', '.menubarItem', '.windowCaptionButtons', '[draggable="true"]'
].join(',')

function isDragRegion (target) {
  if (!target || !target.closest) return false
  if (!target.closest('#window > .top')) return false
  return !target.closest(NOT_DRAGGABLE)
}

function installWindowDragging () {
  document.addEventListener('mousedown', (e) => {
    if (e.button === 0 && e.detail === 1 && isDragRegion(e.target)) send('startWindowDrag')
  }, true)
  document.addEventListener('dblclick', (e) => {
    if (isDragRegion(e.target)) send('toggleMaximizeWindow')
  }, true)
}

// ---- tab hover -------------------------------------------------------------

// Tabs show their close button while hovered. React 15 derives onMouseEnter from
// mouseout/mouseover pairs; track the hovered tab from plain mouseover as well,
// so hover works however the engine fills in relatedTarget.
function installTabHoverTracking () {
  let hoveredKey = null
  const setHovered = (key) => {
    if (key === hoveredKey) return
    if (hoveredKey != null) windowActions.setTabHoverState(hoveredKey, false, false)
    hoveredKey = key
    if (key != null) windowActions.setTabHoverState(key, true, false)
  }
  document.addEventListener('mouseover', (e) => {
    const tab = e.target && e.target.closest && e.target.closest('[data-test-id="tab"]')
    const key = tab ? Number(tab.getAttribute('data-frame-key')) : null
    setHovered(Number.isNaN(key) ? null : key)
  }, true)
  document.addEventListener('mouseleave', () => setHovered(null))
}

// ---- tab dragging ----------------------------------------------------------

// Brave dragged tabs with HTML5 drag and drop across Muon windows. Here the
// dragged tab follows the pointer, and on release Ladybird either moves it
// within the strip or tears it off into a new window (released well outside
// the strip). Ladybird's view keeps getting the pointer while the button is
// held, so a release over the page still lands here.
const TEAR_OFF_DISTANCE = 40

function installTabDragging () {
  // Keep HTML5 drag and drop from taking over the tab.
  document.addEventListener('dragstart', (e) => {
    if (e.target && e.target.closest && e.target.closest('[data-test-id="tab"]')) e.preventDefault()
  }, true)

  let drag = null

  const reset = (d) => {
    d.tab.style.transform = ''
    d.tab.style.zIndex = ''
    d.tab.style.opacity = ''
    d.tab.style.pointerEvents = ''
  }
  const tornOff = (d, e) => {
    const strip = d.strip.getBoundingClientRect()
    return e.clientY > strip.bottom + TEAR_OFF_DISTANCE || e.clientY < strip.top - TEAR_OFF_DISTANCE ||
      e.clientX < -TEAR_OFF_DISTANCE || e.clientX > window.innerWidth + TEAR_OFF_DISTANCE
  }

  document.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || !e.target.closest) return
    const tab = e.target.closest('[data-test-id="tab"]')
    if (!tab || e.target.closest('[data-test-id="closeTabIcon"]')) return
    drag = {
      tab: tab,
      strip: tab.parentElement.parentElement || tab.parentElement,
      key: Number(tab.getAttribute('data-frame-key')),
      x: e.clientX,
      y: e.clientY,
      active: false
    }
  }, true)

  document.addEventListener('mousemove', (e) => {
    if (!drag) return
    if (!(e.buttons & 1)) { reset(drag); drag = null; return }
    const dx = e.clientX - drag.x
    const dy = e.clientY - drag.y
    if (!drag.active && Math.abs(dx) + Math.abs(dy) < 6) return
    if (!drag.active) {
      drag.active = true
      windowActions.setTabHoverState(drag.key, false, false)
    }
    // mouseup coordinates aren't reliable in Ladybird on scaled displays; the drop uses the last move.
    drag.last = { clientX: e.clientX, clientY: e.clientY }
    const off = tornOff(drag, e)
    drag.tab.style.transform = 'translate(' + dx + 'px, ' + (off ? dy : 0) + 'px)'
    drag.tab.style.zIndex = '100'
    drag.tab.style.opacity = off ? '0.6' : ''
    drag.tab.style.pointerEvents = 'none'
  }, true)

  document.addEventListener('mouseup', (e) => {
    if (!drag) return
    const d = drag
    drag = null
    reset(d)
    if (!d.active) return
    const at = d.last || e

    // The click that follows a drag must not do anything else.
    const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault() }
    document.addEventListener('click', swallow, { capture: true, once: true })
    setTimeout(() => document.removeEventListener('click', swallow, true), 0)

    if (tornOff(d, at)) {
      send('detachTab', { tabId: d.key })
      return
    }

    // The new index is the number of other tabs whose middle is left of the pointer.
    const others = Array.from(document.querySelectorAll('[data-test-id="tab"]')).filter((t) => t !== d.tab)
    const index = others.filter((t) => {
      const r = t.getBoundingClientRect()
      return r.left + r.width / 2 < at.clientX
    }).length
    send('moveTab', { tabId: d.key, index: index })
  }, true)
}

// ---- startup ---------------------------------------------------------------

exports.start = function (onFirstTabs) {
  installActionForwarding()
  installBookmarkForwarding()

  let mounted = false
  document.addEventListener('WebUIMessage', (event) => {
    const detail = event.detail || {}
    if (detail.name === 'dismissPopups') {
      dismissPopups()
      return
    }
    if (detail.name === 'braveSettingsChanged') {
      // Brave's own preferences, saved by about:preferences in Ladybird's settings.
      appStoreRenderer.state = appStoreRenderer.state.mergeIn(['settings'], Immutable.fromJS(detail.data || {}))
      windowStore.emitChanges()
      reportHeight()
      return
    }
    if (detail.name === 'bookmarksChanged') {
      applyBookmarks(detail.data)
      return
    }
    if (detail.name !== 'tabsChanged') return
    const tabs = (detail.data && detail.data.tabs) || []
    applyWindow(detail.data && detail.data.window)
    applyTabs(tabs)
    if (!mounted && tabs.length) {
      mounted = true
      onFirstTabs()
      installHeightReporting()
      installShieldsToggle()
      installWindowDragging()
      installTabHoverTracking()
      installTabDragging()
    }
    reportHeight()
  })

  const ready = () => send('chromeReady')
  document.addEventListener('WebUILoaded', ready)
  if (window.ladybird) ready()
}
