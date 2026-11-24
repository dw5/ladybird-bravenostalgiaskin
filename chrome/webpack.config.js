/* Standalone build config for the extracted Brave (Muon) UI.
 * Adapted from browser-laptop/webpack.config.js.
 *
 * Differences from the original:
 *  - The Muon shim (harness/muonShim.js) is prepended to every entry so the
 *    `chrome` / `muon` / `process` globals exist before any bundled code runs.
 *  - Entry `app` points at harness/localBoot.js (our stand-in for js/entry.js),
 *    which seeds the stores from fixtures instead of receiving state over IPC.
 *  - Output goes to public/gen/ and is served by webpack-dev-server.
 *  - Native / main-process-only modules are aliased to an empty stub as they
 *    surface (see resolve.alias below).
 */

const path = require('path')
const webpack = require('webpack')

const isProd = process.env.NODE_ENV === 'production'
const env = isProd ? 'production' : 'development'
const port = 8080

const shim = path.resolve(__dirname, 'harness', 'muonShim.js')
const emptyStub = path.resolve(__dirname, 'harness', 'stubs', 'empty.js')
const braveCryptoStub = path.resolve(__dirname, 'harness', 'stubs', 'braveCrypto.js')

module.exports = {
  target: 'web',
  devtool: isProd ? '#source-map' : '#cheap-module-source-map',
  cache: true,
  entry: {
    // Phase A — all about:* pages (code-split via dynamic import in js/about/entry.js)
    aboutPages: [shim, path.resolve(__dirname, 'js', 'about', 'entry.js')],
    // Phase B — the full classic browser chrome shell
    app: [shim, path.resolve(__dirname, 'harness', 'localBoot.js')]
  },
  output: {
    path: path.resolve(__dirname, 'public', 'gen'),
    filename: '[name].entry.js',
    chunkFilename: '[name].chunk.js',
    publicPath: '/gen/'
  },
  module: {
    rules: [
      {
        test: /\.js?$/,
        exclude: [
          /node_modules/,
          /\.min\.js$/,
          path.resolve(__dirname, 'app', 'browser'),
          path.resolve(__dirname, 'app', 'extensions')
        ],
        loader: 'babel-loader',
        options: { cacheDirectory: true }
      },
      { test: /\.less$/, loader: 'style-loader!css-loader?-minimize!less-loader' },
      { test: /\.css$/, loader: 'style-loader!css-loader?-minimize' },
      {
        test: /\.woff2?(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        include: path.resolve(__dirname, 'fonts'),
        loader: 'file-loader',
        options: { name: '[name]-[hash].[ext]' }
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg|png|jpg)(\?v=[0-9]\.[0-9]\.[0-9])?$/,
        exclude: path.resolve(__dirname, 'fonts'),
        loader: 'url-loader',
        options: { limit: 10000 }
      }
    ]
  },
  resolve: {
    extensions: ['.js', '.jsx'],
    alias: {
      // Native / main-process-only / torrent modules the UI transitively touches
      // but does not actually need to render standalone. Stubbed to an empty
      // module. (Extend this list as webpack reports unresolved requires.)
      'brave-crypto': braveCryptoStub,
      'immutablepatch': emptyStub,
      // main-process locale compiler (L20n.Env); renderer only uses the pure
      // translationReplace() helper from app/locale.js, never L20n itself
      'l20n': emptyStub,
      'bloodhound-js': emptyStub,
      'parse-torrent': emptyStub,
      'webtorrent-remote/client': emptyStub,
      'react-addons-perf': emptyStub
    }
  },
  externals: {
    // require('electron') resolves to the global `chrome` object (our shim)
    'electron': 'chrome'
  },
  plugins: [
    // Renderer never needs the main-process appStore
    new webpack.IgnorePlugin(/^\.\/stores\/appStore$/),
    new webpack.DefinePlugin({
      'process.env': {
        NODE_ENV: JSON.stringify(env),
        BRAVE_PORT: port
      }
    })
  ].concat(isProd ? [] : [new webpack.HotModuleReplacementPlugin()]),
  node: {
    process: false,
    __filename: true,
    __dirname: true,
    fs: 'empty',
    child_process: 'empty',
    net: 'empty',
    tls: 'empty'
  },
  devServer: {
    contentBase: path.resolve(__dirname, 'public'),
    publicPath: '/gen/',
    hot: true,
    inline: true,
    port: port,
    headers: { 'Access-Control-Allow-Origin': '*' },
    stats: { colors: true, chunks: false, children: false }
  }
}
