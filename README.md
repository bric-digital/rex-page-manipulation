# rex-page-manipulation

A REX module that changes what a participant's browser loads and shows. Researchers use it to redirect or block requests, to hide a page while it loads, and to hide, reveal, mark or count elements on matching pages. Every rule comes from server-side configuration, so a study can change its rules without publishing a new extension version.

## Installation

Add the module to the extension's `package.json` from GitHub:

```json
"@bric/rex-page-manipulation": "github:bric-digital/rex-page-manipulation"
```

Import it in two targets. The service worker handles redirects and condition checks. The browser (content script) target changes pages.

```ts
// service worker
import rexPageManipulationPlugin from '@bric/rex-page-manipulation/service-worker'

// browser / content script
import rexPageManipulationPlugin from '@bric/rex-page-manipulation/browser'
```

The service worker target uses `chrome.declarativeNetRequest`, so the extension manifest needs the `declarativeNetRequest` permission.

## Configuration

Settings live under `page_manipulation` in the REX configuration:

```json
"page_manipulation": {
  "enabled": true,
  "debug": false,
  "url_redirects": [],
  "obscure_page": [],
  "page_elements": []
}
```

| Setting | Type | Meaning |
|---|---|---|
| `enabled` | Boolean | `true` if the module is active. |
| `debug` | Boolean | `true` to log to the console. |
| `url_redirects` | Array | Requests to redirect or block. |
| `obscure_page` | Array | Pages to hide while they load. |
| `page_elements` | Array | Changes to elements on matching pages. |

### `url_redirects`

Each rule becomes a Chrome `declarativeNetRequest` dynamic rule. Rules that come earlier in the list have higher priority.

| Field | Meaning |
|---|---|
| `url_filter` | Pattern in Chrome's [URL filter syntax](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest). |
| `destination` | Optional. Where matched requests are sent: a full URL (containing `://`) or a path inside the extension. If omitted, matched requests are blocked. |

The rules apply to page loads, frames, scripts, XHR/fetch, websockets and webtransport.

```json
"url_redirects": [
  { "url_filter": "||example.com", "destination": "https://example.org/" },
  { "url_filter": "||example.net" }
]
```

### `obscure_page`

Sets the page's opacity to zero when its URL contains `base_url`.

| Field | Meaning |
|---|---|
| `base_url` | URL substring to match, case-insensitive. |
| `delay` | Optional. Milliseconds before the page is shown again. If omitted, the page stays hidden. |

### `page_elements`

Each rule applies a list of actions to the elements of pages whose URL contains `base_url` (a case-insensitive substring; `this-extension:///` matches this extension's own pages). Actions run again whenever the page changes, so elements added later are covered too.

```json
"page_elements": [{
  "base_url": "https://www.example.com/",
  "actions": [
    { "selector": "#sidebar", "action": "hide" }
  ]
}]
```

Every action has a `selector`, which is a jQuery selector, and an `action`:

| Action | Effect |
|---|---|
| `hide` | Sets `display: none` and remembers the element's previous `display` value. |
| `show` | Restores the remembered `display` value from an earlier `hide`. Without one, clears the inline `display`. |
| `report` | Changes nothing. Counts the element so it appears in the logged event. |
| `add_class` | Adds `class_name` to the element, optionally only when conditions pass. |

The module marks elements it has hidden, reported or added a class to, and skips them on later passes, so repeated passes do not count them again.

#### `add_class` conditions

Without `conditions`, `add_class` always adds the class. With `conditions`, the class is added only if the conditions pass:

| Field | Meaning |
|---|---|
| `class_name` | CSS class to add. |
| `conditions` | Optional. List of conditions (below). |
| `conditions_match` | Optional. `"all"` (default) or `"any"`. |
| `exceptions` | Optional. List of content values that always fail the condition, for example `["example.com"]`. |

A condition reads a value from the element and tests it:

| Field | Meaning |
|---|---|
| `operation` | `"calculate-sha512-hash"`, currently the only operation. |
| `content.source` | `"attr"`, currently the only source: read an attribute. |
| `content.name` | Attribute to read, for example `"href"`. |
| `content.selector` | Optional. Read the attribute from a descendant matching this selector instead of from the element itself. |
| `content.transform` | `"domain"`, currently the only transform: reduce the value to its registrable domain. A condition without it does not pass. |
| `use` | `[start, end]` character range of the lowercase hex SHA-512 hash to compare. |
| `within_range` | `[low, high]`. The condition passes when the hash substring falls within this range, inclusive, compared as strings. |

This splits items reproducibly by their domain. The example below marks links whose domain hash starts in the lowest quarter of the hex range, so the same domains are marked for every participant:

```json
{
  "selector": "a[id^='link-']",
  "action": "add_class",
  "class_name": "range_marker",
  "conditions": [{
    "operation": "calculate-sha512-hash",
    "content": { "source": "attr", "name": "href", "transform": "domain" },
    "use": [0, 8],
    "within_range": ["00000000", "40000000"]
  }]
}
```

#### Extra selectors

The browser target adds these jQuery pseudo-selectors, which can be used in any `selector`:

| Selector | Matches elements |
|---|---|
| `:containsInsensitive(text)` | whose text contains `text`, ignoring case. |
| `:containsInsensitiveAny(["a","b"])` | whose text contains any of the listed strings, ignoring case. |
| `:imageAltTagContainsInsensitiveAny(["a","b"])` | whose `alt` attribute contains any of the listed strings, ignoring case. |
| `:withinPage` | positioned within the page's scrollable area. |
| `:cssIs(property: value)` | whose computed CSS `property` equals `value`. |
| `:trimmedTextEquals(pattern)` | whose text matches `pattern` as a whole regular expression. |

## Logged events

When element actions change something on a page, the browser target sends a `page-manipulation` event through rex-core's `logEvent`:

```json
{
  "name": "page-manipulation",
  "url": "https://www.example.com/",
  "updates": { "#sidebar:hide": 1 }
}
```

`updates` keys are `<selector>:<action>`, where `add_class` appears as `add-class`, and values count the affected elements.

## Development

```bash
npm install
npm run lint
npm test
```

Run tests with `npm test`, which rebuilds the test bundle first. `npx playwright test` skips that step and tests whatever bundle is already on disk.
