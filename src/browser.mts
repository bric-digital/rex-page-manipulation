import $ from 'jquery'
import psl from 'psl'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

import { REXContentExtractor, REXPageManipulationConfiguration, REXPageManipulationObscurePage } from '@bric/rex-page-manipulation/service-worker'

// SHA-256 round constants (FIPS 180-4).
const SHA256_K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function rotr32(x:number, n:number):number {
  return (x >>> n) | (x << (32 - n))
}

// Pure-JS SHA-256 (FIPS 180-4). Produces the same lowercase hex digest as
// crypto.subtle.digest('SHA-256', ...) and Node's createHash('sha256'), but
// works in insecure (plain-http) contexts where crypto.subtle is undefined.
// Synchronous so the add_class hash gate needs no async boundary.
function sha256(cleartext:string):string {
  const bytes = new TextEncoder().encode(cleartext)

  // Pad to a multiple of 64 bytes: 0x80, then zeros, then a 64-bit big-endian
  // bit length. ((len + 8) >> 6 << 6) + 64 is the smallest such multiple.
  const paddedLength = ((bytes.length + 8) >> 6 << 6) + 64
  const buffer = new Uint8Array(paddedLength)
  buffer.set(bytes)
  buffer[bytes.length] = 0x80

  const view = new DataView(buffer.buffer)
  const bitLength = bytes.length * 8
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(paddedLength - 4, bitLength >>> 0)

  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const ch = (e & f) ^ (~e & g)
      const t1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const t2 = (S0 + maj) | 0

      h = g; g = f; f = e; e = (d + t1) | 0
      d = c; c = b; b = a; a = (t1 + t2) | 0
    }

    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0; h5 = (h5 + f) | 0; h6 = (h6 + g) | 0; h7 = (h7 + h) | 0
  }

  return [h0, h1, h2, h3, h4, h5, h6, h7]
    .map((word) => (word >>> 0).toString(16).padStart(8, '0'))
    .join('')
}

function extractContent($el:JQuery<HTMLElement>, extractor:REXContentExtractor):string | null {
  const $source = extractor.within ? $el.find(extractor.within).first() : $el

  if ($source.length === 0) {
    return null
  }

  let raw:string | undefined

  if (extractor.source === 'text') {
    raw = $source.text()
  } else if (extractor.source === 'attr' && extractor.name !== undefined) {
    raw = $source.attr(extractor.name)
  }

  if (raw === undefined || raw === null) {
    return null
  }

  if (extractor.transform === 'domain') {
    try {
      const hostname = new URL(raw).hostname
      const parsed = psl.parse(hostname)

      if (parsed.error !== undefined) {
        return null
      }

      // Registrable domain (eTLD+1) via the Public Suffix List, e.g.
      // "news.bbc.co.uk" -> "bbc.co.uk", "www.chase.com" -> "chase.com".
      return (parsed as psl.ParsedDomain).domain ?? null
    } catch {
      return null
    }
  }

  return raw
}

// Maps a hex hash to a uniform position in [0, 1) using its last `precision`
// hex chars. Precision is clamped to keep the integer within MAX_SAFE_INTEGER.
function hashPosition(hashHex:string, precision:number):number {
  const clampedPrecision = Math.max(1, Math.min(13, precision))
  const tail = parseInt(hashHex.slice(-clampedPrecision), 16)
  return tail / 16 ** clampedPrecision
}

class PageManipulationModule extends REXClientModule {
  configuration?:REXPageManipulationConfiguration
  refreshTimeout:number = 0
  debug:boolean = false

