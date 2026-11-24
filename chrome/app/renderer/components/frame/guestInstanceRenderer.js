/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/* STANDALONE EXTRACTION NOTE
 * The original component drove a Muon <webview>/guest-instance
 * (pooledWebviewDisplay.attachActiveTab). Muon has no plain-browser equivalent,
 * so here we render the active frame's content in a standard <iframe>:
 *   - http(s) URLs load directly (for sites that permit framing)
 *   - about:* maps to the locally-extracted about-page host (e.g. about:newtab
 *     -> /about-newtab.html) so the old about: UIs show through the shell
 * This is the single Muon seam the plan calls out; everything else is intact.
 */

const React = require('react')
const {StyleSheet, css} = require('aphrodite/no-important')

const ReduxComponent = require('../reduxComponent')
const frameStateUtil = require('../../../../js/state/frameStateUtil')
const {getCurrentWindowId, isFocused} = require('../../currentWindow')

// about:* URLs that we shipped as extracted host pages
const ABOUT_HOST_PAGES = {
  'about:newtab': '/about-newtab.html',
  'about:preferences': '/about-preferences.html',
  'about:bookmarks': '/about-bookmarks.html',
  'about:history': '/about-history.html',
  'about:downloads': '/about-downloads.html',
  'about:passwords': '/about-passwords.html',
  'about:extensions': '/about-extensions.html',
  'about:styles': '/about-styles.html',
  'about:brave': '/about-brave.html'
}

function resolveSrc (location) {
  if (!location || location === 'about:blank') return null
  const base = location.split(/[?#]/)[0]
  if (ABOUT_HOST_PAGES[base]) return ABOUT_HOST_PAGES[base]
  if (/^https?:\/\//.test(location)) return location
  // Unknown scheme (data:, chrome:, magnet:, ...) — leave to the placeholder.
  return null
}

class GuestInstanceRenderer extends React.Component {
  mergeProps (state, ownProps) {
    const frameKey = ownProps.frameKey
    const frame = frameStateUtil.getFrameByKey(state.get('currentWindow'), frameKey)
    const location = frame && frame.get('location')
    return {
      frameKey,
      tabId: frame && frame.get('tabId'),
      frameLocation: location,
      isDefaultNewTabLocation: location === 'about:newtab',
      isBlankLocation: location === 'about:blank' || location == null,
      windowIsFocused: isFocused(state)
    }
  }

  render () {
    const src = resolveSrc(this.props.frameLocation)
    return (
      <div
        className={css(
          styles.guestInstanceRenderer,
          this.props.isDefaultNewTabLocation && styles.guestInstanceRenderer_isDefaultNewTabLocation,
          this.props.isBlankLocation && styles.guestInstanceRenderer_isBlankLocation
        )}
      >
        {src
          ? <iframe
            className={css(styles.guestInstanceRenderer__iframe)}
            src={src}
            sandbox='allow-scripts allow-forms allow-same-origin allow-popups'
            title={this.props.frameLocation}
          />
          : <div className={css(styles.guestInstanceRenderer__placeholder)}>
            <div className={css(styles.guestInstanceRenderer__placeholderInner)}>
              <div className={css(styles.guestInstanceRenderer__placeholderTitle)}>Brave Legacy UI</div>
              <div>{this.props.frameLocation || 'about:blank'}</div>
              <div className={css(styles.guestInstanceRenderer__placeholderHint)}>
                (Muon &lt;webview&gt; content area — replaced by an &lt;iframe&gt; in the standalone build)
              </div>
            </div>
          </div>
        }
      </div>
    )
  }
}

const styles = StyleSheet.create({
  guestInstanceRenderer: {
    display: 'flex',
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    '--frame-bg': '#fff',
    backgroundColor: 'var(--frame-bg)'
  },

  guestInstanceRenderer_isDefaultNewTabLocation: {
    '--frame-bg': '#222'
  },

  guestInstanceRenderer_isBlankLocation: {
    '--frame-bg': '#fff'
  },

  guestInstanceRenderer__iframe: {
    flex: 1,
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    right: 0,
    zIndex: 10,
    width: '100%',
    height: '100%',
    backgroundColor: 'var(--frame-bg)',
    border: 0,
    outline: 'none'
  },

  guestInstanceRenderer__placeholder: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'var(--frame-bg)',
    color: '#bbb',
    fontFamily: 'sans-serif'
  },

  guestInstanceRenderer__placeholderInner: {
    textAlign: 'center',
    lineHeight: '1.8'
  },

  guestInstanceRenderer__placeholderTitle: {
    fontSize: '20px',
    color: '#ff5000',
    marginBottom: '8px'
  },

  guestInstanceRenderer__placeholderHint: {
    fontSize: '12px',
    color: '#888',
    marginTop: '12px'
  }
})

module.exports = ReduxComponent.connect(GuestInstanceRenderer)
