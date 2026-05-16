import nacl from 'tweetnacl'
import psl from 'psl'

// MUST match the hrefs in tests/src/links.html, in the same order.
const LINKS = [
  'https://google.com',
  'https://wikipedia.org',
  'https://github.com',
  'https://stackoverflow.com',
  'https://reddit.com',
  'https://youtube.com',
  'https://amazon.com',
  'https://twitter.com',
  'https://facebook.com',
  'https://instagram.com',
  'https://linkedin.com',
  'https://nytimes.com',
  'https://wsj.com',
  'https://bbc.com',
  'https://cnn.com',
  'https://npr.org',
  'https://theguardian.com',
  'https://washingtonpost.com',
  'https://bloomberg.com',
  'https://ft.com',
  'https://economist.com',
  'https://nature.com',
  'https://science.org',
  'https://arxiv.org',
  'https://nber.org',
  'https://ssrn.com',
  'https://jstor.org',
  'https://stripe.com',
  'https://shopify.com',
  'https://airbnb.com',
  'https://uber.com',
  'https://lyft.com',
  'https://netflix.com',
  'https://spotify.com',
  'https://apple.com',
  'https://microsoft.com',
  'https://openai.com',
  'https://anthropic.com',
  'https://huggingface.co',
  'https://kaggle.com',
  'https://duckduckgo.com',
  'https://bing.com',
  'https://yahoo.com',
  'https://yandex.ru',
  'https://baidu.com',
  'https://www.tesco.co.uk',
  'https://stanford.edu',
  'https://harvard.edu',
  'https://mit.edu',
  'https://berkeley.edu',
]

// Reference reimplementation of the browser-side condition logic, so the
// hardcoded expectations in browser.spec.js stay verifiable. tweetnacl and psl
// are isomorphic — this produces the same values as the extension's bundle.

// extractContent's transform: "domain" — registrable domain (eTLD+1) via PSL.
function registrableDomain(href) {
  const parsed = psl.parse(new URL(href).hostname)
  return parsed.error !== undefined ? null : parsed.domain
}

// The calculate-sha512-hash operation: SHA-512 of `content` as lowercase hex.
function sha512Hex(content) {
  const bytes = nacl.hash(new TextEncoder().encode(content))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}

// A single condition passes iff hash.slice(use[0], use[1]) is in [lo, hi).
function conditionPasses(href, use, [lo, hi]) {
  const domain = registrableDomain(href)
  if (domain === null) return false
  const slice = sha512Hex(domain).slice(use[0], use[1])
  return lo <= slice && slice < hi
}

const indicesWhere = (predicate) =>
  LINKS.map((href, i) => (predicate(href) ? i : -1)).filter((i) => i >= 0)

// R2/R3 (single condition) and R4 (same, minus the youtube.com exception).
const range = indicesWhere((h) => conditionPasses(h, [0, 8], ['00000000', '40000000']))
// R5/R6 — two independent conditions on disjoint hash slices.
const condA = (h) => conditionPasses(h, [0, 8], ['00000000', '80000000'])
const condB = (h) => conditionPasses(h, [8, 16], ['00000000', '80000000'])

console.log('registrable domains:', JSON.stringify(LINKS.map(registrableDomain)))
console.log('single range [00000000,40000000):', JSON.stringify(range))
console.log('exception (range minus wikipedia.org):',
  JSON.stringify(range.filter((i) => registrableDomain(LINKS[i]) !== 'wikipedia.org')))
console.log('conditions_match all (condA AND condB):',
  JSON.stringify(indicesWhere((h) => condA(h) && condB(h))))
console.log('conditions_match any (condA OR condB):',
  JSON.stringify(indicesWhere((h) => condA(h) || condB(h))))
