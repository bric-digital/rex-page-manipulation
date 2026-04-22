import rexPageManipulationPlugin from '@bric/rex-page-manipulation/browser'

console.log(`Imported ${rexPageManipulationPlugin} into the browser context for ${window.location.href}...`)

self['rexPageManipulationPlugin'] = rexPageManipulationPlugin
