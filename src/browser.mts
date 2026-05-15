import $ from 'jquery'
import psl from 'psl'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

import { REXContentExtractor, REXPageManipulationConfiguration, REXPageManipulationObscurePage } from '@bric/rex-page-manipulation/service-worker'

async function sha256(cleartext:string):Promise<string> {
  const msgUint8 = new TextEncoder().encode(cleartext)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hexBytes = new Uint8Array(hashBuffer)
  return Array.from(hexBytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
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

  // Telemetry accumulator. Counts survive across applyConfiguration passes and
  // the async hash boundary (unlike a per-pass local), then flush as a single
  // debounced logEvent. Counts are deltas — reset to {} after each flush.
  eventCounts:{[key: string]: number} = {}
  flushTimeout:number = 0

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule'
  }

  recordEvent(key:string) {
    if (this.eventCounts[key] === undefined) {
      this.eventCounts[key] = 0
    }
    this.eventCounts[key] += 1

    if (this.flushTimeout === 0) {
      this.flushTimeout = window.setTimeout(() => {
        this.flushTimeout = 0
        this.flushEvents()
      }, 500)
    }
  }

  flushEvents() {
    if ($.isEmptyObject(this.eventCounts)) {
      return
    }

    const updates = this.eventCounts
    this.eventCounts = {}

    if (this.debug) {
      console.log('[PageManipulation] Flushing telemetry:')
      console.log(updates)
    }

    chrome.runtime.sendMessage({
      'messageType': 'logEvent',
      'event': {
        'name': 'page-manipulation',
        'url': window.location.href,
        'updates': updates
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

                    // Marker is per-class-name, not per-element: distinct
                    // add_class rules adding different classes to the same
                    // element must each get a chance to run. Re-processing the
                    // same (element, class) pair is skipped — it would be
                    // idempotent and waste an async hash.
                    const processedAttr = $(element).attr('data-rex-class-processed')
                    const processedClasses = (processedAttr !== undefined && processedAttr !== '')
                      ? processedAttr.split(' ')
                      : []

                    if (processedClasses.includes(className)) {
                      return
                    }

                    processedClasses.push(className)
                    $(element).attr('data-rex-class-processed', processedClasses.join(' '))

                    const eventKey = `${action.selector}::${className}`

                    if (action.content === undefined) {
                      $(element).addClass(className)

                      this.recordEvent(`${eventKey}::applied`)

                      if (debug) {
                        console.log(`[PageManipulation] add_class | unconditional → +${className}`)
                      }

                      return
                    }

                    const content = extractContent($(element), action.content)
                    if (content === null) {
                      if (debug) {
                        console.log(`[PageManipulation] add_class | ${action.selector}: no content extracted, skipping element`)
                      }
                      return
                    }

                    if (action.exceptions !== undefined && action.exceptions.includes(content)) {
                      if (debug) {
                        console.log(`[PageManipulation] add_class | content="${content}" → skip (in exceptions list)`)
                      }
                      return
                    }

                    const fraction = action.fraction ?? 0.1
                    const offset = action.offset ?? 0
                    const precision = action.precision ?? 8

                    sha256(content).then((hash) => {
                      const position = hashPosition(hash, precision)
                      const matched = position >= offset && position < offset + fraction

                      this.recordEvent(`${eventKey}::evaluated`)

                      if (debug) {
                        console.log(`[PageManipulation] add_class | content="${content}" pos=${position.toFixed(4)} window=[${offset.toFixed(4)}, ${(offset + fraction).toFixed(4)}) → ${matched ? `MATCH (+${className})` : 'skip'}`)
                      }

                      if (matched) {
                        $(element).addClass(className)

                        this.recordEvent(`${eventKey}::matched`)
                      }
                    })
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
