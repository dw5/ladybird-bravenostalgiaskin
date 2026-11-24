/* Replaces app/renderer/components/frame/guestInstanceRenderer.js in the Ladybird
 * build: Ladybird renders page content in its own view, so the chrome draws none. */
const React = require('react')

class GuestInstanceRenderer extends React.Component {
  render () { return null }
}

module.exports = GuestInstanceRenderer
