// @ts-nocheck

// Implements the necessary functionality to load the REX modules into the 
// extension background service worker context.

import rexCorePlugin from '@bric/rex-core/service-worker'
import rexPageManipulationPlugin from '@bric/rex-page-manipulation/service-worker'

console.log(`Imported ${rexCorePlugin} into service worker context...`)
console.log(`Imported ${rexPageManipulationPlugin} into service worker context...`)

self['rexCorePlugin'] = rexCorePlugin
self['rexPageManipulationPlugin'] = rexPageManipulationPlugin

rexCorePlugin.setup()
