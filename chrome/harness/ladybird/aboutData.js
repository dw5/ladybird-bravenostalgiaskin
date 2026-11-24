/* Real data for Brave's about: pages inside Ladybird.
 *
 * Ladybird's own about:history, about:downloads, about:bookmarks and
 * about:settings pages talk to C++ handlers over `ladybird.sendMessage` /
 * `WebUIMessage` events. With the Brave chrome on, Ladybird serves Brave's
 * pages at those addresses instead (and maps about:preferences and
 * about:adblock to the settings handler), so this file speaks the Ladybird
 * protocol on one side and Brave's IPC messages and actions on the other.
 *
 * Pages without a Ladybird counterpart (about:brave, about:passwords, ...)
 * keep the harness sample data.
 */
'use strict'

const Immutable = require('immutable')
const messages = require('../../js/constants/messages')
const settings = require('../../js/constants/settings')
const aboutActions = require('../../js/about/aboutActions')
const appActions = require('../../js/actions/appActions')
const windowActions = require('../../js/actions/windowActions')
const searchProviders = require('../../js/data/searchProviders')

const e = {} // fake ipc event argument
const handle = (obj) => ({ memory: () => obj })

function send (name, data) {
  if (window.ladybird && typeof window.ladybird.sendMessage === 'function') {
    window.ladybird.sendMessage(name, data === undefined ? {} : data)
  }
}

// The page subscribes to its IPC messages when it mounts.
let markMounted
const mounted = new Promise((resolve) => { markMounted = resolve })

// Calls `fn` once the page is mounted and the WebUI connection is up.
function whenConnected (fn) {
  mounted.then(() => {
    let done = false
    const go = () => {
      if (done) return
      done = true
      fn()
    }
    document.addEventListener('WebUILoaded', go)
    if (window.ladybird) go()
  })
}

function onMessage (fn) {
  document.addEventListener('WebUIMessage', (event) => {
    const detail = event.detail || {}
    fn(detail.name, detail.data)
  })
}

function openUrl (url) {
  if (!url) return
  const opened = window.open(url, '_blank')
  if (!opened) window.location.href = url
}

const faviconUrl = (base64) => base64 ? 'data:image/png;base64,' + base64 : undefined

// ---------------------------------------------------------------- history

function history (ipc) {
  const load = () => send('loadHistoryEntries', { offset: 0, limit: 1000, query: '', requestId: 1 })
  onMessage((name, data) => {
    if (name !== 'loadHistoryEntries' || !data) return
    const entries = (data.entries || []).map((entry) => ({
      key: entry.url + '|0',
      location: entry.url,
      title: entry.title || '',
      favicon: faviconUrl(entry.faviconBase64Png),
      lastAccessedTime: entry.lastVisitedTime,
      count: entry.visitCount,
      partitionNumber: 0
    }))
    ipc.emit(messages.HISTORY_UPDATED, e, handle({ updatedStamp: Date.now(), entries: entries }))
  })
  whenConnected(load)
  window.addEventListener('focus', load)
}

// -------------------------------------------------------------- downloads

const DOWNLOAD_STATES = {
  'in-progress': 'IN_PROGRESS',
  paused: 'PAUSED',
  completed: 'COMPLETED',
  canceled: 'CANCELLED',
  failed: 'INTERRUPTED'
}

