import { createHash } from 'node:crypto'
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

const PRECISION = 8

// Reference reimplementation of extractContent's transform: "domain" —
// the registrable domain (eTLD+1) via the Public Suffix List.
function registrableDomain(href) {
  const hostname = new URL(href).hostname
  const parsed = psl.parse(hostname)
  if (parsed.error !== undefined) return null
  return parsed.domain
}

// An element is classed iff its hash position in [0,1) falls in the
// half-open window [offset, offset + fraction).
function matchesFor(offset, fraction, precision) {
  const matches = []
  LINKS.forEach((href, i) => {
    const domain = registrableDomain(href)
    if (domain === null) return
    const hash = createHash('sha256').update(domain).digest('hex')
    const position = parseInt(hash.slice(-precision), 16) / 16 ** precision
    if (position >= offset && position < offset + fraction) matches.push(i)
  })
  return matches
}

console.log('registrable domains:', JSON.stringify(LINKS.map(registrableDomain)))
console.log('offset=0.0 fraction=0.2:', JSON.stringify(matchesFor(0.0, 0.2, PRECISION)))
console.log('offset=0.2 fraction=0.2:', JSON.stringify(matchesFor(0.2, 0.2, PRECISION)))
