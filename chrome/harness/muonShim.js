/* The single Muon / Electron stand-in for the standalone build.
 *
 * This file is prepended to every webpack entry (see webpack.config.js) so the
 * globals the extracted UI expects — `chrome` (=== the `electron` module via
 * externals), `muon`, and `process` — exist before any bundled code evaluates.
 *
 * It is modeled on browser-laptop/test/unit/lib/fakeElectron.js, but instead of
 * being wired into a test it is wired into a live browser: IPC is a local
 * EventEmitter that answers the couple of synchronous calls the UI makes at
 * load time (notably `sendSync('translations')`), and everything else is an
 * inert fake so the React tree can mount and read from the seeded stores.
 */

const EventEmitter = require('events').EventEmitter
const urlParse = require('url').parse
const translations = require('./translations.js')

// webpack replaces `process.env.NODE_ENV` with a string literal (DefinePlugin),
// so this reads it without ever touching a bare `process` global (which does
// not exist yet — we are the code that installs it, below).
const NODE_ENV = process.env.NODE_ENV || 'development'

// ---- ipcRenderer -----------------------------------------------------------
// A local event bus. `send` is a no-op sink (actions are dispatched locally by
// the patched dispatcher / seeded stores, not over IPC). `sendSync` answers the
// handful of synchronous requests the renderer makes during boot.
const ipcRenderer = new EventEmitter()
ipcRenderer.setMaxListeners(0)
ipcRenderer.send = function () {}
ipcRenderer.sendShared = function () {}
ipcRenderer.sendToHost = function () {}
ipcRenderer.sendSync = function (channel) {
  switch (channel) {
    case 'translations':
      return translations
    case 'get-webview-tab-id':
      return null
    default:
      return undefined
  }
}
// Muon-specific: emit-shared behaves like emit here.
ipcRenderer.emitShared = ipcRenderer.emit.bind(ipcRenderer)

// ---- native menus, shown as Brave's HTML context menu ------------------------
// Muon showed right-click menus natively (remote.Menu). Here they open in the
// same HTML menu the hamburger button uses, at the last pointer position.
let lastPointer = { x: 0, y: 0 }
if (typeof document !== 'undefined') {
  const track = function (e) { lastPointer = { x: e.clientX, y: e.clientY } }
  document.addEventListener('mousedown', track, true)
  document.addEventListener('contextmenu', track, true)
}
const EDIT_ROLES = { cut: 'cut', copy: 'copy', paste: 'paste', selectall: 'selectAll', delete: 'delete', undo: 'undo', redo: 'redo' }
function withRoleClicks (items) {
  return (items || []).map(function (item) {
    if (!item || typeof item !== 'object') return item
    const copy = Object.assign({}, item)
    const command = copy.role && EDIT_ROLES[String(copy.role).toLowerCase()]
    if (command && typeof copy.click !== 'function') {
      copy.click = function () { try { document.execCommand(command) } catch (e) {} }
    }
    if (Array.isArray(copy.submenu)) copy.submenu = withRoleClicks(copy.submenu)
    return copy
  }).filter(function (item) { return item && item.visible !== false })
}
const Menu = {
  buildFromTemplate: function (template) {
    return {
      popup: function () {
        const Immutable = require('immutable')
        const windowActions = require('../js/actions/windowActions')
        windowActions.setContextMenuDetail(Immutable.fromJS({
          left: lastPointer.x,
          top: lastPointer.y,
          template: withRoleClicks(template)
        }))
      },
      closePopup: function () {}
    }
  },
  setApplicationMenu: function () {}
}

// ---- a fake BrowserWindow (what remote.getCurrentWindow returns) -----------
function fakeCurrentWindow () {
  const win = new EventEmitter()
  return Object.assign(win, {
    id: 1,
    isFocused: function () { return true },
    isMaximized: function () { return false },
    isMinimized: function () { return false },
    isFullScreen: function () { return false },
    isAlwaysOnTop: function () { return false },
    getId: function () { return 1 },
    setTitle: function () {},
    webContents: { send: function () {}, on: function () {} }
  })
}
const currentWindow = fakeCurrentWindow()