function downloads (ipc) {
  const all = {}
  const toBrave = (d) => ({
    downloadId: String(d.id),
    filename: d.fileName,
    savePath: d.destination,
    url: d.url,
    startTime: d.id,
    state: DOWNLOAD_STATES[d.status] || 'INTERRUPTED',
    totalBytes: d.totalSize || 0,
    receivedBytes: d.downloadedSize || 0
  })
  const emit = () => ipc.emit(messages.DOWNLOADS_UPDATED, e, { downloads: Object.assign({}, all) })
  onMessage((name, data) => {
    if (name === 'loadDownloads') {
      Object.keys(all).forEach((k) => delete all[k])
      ;(data || []).forEach((d) => { all[d.id] = toBrave(d) })
    } else if (name === 'downloadAdded' || name === 'downloadUpdated') {
      all[data.id] = toBrave(data)
    } else if (name === 'downloadRemoved') {
      delete all[data]
    } else {
      return
    }
    emit()
  })
  // Brave revealed a download on double-click; open it once it's done.
  aboutActions.downloadRevealed = (downloadId) => {
    const d = all[downloadId]
    if (!d) return
    send(d.state === 'COMPLETED' ? 'openDownload' : 'showDownloadInFolder', { id: Number(downloadId) })
  }
  whenConnected(() => send('loadDownloads'))
}

// -------------------------------------------------------------- bookmarks

function bookmarks (ipc) {
  // Brave numbers folders (0 is the bookmarks toolbar); Ladybird names them by id.
  let folderIdOf = {}
  let ladybirdIdOf = {}
  let parentOf = {} // Brave key -> Brave folder id
  let order = {} // Brave folder key -> [Brave keys]

  const convert = (items) => {
    const result = { bookmarks: {}, bookmarkFolders: {}, bookmarkOrder: {} }
    folderIdOf = {}
    ladybirdIdOf = { 0: null }
    parentOf = {}
    order = {}
    let nextFolderId = 1
    const walk = (list, folderId) => {
      const folderKey = String(folderId)
      result.bookmarkOrder[folderKey] = []
      order[folderKey] = []
      list.forEach((item, index) => {
        if (item.type === 'folder') {
          const id = nextFolderId++
          folderIdOf[item.id] = id
          ladybirdIdOf[id] = item.id
          const key = String(id)
          result.bookmarkFolders[key] = {
            key: key,
            folderId: id,
            parentFolderId: folderId,
            title: item.title || '',
            type: 'bookmark-folder'
          }
          result.bookmarkOrder[folderKey].push({ key: key, order: index, type: 'bookmark-folder' })
          order[folderKey].push(key)
          parentOf[key] = folderId
          walk(item.children || [], id)
        } else {
          const key = item.id
          ladybirdIdOf[key] = item.id
          result.bookmarks[key] = {
            key: key,
            location: item.url,
            title: item.title || '',
            favicon: faviconUrl(item.favicon),
            parentFolderId: folderId,
            partitionNumber: 0,
            type: 'bookmark'
          }
          result.bookmarkOrder[folderKey].push({ key: key, order: index, type: 'bookmark' })
          order[folderKey].push(key)
          parentOf[key] = folderId
        }
      })
    }
    walk(items || [], 0)
    return result
  }

  let lastItems = []
  onMessage((name, data) => {
    if (name !== 'loadBookmarks') return
    lastItems = data || []
    ipc.emit(messages.BOOKMARKS_UPDATED, e, handle(convert(data)))
  })

  // Import and export use the Netscape bookmarks file, as Ladybird's own page does.
  aboutActions.importBrowserDataNow = () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.html,text/html'
    input.style.display = 'none'
    input.addEventListener('change', () => {
      const file = input.files[0]
      input.remove()
      if (!file) return
      const reader = new FileReader()
      reader.onload = () => {
        const items = parseNetscapeBookmarks(String(reader.result))
        if (items.length > 0) send('importBookmarks', items)
      }
      reader.readAsText(file)
    })
    document.body.appendChild(input)
    input.click()
  }
  aboutActions.exportBookmarks = () => {
    let html = '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n'
    html += '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n'
    html += '<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n'
    html += netscapeBookmarkList(lastItems, 0)
    send('exportBookmarks', html)
  }

  const move = (key, destinationKey, append, moveIntoParent) => {
    const id = ladybirdIdOf[key]
    if (!id) return
    const destIsFolder = /^\d+$/.test(String(destinationKey))
    if (moveIntoParent || (destIsFolder && !(String(destinationKey) in parentOf))) {
      // Dropped onto a folder: put it at the end of that folder.
      const folderId = Number(destinationKey)
      send('moveItem', {
        id: id,
        targetFolderId: ladybirdIdOf[folderId] || undefined,
        index: (order[String(folderId)] || []).length
      })
      return
    }
    const folderId = parentOf[destinationKey]
    const siblings = order[String(folderId)] || []
    let index = siblings.indexOf(destinationKey) + (append ? 1 : 0)
    const current = siblings.indexOf(key)
    if (current !== -1 && current < index) index--
    send('moveItem', { id: id, targetFolderId: ladybirdIdOf[folderId] || undefined, index: Math.max(0, index) })
  }
  appActions.moveBookmark = move
  appActions.moveBookmarkFolder = move

  // Ladybird's own context menu has open, edit and delete.
  aboutActions.contextMenu = (nodeProps, contextMenuType, event) => {
    if (event && event.preventDefault) event.preventDefault()
    const key = nodeProps && (nodeProps.key || (nodeProps.folderId !== undefined && String(nodeProps.folderId)))
    const parent = nodeProps && nodeProps.parentFolderId
    const payload = { clientX: Math.round(event ? event.clientX : 0), clientY: Math.round(event ? event.clientY : 0) }
    if (key && ladybirdIdOf[key]) {
      payload.id = ladybirdIdOf[key]
      if (ladybirdIdOf[parent]) payload.parentFolderId = ladybirdIdOf[parent]
      if (nodeProps.folderId !== undefined && ladybirdIdOf[nodeProps.folderId]) payload.targetFolderId = ladybirdIdOf[nodeProps.folderId]
    }
    send('showContextMenu', payload)
  }
  windowActions.addBookmarkFolder = (detail) => {
    const parent = detail && (detail.get ? detail.get('parentFolderId') : detail.parentFolderId)
    send('newFolder', ladybirdIdOf[parent] ? { targetFolderId: ladybirdIdOf[parent] } : {})
  }
  whenConnected(() => send('loadBookmarks'))
}

