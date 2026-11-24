/* Boot for the Brave chrome running inside Ladybird as about:brave-chrome.
 *
 * Like harness/localBoot.js, but tab state comes from Ladybird over the WebUI
 * bridge (./bridge.js) instead of mock fixtures. Non-tab app state (bookmarks,
 * settings) is still seeded from harness/mockState/appState.js.
 */

require('../../less/window.less')
require('../../less/button.less')
require('../../less/navigationBar.less')
require('../../less/forms.less')
require('../../less/downloadBar.less')
require('../../less/notificationBar.less')
require('font-awesome/css/font-awesome.css')
require('./ladybird.css')

const React = require('react')
const ReactDOM = require('react-dom')
const Immutable = require('immutable')

const Window = require('../../app/renderer/components/window')
const windowStore = require('../../js/stores/windowStore')
const appStoreRenderer = require('../../js/stores/appStoreRenderer')
const appActions = require('../../js/actions/appActions')
const currentWindow = require('../../app/renderer/currentWindow')
const bridge = require('./bridge')
const l10n = require('./l10n')

const appState = require('../mockState/appState')
const windowState = require('../mockState/windowState')

const WINDOW_ID = 1

function mount () {
  ReactDOM.render(React.createElement(Window), document.getElementById('appContainer'))
}

function boot () {
  // Tells the patched components they are hosted by Ladybird (custom caption buttons).
  window.braveNostalgia = true
  currentWindow.setWindowId(WINDOW_ID)
  l10n.start()

  // Start from the fixtures, minus their fake tabs; Ladybird sends the real ones.
  appStoreRenderer.state = Immutable.fromJS(appState).merge({
    // browser-laptop counts down to its own end of life from this date; push it far away.
    deprecatedOn: Date.now() + 100 * 365 * 24 * 60 * 60 * 1000,
    tabs: Immutable.List(),
    tabsInternal: Immutable.fromJS({ index: {}, displayIndex: {}, displayIndexInternal: {} })
  })
  windowStore.state = Immutable.fromJS(windowState).merge({
    activeFrameKey: null,
    frames: Immutable.List(),
    tabs: Immutable.List(),
    framesInternal: Immutable.fromJS({ index: {}, tabIndex: {} })
  })

  try { appActions.windowReady(WINDOW_ID, { id: WINDOW_ID }) } catch (e) {}

  // <Window/> assumes at least one tab, so mount on the first tab list.
  bridge.start(mount)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