// ---- the `chrome` / `electron` object --------------------------------------
const electron = {
  ipcRenderer: ipcRenderer,
  webFrame: {
    setPageScaleLimits: function () {},
    setZoomLevel: function () {},
    setZoomLevelLimits: function () {},
    setSpellCheckProvider: function () {},
    registerURLSchemeAsBypassingCSP: function () {},
    executeJavaScript: function () {}
  },
  remote: {
    getCurrentWindow: function () { return currentWindow },
    getCurrentWebContents: function () { return currentWindow.webContents },
    getGlobal: function () { return {} },
    getWebContents: function (tabId, cb) { if (typeof cb === 'function') cb(null) },
    registerAllWindowTabEvents: function () {},
    app: {
      getVersion: function () { return '0.27.3' },
      getName: function () { return 'Brave' },
      getLocale: function () { return 'en-US' },
      getPath: function (name) { return '/' + (name || '') },
      on: function () {}
    },
    require: function () { return {} },
    process: { argv: [], env: {} },
    Menu: Menu,
    clipboard: {
      readText: function () { return '' },
      writeText: function (text) { try { navigator.clipboard.writeText(text) } catch (e) {} }
    }
  },
  clipboard: {
    readText: function () { return '' },
    writeText: function (text) { try { navigator.clipboard.writeText(text) } catch (e) {} }
  },
  shell: {
    openExternal: function (url) { try { window.open(url, '_blank') } catch (e) {} },
    openItem: function () {},
    showItemInFolder: function () {},
    beep: function () {},
    moveItemToTrash: function () {}
  }
}

// ---- the `muon` global -----------------------------------------------------
const muon = {
  shared_memory: {
    create: function (obj) { return { memory: function () { return obj } } }
  },
  url: {
    // urlParse() in app/common/urlParse.js prefers muon.url.parse; give it a
    // real implementation (node's url.parse polyfill).
    parse: urlParse,
    new: function (u) {
      const parsed = urlParse(u || '')
      const host = (parsed && parsed.hostname) || ''
      return {
        hostIsIPAddress: function () {
          return /^(\d{1,3}\.){3}\d{1,3}$/.test(host) || host.indexOf(':') !== -1
        },
        host: host,
        toString: function () { return u }
      }
    }
  },
  crashReporter: {
    setJavascriptInfoCrashValue: function () {},
    dumpWithoutCrashing: function () {}
  },
  file: {},
  browserAction: { setBadgeText: function () {} }
}

// ---- the `process` global --------------------------------------------------
// Making process.type === 'renderer' steers js/dispatcher/appDispatcher.js into
// its local-dispatch branch instead of throwing "No ipc available" under http:.
const proc = {
  type: 'renderer',
  browser: true,
  platform: (function () {
    const p = (typeof navigator !== 'undefined' && navigator.platform) || ''
    if (/Win/.test(p)) return 'win32'
    if (/Mac/.test(p)) return 'darwin'
    return 'linux'
  })(),
  env: { NODE_ENV: NODE_ENV },
  argv: [],
  version: 'v7.9.0',
  versions: { node: '7.9.0', chrome: '60.0.0' },
  nextTick: function (fn) { setTimeout(fn, 0) },
  on: function () {},
  once: function () {},
  cwd: function () { return '/' }
}

// Install on the global object. `chrome` doubles as the `electron` module
// because webpack externals maps require('electron') -> chrome.
const g = (typeof window !== 'undefined') ? window : self
g.chrome = Object.assign(g.chrome || {}, electron)
g.muon = muon
g.process = Object.assign(g.process || {}, proc)

module.exports = { electron: electron, muon: muon, ipcRenderer: ipcRenderer }