// Netscape bookmark files, after Ladybird's about:bookmarks.
function parseNetscapeBookmarks (html) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const seconds = (value) => (value && value !== '0') ? Number(value) * 1000 : undefined
  const uuid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Math.random()).slice(2)
  const parseItems = (dl) => {
    const items = []
    if (!dl) return items
    for (const dt of dl.children) {
      if (dt.tagName !== 'DT') continue
      const anchor = dt.querySelector(':scope > A')
      if (anchor) {
        const item = { id: uuid(), type: 'bookmark', url: anchor.getAttribute('href') || '', title: anchor.textContent.trim() || null }
        const icon = /^data:image\/png;base64,(.+)$/i.exec(anchor.getAttribute('icon') || '')
        if (icon) item.favicon = icon[1]
        const added = seconds(anchor.getAttribute('add_date'))
        if (added) item.dateAdded = added
        const modified = seconds(anchor.getAttribute('last_modified'))
        if (modified) item.lastModified = modified
        if (item.url) items.push(item)
        continue
      }
      const heading = dt.querySelector(':scope > H3')
      if (heading) {
        const folder = { id: uuid(), type: 'folder', title: heading.textContent.trim() || null, children: parseItems(dt.querySelector(':scope > DL')) }
        const added = seconds(heading.getAttribute('add_date'))
        if (added) folder.dateAdded = added
        const modified = seconds(heading.getAttribute('last_modified'))
        if (modified) folder.lastModified = modified
        items.push(folder)
      }
    }
    return items
  }
  return parseItems(doc.querySelector('DL'))
}

