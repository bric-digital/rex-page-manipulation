import $ from 'jquery'

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
  let raw:string | undefined

  if (extractor.source === 'text') {
    raw = $el.text()
  } else if (extractor.source === 'attr' && extractor.name !== undefined) {
    raw = $el.attr(extractor.name)
  }

  if (raw === undefined || raw === null) {
    return null
  }

  if (extractor.transform === 'domain') {
    try {
      return new URL(raw).hostname.replace(/^www\./, '')
    } catch {
      return null
    }
  }

  return raw
}

function hashMatchesFraction(hashHex:string, fraction:number, precision:number):boolean {
  const clampedPrecision = Math.max(1, Math.min(13, precision))
  const tail = parseInt(hashHex.slice(-clampedPrecision), 16)
  return tail / 16 ** clampedPrecision < fraction
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
        const blockedCount:{[key: string]: number} = {}

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

                      const key = `${action.selector}:hide`

                      if (blockedCount[key] === undefined) {
                        blockedCount[key] = 0
                      }

                      blockedCount[key] += 1
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

                      const key = `${action.selector}:show`

                      if (blockedCount[key] === undefined) {
                        blockedCount[key] = 0
                      }

                      blockedCount[key] += 1
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

                    const key = `${action.selector}:report`

                    if (originalValue !== undefined) {
                      // Already recorded
                    } else {
                      $(element).attr('data-rex-reported', `${Date.now()}`)

                      if (blockedCount[key] === undefined) {
                        blockedCount[key] = 0
                      }

                      blockedCount[key] += 1
                    }

                    if (this.debug) {
                      console.log('[PageManipulation] Report element:')
                      console.log(action)
                      console.log($(element))
                    }
                  } else if (action.action == 'add_class') {
                    if ($(element).attr('data-rex-class-processed') !== undefined) {
                      return
                    }
                    $(element).attr('data-rex-class-processed', `${Date.now()}`)

                    const className = action.class_name ?? 'hash_match'
                    const key = `${action.selector}:add_class`
                    const debug = this.debug

                    if (action.content === undefined) {
                      $(element).addClass(className)

                      if (blockedCount[key] === undefined) {
                        blockedCount[key] = 0
                      }
                      blockedCount[key] += 1

                      if (debug) {
                        console.log('[PageManipulation] add_class (unconditional):')
                        console.log(action)
                        console.log($(element))
                      }

                      return
                    }

                    const content = extractContent($(element), action.content)
                    if (content === null) {
                      return
                    }

                    const fraction = action.fraction ?? 0.1
                    const precision = action.precision ?? 8

                    sha256(content).then((hash) => {
                      if (hashMatchesFraction(hash, fraction, precision)) {
                        $(element).addClass(className)

                        if (blockedCount[key] === undefined) {
                          blockedCount[key] = 0
                        }
                        blockedCount[key] += 1

                        if (debug) {
                          console.log(`[PageManipulation] add_class (hash match, ${content} → ${hash.slice(-precision)}):`)
                          console.log(action)
                          console.log($(element))
                        }
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

          if ($.isEmptyObject(blockedCount) === false) {
            chrome.runtime.sendMessage({
              'messageType': 'logEvent',
              'event': {
                'name': 'page-manipulation',
                'url': window.location.href,
                'updates': blockedCount
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