  // Telemetry accumulators. Survive across applyConfiguration passes and the
  // async hash boundary (unlike a per-pass local), then flush as a single
  // debounced logEvent. Both are deltas — reset to {} after each flush.
  // eventCounts: { key -> count }. eventDomains: { key -> [content, ...] }.
  eventCounts:{[key: string]: number} = {}
  eventDomains:{[key: string]: string[]} = {}
  flushTimeout:number = 0

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule'
  }

  scheduleFlush() {
    if (this.flushTimeout === 0) {
      this.flushTimeout = window.setTimeout(() => {
        this.flushTimeout = 0
        this.flushEvents()
      }, 500)
    }
  }

  recordEvent(key:string) {
    if (this.eventCounts[key] === undefined) {
      this.eventCounts[key] = 0
    }
    this.eventCounts[key] += 1

    this.scheduleFlush()
  }

  recordDomain(key:string, domain:string) {
    if (this.eventDomains[key] === undefined) {
      this.eventDomains[key] = []
    }
    this.eventDomains[key].push(domain)

    this.scheduleFlush()
  }

  flushEvents() {
    if ($.isEmptyObject(this.eventCounts) && $.isEmptyObject(this.eventDomains)) {
      return
    }

    const updates = this.eventCounts
    const domains = this.eventDomains
    this.eventCounts = {}
    this.eventDomains = {}

    if (this.debug) {
      console.log('[PageManipulation] Flushing telemetry:')
      console.log(updates)
      console.log(domains)
    }

    chrome.runtime.sendMessage({
      'messageType': 'logEvent',
      'event': {
        'name': 'page-manipulation',
        'url': window.location.href,
        'updates': updates,
        'domains': domains
      }
    })
  }

  loadConfiguration() {
    chrome.runtime.sendMessage({
      'messageType': 'fetchConfiguration',
    }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      // Retry until the config is in chrome.storage.local — the extension UI
      // writes it asynchronously and the page bundle can run before it lands.
      if (response === null || response === undefined) {
        window.setTimeout(() => this.loadConfiguration(), 250)
        return
      }

      const configuration = response as REXConfiguration

      this.configuration = ((configuration as any)['page_manipulation'] as REXPageManipulationConfiguration) // eslint-disable-line @typescript-eslint/no-explicit-any

      if (this.configuration === undefined) {
        window.setTimeout(() => this.loadConfiguration(), 250)
        return
      }

      if (this.debug) {
        console.log(`Got config...`)
        console.log(this.configuration)
      }

      const obscurePage = (this.configuration['obscure_page'] as REXPageManipulationObscurePage[])

      if (obscurePage !== undefined) {
        for (const obscure of obscurePage) {
          if (this.debug) {
            console.log(`Checking if obscure rule ${obscure.base_url} is active...`)
          }

          if (window.location.href.toLowerCase().includes(obscure.base_url.toLowerCase())) {

            if (this.debug) {
              console.log(`Initially obscuring ${window.location.href} for rule ${obscure.base_url}...`)
            }

            const body = document.querySelector('html')

            if (body !== null) {
              body.style.opacity = '0'

              if (obscure.delay !== undefined) {
                window.setTimeout(() => {
                  body.style.opacity = '1'
                }, obscure.delay)
              }
            }
          }
        }
      }

      if (this.refreshTimeout == 0) {
        this.refreshTimeout = window.setTimeout(() => {
          this.applyConfiguration()

          this.refreshTimeout = 0
        }, 250)
      }
    })
  }

  setup() {
    this.loadConfiguration()

    // Flush buffered telemetry before the page goes away — the 500ms debounced
    // flush would otherwise be discarded along with the content-script context
    // on a fast navigation or tab close. flushEvents() no-ops when the
    // accumulators are empty, so these handlers are cheap when there is nothing
    // to send. visibilitychange covers the mobile/background-tab case where
    // pagehide is not always delivered.
    window.addEventListener('pagehide', () => this.flushEvents())
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.flushEvents()
      }
    })

    new MutationObserver(() => {
        if (this.refreshTimeout == 0) {
          this.refreshTimeout = window.setTimeout(() => {
            this.applyConfiguration()

            this.refreshTimeout = 0
          }, 250)
        }
    }).observe(document, {subtree: true, childList: true});

    // Install custom jQuery selectors

    $.expr.pseudos.containsInsensitive = $.expr.createPseudo(function (query) {
      const queryUpper = query.toUpperCase()

      return function (elem) {
        return $(elem).text().toUpperCase().includes(queryUpper)
      }
    })

    $.expr.pseudos.containsInsensitiveAny = $.expr.createPseudo(function (queryItems) {
      queryItems = JSON.parse(queryItems)

      return function (elem) {
        for (const queryItem of queryItems) {
          const queryUpper = queryItem.toUpperCase()

          if ($(elem).text().toUpperCase().includes(queryUpper)) {
            return true
          }
        }

        return false
      }
    })

    $.expr.pseudos.imageAltTagContainsInsensitiveAny = $.expr.createPseudo(function (queryItems) {
      queryItems = JSON.parse(queryItems)

      return function (elem) {
        for (const queryItem of queryItems) {
          const queryUpper = queryItem.toUpperCase()

          const altText = $(elem).attr('alt')

          if (altText !== undefined && altText !== null) {
            if (altText.toUpperCase().includes(queryUpper)) {
              return true
            }
          }
        }

        return false
      }
    })

    $.expr.pseudos.withinPage = $.expr.createPseudo(function () {
      const width = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.documentElement.clientWidth)
      const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.documentElement.clientHeight)

      return function (elem) {
        const position = elem.getBoundingClientRect()

        if (position.x > width) {
          return false
        }

        if (position.y > height) {
          return false
        }

        if ((position.x + position.width) < 0) {
          return false
        }

        if ((position.y + position.height) < 0) {
          return false
        }

        return true
      }
    })

    $.expr.pseudos.cssIs = $.expr.createPseudo(function (definition) {
      const tokens = definition.split(':')

      const property = tokens[0].trim()
      const value = tokens[1].trim()

      return function (elem) {
        const actualValue = $(elem).css(property)

        return actualValue === value
      }
    })

    $.expr.pseudos.trimmedTextEquals = $.expr.createPseudo((pattern) => {
      return function(elem: Element) : boolean {
        const text:string = $(elem).text()

        if (text !== null) {
          const matches = text.match("^" + pattern + "$")

          return (matches !== null && matches.length > 0)
        }

        return false
      }
    })
  }

  applyConfiguration() {
    if (this.configuration !== undefined) {
      if (this.configuration['debug'] === true) {
        this.debug = true
      } else {
        this.debug = false
      }

      if (this.debug) {
        console.log(`[PageManipulation] Configuration:`)
        console.log(this.configuration)
      }

      if (this.configuration['enabled']) {
        if (this.configuration['page_elements'] !== undefined) {
          for (const elementRule of this.configuration['page_elements']) {
            const baseUrl = elementRule['base_url']

            if (baseUrl === undefined || window.location.href.toLowerCase().startsWith(baseUrl.toLowerCase())) {
              // Apply rule

              if (this.debug) {
                console.log(`Applying page manipulation rule to ${window.location.href}...`)
                console.log(elementRule)
              }

              for (const action of elementRule.actions) {
                if (this.debug) {
                  console.log(`Matches for ${action.selector}: ${$(action.selector).length}.`)
                }

                $(action.selector).each((index, element) => {
                  if (action.action === 'hide') {
                    if ($(element).attr('data-rex-prior-css-display') === undefined) {
                      const oldValue = $(element).css('display')

                      if (oldValue !== undefined) {
                        $(element).attr('data-rex-prior-css-display', oldValue)
                      }

                      $(element).css('display', 'none')

                      this.recordEvent(`${action.selector}::hide`)
                    }

                    if (this.debug) {
                      console.log('[PageManipulation] Hide element:')
                      console.log(action)
                      console.log($(element))
                    }
                  } else if (action.action == 'show') {
                    const originalValue = $(element).attr('data-rex-prior-css-display')

                    if (originalValue !== undefined) {
                      $(element).css('display', originalValue)
                      $(element).removeAttr('data-rex-prior-css-display')

                      this.recordEvent(`${action.selector}::show`)
                    } else {
                      $(element).css('display', '')
                    }

                    if (this.debug) {
                      console.log('[PageManipulation] Show element:')
                      console.log(action)
                      console.log($(element))
                    }
                  } else if (action.action == 'report') {
                    const originalValue = $(element).attr('data-rex-reported')

                    if (originalValue !== undefined) {
                      // Already recorded
                    } else {
                      $(element).attr('data-rex-reported', `${Date.now()}`)

                      this.recordEvent(`${action.selector}::report`)
                    }

                    if (this.debug) {
                      console.log('[PageManipulation] Report element:')
                      console.log(action)
                      console.log($(element))
                    }
                  } else if (action.action == 'add_class') {
                    const className = action.class_name ?? 'hash_match'
                    const debug = this.debug

                    // Dedup marker, keyed by selector::className — the same
                    // scope as the telemetry eventKey, NOT by class name alone.
                    // Two add_class rules may legitimately apply the same class
                    // via different selectors; each must run and record its own
                    // telemetry. Re-processing the same (element, rule) pair is
                    // skipped: it is idempotent and would otherwise double-count
                    // telemetry on every MutationObserver pass. Keys are
                    // newline-separated since a selector may contain spaces.
                    const eventKey = `${action.selector}::${className}`

                    const processedAttr = $(element).attr('data-rex-class-processed')
                    const processedKeys = (processedAttr !== undefined && processedAttr !== '')
                      ? processedAttr.split('\n')
                      : []

                    if (processedKeys.includes(eventKey)) {
                      return
                    }

                    // Mark the element only once a real decision is reached, so
                    // a transient extraction failure (below) does not poison it.
                    const markProcessed = () => {
                      processedKeys.push(eventKey)
                      $(element).attr('data-rex-class-processed', processedKeys.join('\n'))
                    }

                    if (action.content === undefined) {
                      $(element).addClass(className)

                      this.recordEvent(`${eventKey}::applied`)
                      markProcessed()

                      if (debug) {
                        console.log(`[PageManipulation] add_class | unconditional → +${className}`)
                      }

                      return
                    }

                    const content = extractContent($(element), action.content)
                    if (content === null) {
                      // Transient failure (e.g. a `within` descendant not yet
                      // inserted, or an empty/relative href). Leave the element
                      // unmarked so a later MutationObserver pass retries it
                      // once its content becomes available.
                      if (debug) {
                        console.log(`[PageManipulation] add_class | ${action.selector}: no content extracted, will retry`)
                      }
                      return
                    }

                    if (action.exceptions !== undefined && action.exceptions.includes(content)) {
                      this.recordDomain(`${eventKey}::excepted`, content)
                      markProcessed()

                      if (debug) {
                        console.log(`[PageManipulation] add_class | content="${content}" → skip (in exceptions list)`)
                      }
                      return
                    }

                    const fraction = action.fraction ?? 0.1
                    const offset = action.offset ?? 0
                    const precision = action.precision ?? 8

                    const position = hashPosition(sha256(content), precision)
                    const matched = position >= offset && position < offset + fraction

                    this.recordEvent(`${eventKey}::evaluated`)

                    if (debug) {
                      console.log(`[PageManipulation] add_class | content="${content}" pos=${position.toFixed(4)} window=[${offset.toFixed(4)}, ${(offset + fraction).toFixed(4)}) → ${matched ? `MATCH (+${className})` : 'skip'}`)
                    }

                    if (matched) {
                      $(element).addClass(className)

                      this.recordEvent(`${eventKey}::matched`)
                      this.recordDomain(`${eventKey}::matched`, content)
                    } else {
                      this.recordDomain(`${eventKey}::unmatched`, content)
                    }

                    markProcessed()
                  }
                })
              }
            } else {
              if (this.debug) {
                console.log(`[PageManipulation] Skip applying page manipulation rules to ${window.location.href}...`)
              }
            }
          }
        }
      }
    }
  }
}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
