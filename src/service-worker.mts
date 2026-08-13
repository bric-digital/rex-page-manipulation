import check from 'check-types'

import { REXConfiguration } from '@bric/rex-core/common'
import { REXStackOperator } from '@bric/rex-types/types'

import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'
import { REXPageRedirect, REXPageManipulationConfiguration } from './types.mjs'

class PageManipulationModule extends REXServiceWorkerModule {
  urlRedirects:REXPageRedirect[] = []
  // pageElements = []

  debug:boolean = false

  constructor() {
    super()
  }

  moduleName() {
    return 'PageManipulationModule'
  }

  setup() {
    this.refreshConfiguration()

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
      let tabUrl:string = ''
      
      if (tab.url !== undefined) {
        tabUrl = tab.url
      } else if (changeInfo.url !== undefined) {
        tabUrl = changeInfo.url
      } else {
        return
      }

      for (const rule of this.urlRedirects) {
        if (rule.pattern !== undefined && rule.pattern !== '' && (rule.mode === undefined || rule.mode === 'regex')) {
          const regex:RegExp = new RegExp(rule.pattern)

          if (regex.test(tabUrl)) {
            chrome.tabs.update(tabId, { url: rule.destination })

            return
          }
        }
      }
    })
  }

  fetchNextRuleId(): Promise<number> {
    return new Promise<number>((resolve) => {
      const lookupKey:string = 'PageManipulationModuleLastRuleId'
      
      const fetchLast = {
        messageType: 'fetchValue',
        key: lookupKey
      }

      rexCorePlugin.handleMessage(fetchLast, this, (response:number) => {
        let nextId = 1

        if (response !== null) {
          nextId = Math.floor((response + 1) % (2**31 - 1))
        }

        const storeNext = {
          messageType: 'storeValue',
          key: lookupKey,
          value: nextId
        }

        rexCorePlugin.handleMessage(storeNext, this, (response) => { // eslint-disable-line @typescript-eslint/no-unused-vars
          resolve(nextId)
        })
      })
    })
  }

  configurationDetails():any { // eslint-disable-line @typescript-eslint/no-explicit-any
    return {
      page_manipulation: {
        enabled: 'Boolean, true if module is active, false otherwise.',
        debug: 'Boolean, true if debug logging is active, false otherwise.',
        obscure_page: [{
          base_url: 'URL to to obscure.',
          delay: 'Number (optional), in milliseconds to wait to reveal page.',
        }],
        url_redirects: [{
          url_filter: 'URL pattern to match for redirection. See https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest for "URL filter syntax".',
          destination: 'URL to send matched requests. May external or an internal URL within the extension.'
        }],
        page_elements: [{
          base_url: 'URL to apply the associated actions to.',
          actions: [{
            selector: 'jQuery selector indicating which elements to act upon.',
            action: 'String, action to apply to matched elements: "hide" to suppress element, "show" to reveal element.'
          }]
        }]
      }
    }
  }

  refreshConfiguration() {
    rexCorePlugin.fetchConfiguration()
      .then((configuration:REXConfiguration) => {
        if (configuration !== undefined) {
          const pageManipulationConfig = ((configuration as any)['page_manipulation'] as REXPageManipulationConfiguration) // eslint-disable-line @typescript-eslint/no-explicit-any

          if (this.debug) {
            console.log(`[rex-page-manipulation] Configuration:`)
            console.log(pageManipulationConfig)
          }

          if (pageManipulationConfig !== undefined) {
            this.updateConfiguration(pageManipulationConfig)

            return
          }
        }

        setTimeout(() => {
          this.refreshConfiguration()
        }, 1000)
      })
  }

  parseRedirect(configRule:REXPageRedirect, priority:number):Promise<chrome.declarativeNetRequest.Rule[]> {
    return new Promise<chrome.declarativeNetRequest.Rule[]>((redirectResolve) => {
      const newRules:chrome.declarativeNetRequest.Rule[] = []

      let mode = 'regex'
      let pattern = configRule.pattern

      if (pattern === undefined && configRule['url_filter'] !== undefined) { // Legacy compatibility mode. Remove when ok
        mode = 'urlFilter'
        pattern = configRule['url_filter']
      }

      this.fetchNextRuleId().then((ruleId:number) => {
        const newRule:chrome.declarativeNetRequest.Rule = {
          id: ruleId,
          priority,
          condition: {
            regexFilter: pattern,
            resourceTypes: [
              'main_frame',
              'sub_frame',
              'script',
              'xmlhttprequest',
              'websocket',
              'webtransport',
            ]
          },
          action: {
            type: 'block'
          }
        }

        if (mode === 'urlFilter') {
          delete newRule.condition.regexFilter

          newRule.condition.urlFilter = pattern
        }

        const destination = configRule.destination

        if (destination !== undefined) {
          newRule.action.type = 'redirect'

          const redirect = {
            url: chrome.runtime.getURL(destination)
          }

          if (destination.includes('://')) {
            redirect.url = destination
          }

          newRule.action['redirect'] = redirect
        }

        newRules.push(newRule)

        if (configRule.exceptions !== undefined) {
          const exceptionsStack:REXStackOperator<string> = new REXStackOperator<string>()

          exceptionsStack.push(...configRule.exceptions)

          exceptionsStack.run((exception:string):Promise<void> => {
            return new Promise<void>((exceptionResolve) => {
              this.fetchNextRuleId().then((exceptionRuleId:number) => {
                const newRule:chrome.declarativeNetRequest.Rule = {
                  id: exceptionRuleId,
                  priority: priority + 100,
                  condition: {
                    urlFilter: exception,
                    resourceTypes: [
                      'main_frame',
                      'sub_frame',
                      'script',
                      'xmlhttprequest',
                      'websocket',
                      'webtransport',
                    ]
                  },
                  action: {
                    type: 'allow'
                  }
                }

                if (mode === 'urlFilter') {
                  delete newRule.condition.regexFilter

                  newRule.condition.urlFilter = pattern
                }

                newRules.push(newRule)

                exceptionResolve()
              })
            })
          })
            .then(() => {
              redirectResolve(newRules)
            })
        } else {
          redirectResolve(newRules)
        }
      })
    })
  }

  updateConfiguration(config:REXPageManipulationConfiguration) {
    if (config.debug === true) {
      this.debug = true
    } else {
      this.debug = false
    }

    if (config['url_redirects'] !== undefined) {
      this.urlRedirects = []
      this.urlRedirects.push(...config['url_redirects'])
    }

    if (config.enabled) {
      const newRules:chrome.declarativeNetRequest.Rule[] = []

      const rulesStack:REXStackOperator<REXPageRedirect> = new REXStackOperator<REXPageRedirect>()

      if (this.urlRedirects !== undefined) {
        rulesStack.push(...this.urlRedirects)
      }

      rulesStack.run((pageRedirect:REXPageRedirect):Promise<void> => {
        return new Promise((resolve) => {
          this.parseRedirect(pageRedirect, 1)
            .then((parsedRules:chrome.declarativeNetRequest.Rule[]) => {
              newRules.push(...parsedRules)

              resolve()
            })
        })
      })
      .then(() => {
        chrome.declarativeNetRequest.getDynamicRules().then((oldRules) => {
            const oldRuleIds:number[] = []

            for (const oldRule of oldRules) {
              if (['redirect', 'block', 'allow'].includes(oldRule.action.type)) {
                oldRuleIds.push(oldRule.id)
              }
            }

            rexCorePlugin.handleMessage({ messageType: 'fetchAllowedURLs'}, this, (urlPatterns:string[]) => {

            const allowedStack:REXStackOperator<string> = new REXStackOperator<string>()

            allowedStack.push(...urlPatterns)

            allowedStack.run((urlPattern:string):Promise<void> => {
              return new Promise((resolve) => {
                this.fetchNextRuleId().then((ruleId:number) => {
                  const allowRule:chrome.declarativeNetRequest.Rule = {
                    id: ruleId,
                    priority: 1000,
                    condition: {
                      regexFilter: urlPattern,
                      resourceTypes: [
                        'script',
                        'xmlhttprequest',
                        'websocket',
                        'webtransport',
                      ]
                    },
                    action: {
                      type: 'allow'
                    }
                  }

                  newRules.push(allowRule)

                  resolve()
                })
              })
            }).then(() => {
              // console.log(`[rex-page-manipulation] Old rule IDs:`)
              // console.log(oldRuleIds)

              // console.log(`[rex-page-manipulation] New rules:`)
              // console.log(newRules)

              chrome.declarativeNetRequest.updateDynamicRules({
                removeRuleIds: oldRuleIds,
                addRules: newRules
              })
              .then(() => {
                if (this.debug) {
                  console.log(`[rex-page-manipulation] Dynamic rules successfully updated. ${newRules.length} currently active.`)
                  console.log(newRules)
                }
              }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
                console.log(`[rex-page-manipulation] Unable to update blocking rules: ${reason}`)
              })
            })
          })
        })
      })
      .catch(() => {

      })
    } else {
      if (this.debug) {
        console.log(`[rex-page-manipulation] Module included in extension, but disabled via configuration.`)
      }

      chrome.declarativeNetRequest.getDynamicRules()
        .then((oldRules) => {
          const oldRuleIds = oldRules.map(rule => rule.id);

          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
          })
          .then(() => {
            if (this.debug) {
              console.log(`[rex-page-manipulation] Dynamic rules successfully cleared.`)
            }
          }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (this.debug) {
              console.log(`[rex-page-manipulation] Unable to update blocking rules: ${reason}`)
            }
          })
        })
    }
  }

  handleMessage(message:any, sender:any, sendResponse:(response:any) => void):boolean { // eslint-disable-line @typescript-eslint/no-explicit-any
    if (message.messageType == 'pageManipulationEvaluate') {
      const condition = message.condition

      if (condition.operation == 'calculate-sha512-hash') {
        if (message.content === null) {
          sendResponse(false)

          return true
        } else {
          rexCorePlugin.generateHash(message.content, 'SHA-512').then((hash) => {
            if (hash !== null) {
              let evalValue = hash

              if (check.array(condition.use) && condition.use.length >= 2) {
                const start:number = condition.use[0]
                const end:number = condition.use[1]

                evalValue = evalValue.substring(start, end)

                if (check.array(condition.within_range) && condition.within_range.length >= 2) {
                  const startRange:string = condition.within_range[0]
                  const endRange:string = condition.within_range[1]

                  if (evalValue >= startRange && evalValue <= endRange) {
                    sendResponse(true)

                    return
                  }
                }
              }
            }

            sendResponse(false)

            return
          })

          return true
        }
      }

      sendResponse(false)

      return true
    } else if (message.messageType == 'pageManipulationClearRedirects') {
      chrome.declarativeNetRequest.getDynamicRules()
        .then((oldRules) => {
          const oldRuleIds = []

          for (const oldRule of oldRules) {
            if (['redirect', 'block', 'allow'].includes(oldRule.action.type)) {
              oldRuleIds.push(oldRule.id)
            }
          }

          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds
          })
          .then(() => {
            chrome.declarativeNetRequest.getDynamicRules()
              .then((existingRules) => {
                sendResponse(existingRules)
              })
          }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.log(`[rex-page-manipulation] Unable to clear blocking rules: ${reason}`)
          })
        })

      return true
    }


    return false
  }

}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
