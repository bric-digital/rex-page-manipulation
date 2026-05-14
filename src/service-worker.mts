import { REXConfiguration } from '@bric/rex-core/common'
import rexCorePlugin, { REXServiceWorkerModule, registerREXModule } from '@bric/rex-core/service-worker'

export interface REXPageRedirect {
  url_filter: string,
  destination: string
}

export interface REXContentExtractor {
  source: 'text' | 'attr',
  name?: string,
  transform?: 'none' | 'domain',
  within?: string,
}

export interface REXPageElementRuleAction {
  selector: string,
  action: string,
  // Used when action === 'add_class':
  class_name?: string,
  content?: REXContentExtractor,
  fraction?: number,
  precision?: number,
  algorithm?: 'sha256',
}

export interface REXPageElementRule {
  base_url: string,
  actions: REXPageElementRuleAction[]
}

export interface REXPageManipulationObscurePage {
  base_url: string,
  delay?: number
}

export interface REXPageManipulationConfiguration {
  debug?: boolean,
  enabled?: boolean,
  url_redirects?: REXPageRedirect[],
  obscure_page?: REXPageManipulationObscurePage[],
  page_elements?: REXPageElementRule[]
}

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
        url_redirects: [{
          url_filter: 'URL pattern to match for redirection. See https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest for "URL filter syntax".',
          destination: 'URL to send matched requests. May external or an internal URL within the extension.'
        }],
        page_elements: [{
          base_url: 'URL to apply the associated actions to.',
          actions: [{
            selector: 'jQuery selector indicating which elements to act upon.',
            action: 'String, action to apply to matched elements: "hide" to suppress element, "show" to reveal element, "report" to mark element as observed, "add_class" to add a CSS class (optionally gated on a hash filter).',
            class_name: 'String (add_class only). CSS class to add. Defaults to "hash_match".',
            content: 'Object (add_class only). Content extractor: { source: "text" | "attr", name?: attribute name, transform?: "none" | "domain", within?: jQuery sub-selector to read from a descendant of the matched element rather than from the match itself }. If omitted, the class is added unconditionally to every match.',
            fraction: 'Number (add_class only). 0.0–1.0 share of hash space; element is classed iff its hashed content falls in the first `fraction` of the space. Defaults to 0.1.',
            precision: 'Number (add_class only). Trailing hex chars of the hash used as a uniform integer. Defaults to 8 (32 bits).',
            algorithm: 'String (add_class only). Hash algorithm. Defaults to "sha256".'
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
}

const plugin = new PageManipulationModule()

registerREXModule(plugin)

export default plugin
