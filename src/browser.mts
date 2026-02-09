import $ from 'jquery'

import { REXConfiguration } from '@bric/rex-core/extension'

import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

class PageManipulationModule extends REXClientModule {
  configuration:object
  refreshTimeout:number = 0
  debug:boolean = false

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule'
  }

  setup() {
    chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as REXConfiguration

        this.configuration = configuration['page_manipulation']

        if (this.configuration['obscure_page'] !== undefined) {
          for (const obscure of this.configuration['obscure_page']) {
            if (window.location.href.toLowerCase().includes(obscure['base_url'].toLowerCase())) {
              const body = document.querySelector('html')

              body.style.opacity = '0.0'

              if (obscure['delay'] !== undefined) {
                window.setTimeout(() => {
                  body.style.opacity = '1.0'
                }, obscure['delay'] as number)
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
        return ($(elem).text().match("^" + pattern + "$").length > 0)
      }
    })
  }

  applyConfiguration() {
    if (this.configuration['debug'] === true) {
      this.debug = true
    } else {
      this.debug = false
    }

    if (this.debug) {
      console.log(`[PageManipulation] Configuration:`)
      console.log(this.configuration)
    }

    if ([null, undefined].includes(this.configuration)) {
      return
    }

    if (this.configuration['enabled']) {
      const blockedCount = {}

      for (const elementRule of this.configuration['page_elements']) {
        const baseUrl = elementRule['base_url']

        if (baseUrl === undefined || window.location.href.toLowerCase().startsWith(baseUrl.toLowerCase())) {
          // Apply rule

          if (this.debug) {
            console.log(`Applying page manipulation rules to ${window.location.href}...`)
          }

          for (const action of elementRule.actions) {
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
              }
            })
          }
        } else {
          if (this.debug) {
            console.log(`[PageManipulation] Skip applying page manipulation rules to ${window.location.href}...`)
          }
        }
      }

      window.setTimeout(() => {
        const body = document.querySelector('html')

        body.style.opacity = '1.0'
      }, 100)

      if ($.isEmptyObject(blockedCount) === false) {
        chrome.runtime.sendMessage({
          'messageType': 'logEvent',
          'event': {
            'name': 'page-manipulation',
            'updates': blockedCount
          }
        })
      }
    }
  }
}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
