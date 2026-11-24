/* Standalone boot for the classic Brave browser chrome (Phase B).
 *
 * Stand-in for browser-laptop/js/entry.js: instead of receiving window/app
 * state over Muon IPC, we seed the two stores from local fixtures and mount
 * <Window/>. All the IPC bootstrap (INITIALIZE_WINDOW, shared_memory,
 * registerAllWindowTabEvents, shortcut channels, frame tracker) is dropped —
 * none of it is needed to render the shell.
 */

// Stylesheets (same set js/entry.js pulls in for the main window)
require('../less/window.less')
require('../less/button.less')
require('../less/navigationBar.less')
require('../less/forms.less')
require('../less/downloadBar.less')
require('../less/notificationBar.less')
require('font-awesome/css/font-awesome.css')

const React = require('react')
const ReactDOM = require('react-dom')
const Immutable = require('immutable')

const Window = require('../app/renderer/components/window')
const windowStore = require('../js/stores/windowStore')
const appStoreRenderer = require('../js/stores/appStoreRenderer')
const appActions = require('../js/actions/appActions')
const l10n = require('../js/l10n')
const currentWindow = require('../app/renderer/currentWindow')

const appState = require('./mockState/appState')
const windowState = require('./mockState/windowState')

const WINDOW_ID = 1

function boot () {
  l10n.init()
  currentWindow.setWindowId(WINDOW_ID)

  appStoreRenderer.state = Immutable.fromJS(appState)
  windowStore.state = Immutable.fromJS(windowState)

  // Let window-local reducers know the window exists (mirrors windowReady).
  try { appActions.windowReady(WINDOW_ID, { id: WINDOW_ID }) } catch (e) {}

  ReactDOM.render(
    React.createElement(Window),
    document.getElementById('appContainer')
  )
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot)
} else {
  boot()
}
