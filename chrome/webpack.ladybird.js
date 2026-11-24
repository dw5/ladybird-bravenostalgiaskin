/* Build of the Brave UI for Ladybird.
 *
 * Reuses webpack.config.js, but:
 *  - no code splitting: each bundle is one file;
 *  - every image/font is inlined as a data: URI, so Ladybird only has to serve
 *    scripts from resource://ladybird/about-pages/brave/;
 *  - the <iframe> content area is replaced by a null component.
 * Two bundles, each a single file:
 *  - brave-chrome.js: the tab strip + navbar (about:brave-chrome);
 *  - brave-about.js:  Brave's own about: pages (about:brave, about:preferences, ...).
 * Output: dist-ladybird/
 */

const path = require('path')
const webpack = require('webpack')
const base = require('./webpack.config.js')

const shim = path.resolve(__dirname, 'harness', 'muonShim.js')

const bundle = (name, entryFile) => Object.assign({}, base, {
  devtool: false,
  cache: false,
  entry: {
    [name]: [shim, path.resolve(__dirname, 'harness', 'ladybird', entryFile)]
  },
  output: {
    path: path.resolve(__dirname, 'dist-ladybird'),
    filename: '[name].js',
    publicPath: 'resource://ladybird/about-pages/brave/'
  },
  module: {
    rules: base.module.rules
      .filter((rule) => !String(rule.test).includes('woff'))
      .concat([{
        test: /\.(woff(2)?|ttf|eot|svg|png|jpg|gif)(\?.*)?$/,
        loader: 'url-loader',
        options: { limit: 100000000 }
      }])
  },
  plugins: [
    new webpack.IgnorePlugin(/^\.\/stores\/appStore$/),
    new webpack.NormalModuleReplacementPlugin(
      /frame[\\/]guestInstanceRenderer(\.js)?$/,
      path.resolve(__dirname, 'harness', 'ladybird', 'noGuestInstance.js')
    ),
    new webpack.optimize.LimitChunkCountPlugin({ maxChunks: 1 }),
    new webpack.DefinePlugin({
      'process.env': { NODE_ENV: JSON.stringify('production'), BRAVE_PORT: 0 }
    })
  ],
  devServer: undefined
})

module.exports = [
  bundle('brave-chrome', 'boot.js'),
  bundle('brave-about', 'aboutBoot.js')
]
