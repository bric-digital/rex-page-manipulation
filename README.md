# rex-page-manipulation

REX module that manipulates page loads and elements within loaded pages —
hiding, showing, reporting, and conditionally classing DOM elements, plus
URL redirects and initial page obscuring.

## Configuration

The module reads the `page_manipulation` key of the REX configuration:

```json
{
  "page_manipulation": {
    "enabled": true,
    "debug": false,
    "obscure_page": [ ... ],
    "url_redirects": [ ... ],
    "page_elements": [ ... ]
  }
}
```

| Key | Purpose |
|-----|---------|
| `enabled` | Master on/off switch. |
| `debug` | When `true`, the module logs what it matches and does. |
| `obscure_page` | Hides the whole page (`opacity: 0`) until a delay elapses — useful to mask the brief flash before `page_elements` rules apply. |
| `url_redirects` | Blocks or redirects requests via `declarativeNetRequest`. |
| `page_elements` | DOM-manipulation rules — see below. |

### `page_elements`

Each entry is a rule: a `base_url` prefix and a list of `actions` applied to
elements on pages whose URL starts with that prefix.

```json
{
  "base_url": "https://www.google.com/search",
  "actions": [ { "action": "...", "selector": "...", ... } ]
}
```

Every action has a `selector` (a jQuery selector) and an `action`:

| `action` | Effect |
|----------|--------|
| `hide` | Sets `display: none` (the prior value is saved so `show` can restore it). |
| `show` | Restores an element previously hidden by `hide`. |
| `report` | Marks the element as observed (`data-rex-reported`) without changing it. |
| `add_class` | Adds a CSS class, optionally gated on one or more conditions. |

### The `add_class` action

```json
{
  "action": "add_class",
  "selector": "a[jsname='UWckNb'][href]",
  "class_name": "hash_match",
  "conditions_match": "all",
  "conditions": [ { ... } ],
  "exceptions": ["chase.com"]
}
```

| Field | Meaning |
|-------|---------|
| `class_name` | Class to add. Defaults to `hash_match`. |
| `conditions` | Array of conditions. If omitted/empty, the class is added unconditionally. |
| `conditions_match` | `"all"` (every condition must pass) or `"any"` (at least one). Defaults to `"all"`. |
| `exceptions` | Content values that are never classed, regardless of conditions. An absolute veto. |

`add_class` only *adds a class* — it does not hide anything. Pair it with a
`hide` action (or CSS) to act on the classed elements. Keeping the two steps
separate means the matching logic is independent of what you do with a match.

#### Conditions

Each condition runs an `operation` over content extracted from the element:

```json
{
  "operation": "calculate-sha512-hash",
  "content": { "source": "attr", "name": "href", "transform": "domain" },
  "use": [0, 8],
  "within_range": ["00000000", "19999999"]
}
```

`content` — the content extractor:

| Field | Meaning |
|-------|---------|
| `source` | `"text"` (the element's text) or `"attr"` (an attribute). |
| `name` | Attribute name, when `source` is `"attr"`. |
| `transform` | `"none"`, or `"domain"` — parse the value as a URL and reduce it to the registrable domain (eTLD+1) via the Public Suffix List, e.g. `news.bbc.co.uk` → `bbc.co.uk`. |
| `within` | jQuery sub-selector — extract from a descendant of the matched element rather than the match itself. |

Operations (bundled; more can be added):

- **`calculate-sha512-hash`** — SHA-512 of the extracted content. Passes iff
  `hash.slice(use[0], use[1])` falls within the half-open range
  `[within_range[0], within_range[1])`. Comparison is plain lowercase-hex
  string comparison — `["00000000", "19999999"]` is the first ~1/10 of the
  hash space; `["00000000", "10000000"]` is exactly 1/16.

The hash is deterministic and unseeded: whether a given value is classed is a
pure function of the content and the condition, reproducible after the fact.

## Worked example: hiding a deterministic share of Google results

Goal: across three study arms, deterministically hide a share of Google search
results by their destination domain.

- **Config A** hides 10% of results.
- **Config B** hides a *different* 10%.
- **Config C** hides everything A *and* B hide (20%).

The same domain always lands in the same place in the hash space, so the three
arms are stable and reproducible, and C is exactly the union of A and B.

### Mechanism

Two steps, both inside one `page_elements` rule for `https://www.google.com/search`:

1. **`add_class`** tags the result elements whose domain hashes into the target
   range — organic results (via the canonical link `a[jsname='UWckNb']`) and
   news-carousel cards (`div[data-news-doc-id]`).
2. **`hide`** removes the result *rows* that contain a tagged element, using
   jQuery `:has()`.

### Config A — the first 10%

```json
{
  "page_manipulation": {
    "enabled": true,
    "page_elements": [
      {
        "base_url": "https://www.google.com/search",
        "actions": [
          {
            "action": "add_class",
            "selector": "a[jsname='UWckNb'][href]",
            "conditions": [{
              "operation": "calculate-sha512-hash",
              "content": { "source": "attr", "name": "href", "transform": "domain" },
              "use": [0, 8],
              "within_range": ["00000000", "19999999"]
            }]
          },
          {
            "action": "add_class",
            "selector": "div[data-news-doc-id]",
            "conditions": [{
              "operation": "calculate-sha512-hash",
              "content": { "source": "attr", "name": "href", "transform": "domain", "within": "a[href^='http']" },
              "use": [0, 8],
              "within_range": ["00000000", "19999999"]
            }]
          },
          { "action": "hide", "selector": "div[data-rpos]:has(a.hash_match[jsname='UWckNb'])" },
          { "action": "hide", "selector": "div[data-news-doc-id].hash_match" }
        ]
      }
    ]
  }
}
```

`["00000000", "19999999"]` is the first decile of the hash space. The two
`add_class` rules use the same range so an organic result and a news card for
the same domain are treated identically. The two `hide` rules remove the rows.

### Config B — a different 10%

Identical to Config A, except every `within_range` becomes the *second*
decile — the slice immediately after A's:

```json
"within_range": ["19999999", "33333332"]
```

A and B are disjoint (the range is half-open), so no domain is hidden by both.

### Config C — everything A and B hide

Identical to Config A, except each `add_class` rule takes **both** conditions
and matches on **either** of them:

```json
{
  "action": "add_class",
  "selector": "a[jsname='UWckNb'][href]",
  "conditions_match": "any",
  "conditions": [
    {
      "operation": "calculate-sha512-hash",
      "content": { "source": "attr", "name": "href", "transform": "domain" },
      "use": [0, 8],
      "within_range": ["00000000", "19999999"]
    },
    {
      "operation": "calculate-sha512-hash",
      "content": { "source": "attr", "name": "href", "transform": "domain" },
      "use": [0, 8],
      "within_range": ["19999999", "33333332"]
    }
  ]
}
```

`conditions_match: "any"` means a result is classed if it falls in A's range
*or* B's — exactly the union. (Because A's and B's ranges happen to be
adjacent here, C could equivalently use a single condition with the merged
range `["00000000", "33333332"]`. The `any` form is shown because it
generalises to non-adjacent slices.)

### Notes

- To never hide a particular domain, add `"exceptions": ["chase.com"]` to the
  `add_class` rules — it overrides the conditions.
- Add an `obscure_page` entry for `https://www.google.com/search` to mask the
  brief flash before the hide pass runs.
- Google's result markup changes over time; the selectors above
  (`a[jsname='UWckNb']`, `div[data-rpos]`, `div[data-news-doc-id]`) were chosen
  for being attribute-based rather than relying on Google's rotating CSS
  classes, but may still need revisiting.
