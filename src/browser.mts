import $ from 'jquery'

import check from 'check-types'
import psl from 'psl'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXClientModule, registerREXModule } from '@bric/rex-core/browser'

import { REXPageManipulationConfiguration, REXPageManipulationObscurePage, REXPageManipulationBlurWithMessage, REXPageElementRuleAction, REXPageElementAddClassRuleAction, REXPageManipulationEvaluateMessage, REXPageElementAddClassRuleConditionContent } from './types.mjs'

class PageManipulationModule extends REXClientModule {
  configuration?:REXPageManipulationConfiguration
  configurationAttempts:number = 0
  refreshTimeout:number = 0
  debug:boolean = false

  constructor() {
    super()
  }

  toString():string {
    return 'PageManipulationModule'
  }

  urlContains(url:string, substring:string): Promise<boolean> {
    return new Promise((resolve) => {
      if (substring.startsWith('this-extension:///')) {
        const actualSubstring = `chrome-extension://${chrome.runtime.id}/`

        const newSubstring = substring.replaceAll('this-extension:///', actualSubstring)

        this.urlContains(url, newSubstring).then((matches:boolean) => {
          resolve(matches)
        })
      } else if (url.toLowerCase().includes(substring.toLowerCase())) {
        resolve(true)
      } else {
        resolve(false)
      }
    })
  }

  blurWithMessage(blurPage:REXPageManipulationBlurWithMessage) {
    const apply = () => {
      // Idempotent: config refreshes or setup retries must not stack banners.
      if (document.getElementById('rex-blur-overlay') !== null) {
        return
      }

      document.body.style.filter = 'blur(8px)'

      const overlay = document.createElement('div')

      overlay.id = 'rex-blur-overlay'
      overlay.textContent = blurPage.message
      overlay.setAttribute('style', 'position: fixed; top: 0; right: 0; bottom: 0; left: 0; z-index: 2147483647; display: flex; align-items: center; justify-content: center; padding: 2em; background: rgba(255, 255, 255, 0.6); color: #444444; font: 600 60px/1.4 system-ui, sans-serif; text-align: center;')

      // Overlay is a sibling of body: CSS filter blurs all descendants, so the
      // message must live outside the blurred element.
      document.documentElement.appendChild(overlay)

      if (blurPage.delay !== undefined) {
        window.setTimeout(() => {
          document.body.style.filter = ''

          overlay.remove()
        }, blurPage.delay)
      }
    }

    if (document.body !== null) {
      apply()
    } else {
      // Content scripts at document_start can run before <body> exists.
      new MutationObserver((_mutations, observer) => {
        if (document.body !== null) {
          observer.disconnect()

          apply()
        }
      }).observe(document.documentElement, { childList: true })
    }
  }

