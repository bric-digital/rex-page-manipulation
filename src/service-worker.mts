import check from 'check-types'

import { REXConfiguration } from '@bric/rex-core/common'
import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'
import { REXPageRedirect, REXPageManipulationConfiguration } from './types.mjs'

class PageManipulationModule extends REXServiceWorkerModule {
  urlRedirects?:REXPageRedirect[] = []
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
        blur_with_message: [{
          base_url: 'URL substring to match for blurring.',
          delay: 'Number (optional), in milliseconds before the blur and message are removed.',
          message: 'String, message shown centered over the blurred page.'
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
            console.log(`[PageManipulation] Configuration:`)
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

  parseRedirect(configRule:REXPageRedirect, id:number, priority:number):chrome.declarativeNetRequest.Rule {
    const newRule:chrome.declarativeNetRequest.Rule = {
      id,
      priority,
      condition: {
        urlFilter: configRule['url_filter'],
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

    return newRule
  }

  updateConfiguration(config:REXPageManipulationConfiguration) {
    if (config.debug === true) {
      this.debug = true
    } else {
      this.debug = false
    }

    this.urlRedirects = config['url_redirects']

    // this.pageElements = config['page_elements']

    // if ([null, undefined].includes(this.pageElements)) {
    //     this.pageElements = []
    // }

    const newRules:chrome.declarativeNetRequest.Rule[] = []

    if (this.urlRedirects !== undefined) {
      for (const redirect of this.urlRedirects) {
        const index = this.urlRedirects.indexOf(redirect)
        const priority = this.urlRedirects.length - index

        const newRule = this.parseRedirect(redirect, (index + 1), priority)

        newRules.push(newRule)
      }
    }

    // Redirect rules need the declarativeNetRequest permission; extensions
    // that only use the DOM features (blur, obscure, element rules) may not
    // request it, and chrome.declarativeNetRequest is undefined without it.
    if (chrome.declarativeNetRequest === undefined) {
      if (newRules.length > 0) {
        console.warn('[rex-page-manipulation] url_redirects configured but the declarativeNetRequest permission is missing; redirects skipped.')
      }

      return
    }

    if (config.enabled) {
      chrome.declarativeNetRequest.getDynamicRules()
        .then((oldRules) => {
          const oldRuleIds = []

          for (const oldRule of oldRules) {
            if (['redirect', 'block', 'allow'].includes(oldRule.action.type)) {
              oldRuleIds.push(oldRule.id)
            }
          }

          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
            addRules: newRules
          })
          .then(() => {
            if (this.debug) {
              console.log(`[PageManipulation] Dynamic rules successfully updated. ${newRules.length} currently active.`)
              console.log(newRules)
            }

          }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            console.log(`[PageManipulation] Unable to update blocking rules: ${reason}`)
          })
        })
    } else {
      if (this.debug) {
        console.log(`[PageManipulation] Module included in extension, but disabled via configuration.`)
      }

      chrome.declarativeNetRequest.getDynamicRules()
        .then((oldRules) => {
          const oldRuleIds = oldRules.map(rule => rule.id);

          chrome.declarativeNetRequest.updateDynamicRules({
            removeRuleIds: oldRuleIds,
          })
          .then(() => {
            if (this.debug) {
              console.log(`[PageManipulation] Dynamic rules successfully cleared.`)
            }
          }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
            if (this.debug) {
              console.log(`[PageManipulation] Unable to update blocking rules: ${reason}`)
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
    }

    return false
  }

}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