function netscapeBookmarkList (items, indent) {
  const escape = (text) => String(text).replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';')
  const pad = '    '.repeat(indent)
  let html = pad + '<DL><p>\n'
  for (const item of items || []) {
    const added = item.dateAdded ? Math.floor(item.dateAdded / 1000) : 0
    if (item.type === 'bookmark') {
      let attrs = 'HREF="' + escape(item.url) + '" ADD_DATE="' + added + '"'
      if (item.favicon) attrs += ' ICON="data:image/png;base64,' + item.favicon + '"'
      html += pad + '    <DT><A ' + attrs + '>' + escape(item.title || item.url) + '</A>\n'
    } else if (item.type === 'folder') {
      const modified = item.lastModified ? Math.floor(item.lastModified / 1000) : 0
      html += pad + '    <DT><H3 ADD_DATE="' + added + '" LAST_MODIFIED="' + modified + '">' + escape(item.title || 'Untitled Folder') + '</H3>\n'
      html += netscapeBookmarkList(item.children, indent + 1)
    }
  }
  return html + pad + '</DL><p>\n'
}

// ------------------------------------------------- preferences & adblock

// Ladybird's engines that Brave's list lacks.
const EXTRA_ENGINES = [
  { name: 'Brave', base: 'https://search.brave.com', shortcut: ':br' },
  { name: 'Ecosia', base: 'https://www.ecosia.org', shortcut: ':ec' },
  { name: 'Kagi', base: 'https://kagi.com', shortcut: ':kg' },
  { name: 'Mojeek', base: 'https://www.mojeek.com', shortcut: ':mj' },
  { name: 'Yandex', base: 'https://yandex.com', shortcut: ':ya' }
]

function addLadybirdEngines (engineNames) {
  const providers = searchProviders.providers
  const have = new Set(providers.map((p) => p.name.toLowerCase()))
  EXTRA_ENGINES.forEach((engine) => {
    if (have.has(engine.name.toLowerCase())) return
    if (engineNames && !engineNames.has(engine.name.toLowerCase())) return
    providers.push({
      name: engine.name,
      image: engine.base + '/favicon.ico',
      localImage: engine.base + '/favicon.ico',
      search: '',
      autocomplete: '',
      shortcut: engine.shortcut,
      base: engine.base
    })
  })
}

