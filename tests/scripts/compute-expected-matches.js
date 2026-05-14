import { createHash } from 'node:crypto'

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
  'https://wharton.upenn.edu',
  'https://stanford.edu',
  'https://harvard.edu',
  'https://mit.edu',
  'https://berkeley.edu',
]

const FRACTION = 0.2
const PRECISION = 8

const matches = []
LINKS.forEach((href, i) => {
  const hostname = new URL(href).hostname.replace(/^www\./, '')
  const hash = createHash('sha256').update(hostname).digest('hex')
  const tail = parseInt(hash.slice(-PRECISION), 16)
  if (tail / 16 ** PRECISION < FRACTION) matches.push(i)
})

console.log(JSON.stringify(matches))
