import $ from 'jquery'
import psl from 'psl'
import nacl from 'tweetnacl'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

import { REXCondition, REXContentExtractor, REXPageElementRuleAction, REXPageManipulationConfiguration, REXPageManipulationObscurePage } from '@bric/rex-page-manipulation/service-worker'

// SHA-512 of `text` as a 128-char lowercase hex string. tweetnacl is a vetted
// crypto library REX already depends on (via rex-passive-data-kit) and works
// in any context — unlike crypto.subtle, which is undefined on insecure
// (plain-http) pages.
function sha512Hex(text:string):string {
  return Array.from(nacl.hash(new TextEncoder().encode(text)),
    (byte) => byte.toString(16).padStart(2, '0')).join('')
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
      const parsed = psl.parse(new URL(raw).hostname)

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

// Condition operations: each maps extracted content + the condition to a
// pass/fail. Bundled with the module; a registration hook for author-defined
// operations can later add to this map.
const CONDITION_OPERATIONS:{
  [operation: string]: (content:string, condition:REXCondition) => boolean
} = {
  // Passes iff hash.slice(use[0], use[1]) is within [lo, hi). Plain string
  // comparison of equal-length lowercase hex — no integer/float conversion.
  'calculate-sha512-hash': (content, condition) => {
    const use = condition.use
    const range = condition.within_range

    if (use === undefined || range === undefined) {
      return false
    }

    const slice = sha512Hex(content).slice(use[0], use[1])

    if (slice.length !== range[0].length || range[0].length !== range[1].length) {
      return false
    }

    return range[0] <= slice && slice < range[1]
  },
}

// Evaluates one condition. Returns whether it passed and the content it
// extracted (null if a configured extractor yielded nothing) — the content is
// reused for the exceptions veto and telemetry.
function evaluateCondition($el:JQuery<HTMLElement>, condition:REXCondition):{ pass:boolean, content:string | null } {
  const content = condition.content !== undefined ? extractContent($el, condition.content) : null

  if (content === null) {
    return { pass: false, content: null }
  }

  const operation = CONDITION_OPERATIONS[condition.operation]

  return { pass: operation !== undefined && operation(content, condition), content }
}

class PageManipulationModule extends REXClientModule {
  configuration?:REXPageManipulationConfiguration
  refreshTimeout:number = 0
  debug:boolean = false

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule'
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

  // Applies one add_class action to one matched element, recording telemetry
  // via the per-pass bump/pushDomain accumulators owned by applyConfiguration.
  applyAddClass(
    $element:JQuery<HTMLElement>,
    action:REXPageElementRuleAction,
    bump:(key:string) => void,
    pushDomain:(key:string, value:string) => void,
  ) {
    const className = action.class_name ?? 'hash_match'
    const eventKey = `${action.selector}::${className}`

    // Dedup marker keyed by selector::className — NOT by class name alone, so
    // two rules applying the same class via different selectors each run once.
    // Skipping re-processed elements keeps telemetry counts honest across
    // MutationObserver passes. Newline-separated since selectors may contain
    // spaces.
    const processed = ($element.attr('data-rex-class-processed') ?? '').split('\n').filter((key) => key !== '')

    if (processed.includes(eventKey)) {
      return
    }

    const markProcessed = () => $element.attr('data-rex-class-processed', [...processed, eventKey].join('\n'))

    const conditions = action.conditions ?? []

    if (conditions.length === 0) {
      $element.addClass(className)
      bump(`${eventKey}::applied`)
      markProcessed()
      return
    }

    const results = conditions.map((condition) => evaluateCondition($element, condition))

    // A configured content extractor yielded nothing (e.g. a `within`
    // descendant not yet in the DOM). Leave the element unmarked so a later
    // MutationObserver pass retries it once its content is available.
    if (results.some((result, index) => conditions[index].content !== undefined && result.content === null)) {
      return
    }

    const contents = results.map((result) => result.content).filter((content):content is string => content !== null)

    bump(`${eventKey}::evaluated`)
    markProcessed()

    // exceptions are an absolute veto, independent of conditions_match.
    const excepted = action.exceptions !== undefined
      ? contents.filter((content) => action.exceptions!.includes(content))
      : []

    if (excepted.length > 0) {
      excepted.forEach((content) => pushDomain(`${eventKey}::excepted`, content))
      return
    }

    const passed = action.conditions_match === 'any'
      ? results.some((result) => result.pass)
      : results.every((result) => result.pass)

    contents.forEach((content) => pushDomain(`${eventKey}::${passed ? 'matched' : 'unmatched'}`, content))

    if (passed) {
      $element.addClass(className)
      bump(`${eventKey}::matched`)
    }
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
        // Per-pass telemetry, sent once as a single page-manipulation logEvent.
        // Counts/lists are deltas — the marker attributes ensure each element
        // is acted on, and counted, only once across MutationObserver passes.
        const updates:{[key: string]: number} = {}
        const domains:{[key: string]: string[]} = {}

        const bump = (key:string) => {
          updates[key] = (updates[key] ?? 0) + 1
        }

        const pushDomain = (key:string, value:string) => {
          if (domains[key] === undefined) {
            domains[key] = []
          }

          domains[key].push(value)
        }

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

                      bump(`${action.selector}::hide`)
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

                      bump(`${action.selector}::show`)
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

                      bump(`${action.selector}::report`)
                    }

                    if (this.debug) {
                      console.log('[PageManipulation] Report element:')
                      console.log(action)
                      console.log($(element))
                    }
                  } else if (action.action == 'add_class') {
                    this.applyAddClass($(element), action, bump, pushDomain)
                  }
                })
              }
            } else {
              if (this.debug) {
                console.log(`[PageManipulation] Skip applying page manipulation rules to ${window.location.href}...`)
              }
            }
          }

          if (Object.keys(updates).length > 0 || Object.keys(domains).length > 0) {
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
        }
      }
    }
  }
}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
