/* Stand-in for l20n in the Ladybird build.
 *
 * browser-laptop marks localized text with data-l10n-id (and data-l10n-args)
 * and lets l20n fill it in from .properties files fetched at runtime. Ladybird
 * serves the pages from resource://, so instead fill them in here from the
 * en-US strings already bundled as harness/translations.js. `<id>.<attr>` keys
 * (title, placeholder, ...) become attributes, as in l20n.
 */
const translations = require('../translations')

const ATTRIBUTES = ['title', 'placeholder', 'label', 'value', 'aria-label', 'alt']

function substitute (text, args) {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, key) => (args[key] != null ? String(args[key]) : match))
}

// l20n plurals: `key={[plural(count)]}` with `key[one]=...` and `key[other]=...`.
// The same key can name a different count variable in another file, so fall
// back to the first number in the arguments.
const PLURAL = /^\{\[\s*plural\((\w+)\)\s*\]\}$/
function resolve (id, args) {
  const text = translations[id]
  const plural = text != null && PLURAL.exec(text)
  if (!plural) return text
  let n = args[plural[1]]
  if (typeof n !== 'number') {
    const first = Object.keys(args).map((k) => args[k]).find((v) => typeof v === 'number')
    n = first !== undefined ? first : 0
  }
  const variant = translations[id + '[' + (n === 1 ? 'one' : 'other') + ']']
  return variant != null ? variant : translations[id + '[other]']
}

function localize (el) {
  const id = el.getAttribute('data-l10n-id')
  if (!id) return

  let args = {}
  try { args = JSON.parse(el.getAttribute('data-l10n-args') || '{}') || {} } catch (e) {}

  const text = resolve(id, args)
  // Only fill leaf elements; React owns anything with children.
  if (text != null && el.children.length === 0) {
    const value = substitute(text, args)
    if (el.textContent !== value) el.textContent = value
  }
  for (const attr of ATTRIBUTES) {
    const value = translations[id + '.' + attr]
    if (value != null) {
      const v = substitute(value, args)
      if (el.getAttribute(attr) !== v) el.setAttribute(attr, v)
    }
  }
}

function localizeTree (root) {
  if (root.nodeType !== 1) return
  if (root.hasAttribute('data-l10n-id')) localize(root)
  root.querySelectorAll('[data-l10n-id]').forEach(localize)
}

exports.start = function () {
  const run = () => {
    localizeTree(document.body)
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        if (m.type === 'attributes') localize(m.target)
        else m.addedNodes.forEach(localizeTree)
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-l10n-id', 'data-l10n-args']
    })
  }
  if (document.body) run()
  else document.addEventListener('DOMContentLoaded', run)
}
