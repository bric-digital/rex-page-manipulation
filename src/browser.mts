import $ from 'jquery'

import check from 'check-types'
import psl from 'psl'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXClientModule, registerREXModule, injectREXSelectors } from '@bric/rex-core/browser'

import { REXPageManipulationConfiguration, REXPageManipulationObscurePage, REXPageElementRuleAction, REXPageElementAddClassRuleAction, REXPageManipulationEvaluateMessage, REXPageElementAddClassRuleConditionContent } from './types.mjs'

// TODO add hinting of elements to expect to improve the obscure behavior

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

  setup() {
    chrome.runtime.sendMessage({
      'messageType': 'fetchConfiguration',
    }).then((response:{ [name: string]: any; }) => { // eslint-disable-line @typescript-eslint/no-explicit-any
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

      if (this.refreshTimeout == 0) {
        this.refreshTimeout = window.setTimeout(() => {
          this.applyConfiguration()

          this.refreshTimeout = 0
        }, 250)
      }
    })

    new MutationObserver((mutationList, observer) => {
      console.log(`[rex-page-manipulation] Mutation: ${observer}`)
      console.log(mutationList)
      
      if (this.refreshTimeout == 0) {
        this.refreshTimeout = window.setTimeout(() => {
          this.applyConfiguration()

          this.refreshTimeout = 0
        }, 250)
      }
    }).observe(document, {subtree: true, childList: true})

    injectREXSelectors()
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

                  const selectorStart = Date.now()

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