  setup() {
    chrome.runtime.sendMessage({
        'messageType': 'fetchConfiguration',
      }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
        // A cold service worker can answer before the stored configuration
        // exists; retry briefly instead of silently applying nothing.
        if (response === undefined || response === null) {
          if (this.configurationAttempts < 20) {
            this.configurationAttempts += 1

            window.setTimeout(() => { this.setup() }, 250)
          }

          return
        }

        const configuration = response as REXConfiguration

        this.configuration = ((configuration as any)['page_manipulation'] as REXPageManipulationConfiguration) // eslint-disable-line @typescript-eslint/no-explicit-any

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

        const blurPages = (this.configuration?.['blur_with_message'] as REXPageManipulationBlurWithMessage[])

        if (blurPages !== undefined) {
          for (const blurPage of blurPages) {
            if (window.location.href.toLowerCase().includes(blurPage.base_url.toLowerCase())) {
              if (this.debug) {
                console.log(`Initially blurring ${window.location.href} for rule ${blurPage.base_url}...`)
              }

              this.blurWithMessage(blurPage)
            }
          }
        }

        if (this.refreshTimeout == 0) {
          this.refreshTimeout = window.setTimeout(() => {
            this.applyConfiguration()

            this.refreshTimeout = 0
          }, 250)
        }
      }).catch(() => {
        // The message itself can fail while the service worker is still
        // starting ("receiving end does not exist"); retry the same way.
        if (this.configurationAttempts < 20) {
          this.configurationAttempts += 1

          window.setTimeout(() => { this.setup() }, 250)
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
        const blockedCount:{[key: string]: number} = {}

        if (this.configuration['page_elements'] !== undefined) {
          for (const elementRule of this.configuration['page_elements']) {
            const baseUrl = elementRule['base_url']

            this.urlContains(window.location.href, baseUrl).then((matches) => {
              if (matches) {
                // Apply rule

                if (this.debug) {
                  console.log(`Applying page manipulation rule to ${window.location.href}...`)
                  console.log(elementRule)
                }

                elementRule.actions.forEach((action:REXPageElementRuleAction|REXPageElementAddClassRuleAction, ruleIndex) => {
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
                      const addClassAction:REXPageElementAddClassRuleAction = action as REXPageElementAddClassRuleAction

                      const attrKey = `data-rex-classes-added-${ruleIndex}`
                      const originalValue = $(element).attr(attrKey)

                      const key = `${addClassAction.selector}:add-class`

                      let exceptions = addClassAction.exceptions

                      if (exceptions === undefined) {
                        exceptions = []
                      }

                      if (originalValue !== undefined) {
                        // Already added
                      } else {
                        $(element).attr(attrKey, `${Date.now()}`)

                        const passes:boolean[] = []

                        if (check.array(addClassAction.conditions)) {
                          const toCheck = [...addClassAction.conditions]

                          const checkNextCondition = () => {
                            if (toCheck.length == 0) {
                              let matchAll = true

                              if (addClassAction.conditions_match === 'any') {
                                matchAll = false
                              }

                              if (matchAll && passes.includes(false)) {
                                console.log(`FAIL-ALL: ${addClassAction['class_name']}`)
                              } else if (matchAll === false && passes.includes(true) === false) {
                                console.log(`FAIL-ANY: ${addClassAction['class_name']}`)
                              } else {
                                console.log(`PASS: ${addClassAction['class_name']}`)

                                $(element).addClass(addClassAction['class_name'])

                                if (blockedCount[key] === undefined) {
                                  blockedCount[key] = 0
                                }

                                blockedCount[key] += 1
                              }
                            } else {
                              const condition = toCheck.pop()

                              if (condition === undefined) {
                                checkNextCondition()
                              } else {
                                const message:REXPageManipulationEvaluateMessage = {
                                  messageType: 'pageManipulationEvaluate',
                                  condition
                                }

                                const content = this.resolveContent(element, condition.content)

                                if (content === null || exceptions.includes(content)) {
                                  passes.push(false)

                                  checkNextCondition()
                                } else {
                                  if (content !== undefined && content !== null) {
                                    message['content'] = content
                                  }

                                  chrome.runtime.sendMessage(message).then((passed) => {
                                    passes.push(passed)

                                    checkNextCondition()
                                  })
                                }
                              }
                            }
                          }

                          checkNextCondition()
                        } else {
                          $(element).addClass(addClassAction['class_name'])

                          if (blockedCount[key] === undefined) {
                            blockedCount[key] = 0
                          }

                          blockedCount[key] += 1
                        }
                      }

                      if (this.debug) {
                        console.log('[PageManipulation] Add class element:')
                        console.log(action)
                        console.log($(element))
                      }
                    }
                  })
                })
              } else {
                if (this.debug) {
                  console.log(`[PageManipulation] Skip applying page manipulation rules to ${window.location.href}...`)
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
            })
          }
        }
      }
    }
  }

  resolveContent(element:HTMLElement, content:REXPageElementAddClassRuleConditionContent) {
    let value:string|null|undefined = null

    if (content === undefined) {
      return null
    }

    if (content.source !== undefined) {
      if (content.source === 'attr' && content.name !== undefined) {
        if (content.selector !== undefined) {
          value = $(element).find(content.selector).attr(content.name)
        } else {
          value = $(element).attr(content.name)
        }
     }
    }

    if (value !== null && value !== undefined) {
      if (content.transform == 'domain') {
        const url = URL.parse(value, window.location.href)

        if (url !== null) {
          return psl.get(url.hostname)
        }
      }
    }

    return null
  }
}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