function preferences (ipc, pageUrl) {
  let current = {} // Ladybird's settings
  const local = {} // Brave settings changed on this page, until Ladybird reports them back
  let engines = null

  const deepMerge = (target, source) => {
    Object.keys(source || {}).forEach((k) => {
      const v = source[k]
      if (v && typeof v === 'object' && !Array.isArray(v) && target[k] && typeof target[k] === 'object') {
        deepMerge(target[k], v)
      } else {
        target[k] = v
      }
    })
    return target
  }

  const engineName = (name) => {
    if (!name || !engines) return name
    const match = engines.find((n) => n.toLowerCase() === String(name).toLowerCase())
    return match || name
  }

  const braveSettings = () => {
    const s = {}
    const search = current.searchEngine || {}
    if (search.engine) {
      const brave = searchProviders.providers.find((p) => p.name.toLowerCase() === String(search.engine).toLowerCase())
      s[settings.DEFAULT_SEARCH_ENGINE] = brave ? brave.name : search.engine
    }
    if (typeof search.suggestions === 'boolean') s[settings.OFFER_SEARCH_SUGGESTIONS] = search.suggestions
    if (typeof current.restorePreviousSession === 'boolean') {
      s[settings.STARTUP_MODE] = current.restorePreviousSession ? 'lastTime' : 'newTabPage'
    }
    if (current.newTabPageURL) s[settings.HOMEPAGE] = current.newTabPageURL
    const blockers = current.contentBlockers || {}
    if (typeof blockers.enabled === 'boolean') s['adblock.enabled'] = blockers.enabled
    Object.keys(blockers.builtInLists || {}).forEach((id) => {
      s['adblock.' + id + '.enabled'] = blockers.builtInLists[id]
    })
    if (typeof blockers.customFilters === 'string') s[settings.ADBLOCK_CUSTOM_RULES] = blockers.customFilters
    return Object.assign(s, current.brave || {}, local)
  }

  const emit = () => {
    const s = braveSettings()
    ipc.emit(messages.SETTINGS_UPDATED, e, s)
    if (pageUrl === 'about:adblock') {
      const blockers = current.contentBlockers || {}
      const resources = Object.keys(blockers.builtInLists || {}).map((id) => ({ uuid: id, title: id.replace(/[-_]/g, ' ') }))
      ;(blockers.customSubscriptions || []).forEach((list) => {
        resources.push({ uuid: list.identifier, title: list.url || list.identifier })
      })
      ;(blockers.localLists || []).forEach((list) => {
        resources.push({ uuid: list.identifier, title: list.name || list.identifier })
      })
      ipc.emit(messages.ADBLOCK_UPDATED, e, {
        adblock: { count: 0, lastCheckDate: Date.now() },
        settings: s,
        resources: resources
      })
    }
  }

  onMessage((name, data) => {
    if (name === 'loadSettings') {
      deepMerge(current, data || {})
      emit()
    } else if (name === 'loadEngines') {
      engines = ((data && data.search) || []).map((engine) => engine.name)
      addLadybirdEngines(new Set(engines.map((n) => n.toLowerCase())))
      emit()
    }
  })

  const changeSetting = (key, value) => {
    const search = current.searchEngine || {}
    switch (key) {
      case settings.DEFAULT_SEARCH_ENGINE: {
        const name = engineName(value)
        if (engines && engines.indexOf(name) === -1) break // not one Ladybird knows
        send('setSearchEngineSettings', { engine: name, suggestions: !!search.suggestions })
        return
      }
      case settings.OFFER_SEARCH_SUGGESTIONS:
        send('setSearchEngineSettings', { engine: search.engine || null, suggestions: !!value })
        return
      case settings.STARTUP_MODE:
        send('setRestorePreviousSession', value === 'lastTime')
        return
      case settings.HOMEPAGE:
        if (/^[a-z]+:/i.test(String(value))) send('setNewTabPageURL', String(value))
        break
      case settings.ADBLOCK_CUSTOM_RULES:
        send('setCustomContentBlockerFilters', String(value || ''))
        return
      case 'adblock.enabled':
        send('setContentBlockerEnabled', !!value)
        return
    }
    const list = /^adblock\.(.+)\.enabled$/.exec(key)
    if (list) {
      send('setContentBlockerListEnabled', { identifier: list[1], enabled: !!value })
      return
    }
    // Brave's own preferences: saved in Ladybird's settings, read by the chrome.
    local[key] = value
    send('setBraveSetting', { key: key, value: value === undefined ? null : value })
    emit()
  }

  aboutActions.changeSetting = changeSetting
  aboutActions.updateAdblockDataFiles = (uuid, enabled) => changeSetting('adblock.' + uuid + '.enabled', enabled)
  aboutActions.updateCustomAdblockRules = (rules) => changeSetting(settings.ADBLOCK_CUSTOM_RULES, rules)

  whenConnected(() => {
    send('loadAvailableEngines')
    send('loadCurrentSettings')
  })
}

// ------------------------------------------------------------------ entry

const HANDLERS = {
  'about:history': history,
  'about:downloads': downloads,
  'about:bookmarks': bookmarks,
  'about:preferences': preferences,
  'about:adblock': preferences
}

// Before the page mounts: install action overrides the components bind to.
let installed = null
module.exports.install = function (pageUrl, ipc) {
  const handler = HANDLERS[pageUrl]
  if (!handler) return false
  aboutActions.createTabRequested = (props) => openUrl(props && props.url)
  handler(ipc, pageUrl)
  installed = pageUrl
  return true
}

module.exports.handles = (pageUrl) => installed === pageUrl
module.exports.mounted = () => markMounted()
