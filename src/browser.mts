import $ from 'jquery'

import { WebmunkConfiguration } from '@bric/webmunk-core/extension'

import { WebmunkClientModule, registerWebmunkModule } from '@bric/webmunk-core/browser'

    // "page_manipulation": {
    //     "url_redirects": [{
    //         "url_filter": "|https://www.google.com/search*udm=50",
    //         "destination": "restricted.html"
    //     }, {
    //         "url_filter": "||gemini.google.com",
    //         "destination": "restricted.html"
    //     }, {
    //         "url_filter": "||chatgpt.com",
    //         "destination": "restricted.html"
    //     }],
    //     "page_elements": [{
    //         "base_url": "https://www.google.com/search",
    //         "actions": [{
    //             "action": "hide",
    //             "selector": "span.text('AI Mode')"
    //         }]
    //     }]
    // }


class PageManipulationModule extends WebmunkClientModule {
  configuration: any

  constructor() {
    super()
  }

  setup() {
    console.log(`Setting up PageManipulationModule...`)

    chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        const configuration = response as WebmunkConfiguration

        console.log('configuration')
        console.log(configuration)

        this.configuration = configuration['page_manipulation']

        this.applyConfiguration()
      })

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

    $.expr.pseudos.trimmedTextEquals = $.expr.createPseudo((...args: any[]) => {
      return function(elem: Element) : boolean {
        return $(elem).text().match("^" + args[0] + "$")
      }
    })
  }

  applyConfiguration() {
    if ([null, undefined].includes(this.configuration)) {
      return
    }

    for (const elementRule of this.configuration['page_elements']) {
      var baseUrl = elementRule['base_url']

      if (baseUrl === undefined || window.location.href.toLowerCase().startsWith(baseUrl.toLowerCase())) {
        // Apply rule

        for (const action of elementRule.actions) {
          $(action.selector).each((index, element) => {
            if (action.action === 'hide') {
              const oldValue = $(element).css('display')

              if (oldValue !== undefined) {
                $(element).attr('data-webmunk-prior-css-display', oldValue)
              }

              $(element).css('display', 'none')
            } else if (action.action == 'show') {
              const originalValue = $(element).attr('data-webmunk-prior-css-display')

              if (originalValue !== undefined) {
                $(element).css('display', originalValue)
                $(element).removeAttr('data-webmunk-prior-css-display')
              } else {
                $(element).css('display', '')
              }
            }
          })
        }
      }
    }
  }
}

const plugin = new PageManipulationModule()

registerWebmunkModule(plugin)

export default plugin
