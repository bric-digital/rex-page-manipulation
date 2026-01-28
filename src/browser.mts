import $ from 'jquery'

import { WebmunkConfiguration } from '@bric/webmunk-core/extension'

import { WebmunkClientModule, registerWebmunkModule } from '@bric/webmunk-core/browser'

class PageManipulationModule extends WebmunkClientModule {
  configuration: object
  refreshTimeout: number = 0

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule (overrride in subclasses)'
  }

  setup() {
    chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as WebmunkConfiguration

        this.configuration = configuration['page_manipulation']

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
    console.log('PageManipulationModule.applyConfiguration')

    if ([null, undefined].includes(this.configuration)) {
      return
    }

    if (this.configuration['enabled']) {
      const blockedCount = {}

      for (const elementRule of this.configuration['page_elements']) {
        const baseUrl = elementRule['base_url']

        if (baseUrl === undefined || window.location.href.toLowerCase().startsWith(baseUrl.toLowerCase())) {
          // Apply rule

          for (const action of elementRule.actions) {
            $(action.selector).each((index, element) => {
              if (action.action === 'hide') {
                if ($(element).attr('data-webmunk-prior-css-display') === undefined) {
                  const oldValue = $(element).css('display')

                  if (oldValue !== undefined) {
                    $(element).attr('data-webmunk-prior-css-display', oldValue)
                  }

                  $(element).css('display', 'none')

                  const key = `${action.selector}:hide`

                  if (blockedCount[key] === undefined) {
                    blockedCount[key] = 0
                  }

                  blockedCount[key] += 1
                }

                console.log('hide')
                console.log(action)
                console.log($(element))
              } else if (action.action == 'show') {
                const originalValue = $(element).attr('data-webmunk-prior-css-display')

                if (originalValue !== undefined) {
                  $(element).css('display', originalValue)
                  $(element).removeAttr('data-webmunk-prior-css-display')

                  const key = `${action.selector}:show`

                  if (blockedCount[key] === undefined) {
                    blockedCount[key] = 0
                  }

                  blockedCount[key] += 1
                } else {
                  $(element).css('display', '')
                }

                console.log('show')
                console.log(action)
                console.log($(element))
              }
            })
          }
        }
      }

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

registerWebmunkModule(plugin)

export default plugin
