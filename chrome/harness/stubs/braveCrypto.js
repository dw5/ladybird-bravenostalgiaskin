/* Minimal stand-in for the native `brave-crypto` package.
 *
 * The UI only touches a small surface at render time: random.uniform(n) (used
 * by randomUtil and the about:preferences backup hint picker). The wallet /
 * passphrase crypto was a main-process / ledger concern and is not exercised by
 * the standalone shell, so those are inert. Math.random is fine here — this is a
 * UI memorial, not a wallet.
 */
'use strict'

module.exports = {
  random: {
    // uniform(max) -> integer in [0, max)
    uniform: function (max) { return Math.floor(Math.random() * max) },
    // uint8(n) -> n random bytes
    uint8: function (n) {
      const out = new Uint8Array(n || 0)
      for (let i = 0; i < out.length; i++) out[i] = Math.floor(Math.random() * 256)
      return out
    }
  },
  passphrase: {
    fromBytesOrHex: function () { return '' },
    toBytes32: function () { return new Uint8Array(32) },
    BIP39: 'bip39',
    NICEWARE: 'niceware'
  },
  getSeed: function () { return new Uint8Array(32) },
  deriveSigningKeysFromSeed: function () { return {} },
  uint8ToHex: function (arr) {
    return Array.prototype.map.call(arr || [], function (b) {
      return ('0' + (b & 0xff).toString(16)).slice(-2)
    }).join('')
  }
}
