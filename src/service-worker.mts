import { WebmunkConfiguration } from '@bric/webmunk-core/extension'
import webmunkCorePlugin, { WebmunkServiceWorkerModule, registerWebmunkModule } from '@bric/webmunk-core/service-worker'

class PageManipulationModule extends WebmunkServiceWorkerModule {
  urlRedirects = []
  pageElements = []

  constructor() {
    super()
  }

  setup() {
    this.refreshConfiguration()
  }

  refreshConfiguration() {
    webmunkCorePlugin.fetchConfiguration()
      .then((configuration:WebmunkConfiguration) => {
        if (configuration !== undefined) {
          const pageManipulationConfig = configuration['page_manipulation']

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

  parseRedirect(configRule, id:number, priority:number) {
    const newRule = {
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

      newRule.action['redirect'] = redirect
    }

    return newRule
  }

  updateConfiguration(config) {
    this.urlRedirects = config['url_redirects']

    if ([null, undefined].includes(this.urlRedirects)) {
        this.urlRedirects = []
    }

    this.pageElements = config['page_elements']

    if ([null, undefined].includes(this.pageElements)) {
        this.pageElements = []
    }

    const newRules = []

    for (const redirect of this.urlRedirects) {
      const index = this.urlRedirects.indexOf(redirect)
      const priority = this.urlRedirects.length - index

      const newRule = this.parseRedirect(redirect, (index + 1), priority)

      if (![null, undefined].includes(newRule)) {
        newRules.push(newRule)
      }
    }

    chrome.declarativeNetRequest.getDynamicRules()
      .then((oldRules) => {
        const oldRuleIds = oldRules.map(rule => rule.id);

        chrome.declarativeNetRequest.updateDynamicRules({
          removeRuleIds: oldRuleIds,
          addRules: newRules
        })
        .then(() => {
          console.log(`Dynamic rules successfully updated. ${newRules.length} currently active.`)
        }, (reason:any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
          console.log(`Unable to update blocking rules: ${reason}`)
        })
      })
  }
}

const plugin = new PageManipulationModule()

registerWebmunkModule(plugin)

export default plugin
