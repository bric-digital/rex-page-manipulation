// @ts-nocheck

// Implements the necessary functionality to load the REX modules into the 
// extension background service worker context.

import rexCorePlugin from '@bric/rex-core/service-worker'
import rexPageManipulationPlugin from '@bric/rex-page-manipulation/service-worker'

console.log(`Imported ${rexCorePlugin} into service worker context...`)
console.log(`Imported ${rexPageManipulationPlugin} into service worker context...`)

self['rexCorePlugin'] = rexCorePlugin
self['rexPageManipulationPlugin'] = rexPageManipulationPlugin

// Test hook: capture every logEvent message so specs can assert on the
// telemetry the page bundle emits. Read via serviceWorker.evaluate().
self['capturedLogEvents'] = []
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.messageType === 'logEvent') {
    self['capturedLogEvents'].push(message.event)
  }
  return false
})

rexCorePlugin.setup()
