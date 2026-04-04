# Technical Reference — Last Epoch Filter Merge Script

This document covers the internals of `merge_filters.py` and the full `config.yaml` schema. For basic usage instructions, see [README.md](README.md).

---

## Architecture Overview

```
merge_filters.py
│
├── parse_filter(path)             XML → list of <Rule> elements
├── get_name(rule) / set_name()    Read/write rule nameOverride field
├── set_order(rule, n)             Write the Order field on a rule element
├── matches(name, pattern, mode)   Pattern matching (exact/startswith/contains)
│
├── build_core_name_set(rules)     Build dedup index from core rule names
├── strip_core_rules(rules, set)   Remove build rules whose names are in the core set
├── strip_ignored_rules(rules, cfg) Remove rules matching ignore_build_rules entries
├── apply_overrides(rules, cfg)    Apply field mutations from overrides config
│
├── assign_rules_to_sections(…)    Main merge: map rules → ordered sections
├── build_output_xml(…)            Generate final XML; assign sequential Order values
└── main()                         CLI entry point (argparse)
```

**Dependencies:** Python 3.10+, PyYAML. No other third-party libraries.

---

## Processing Pipeline

### 1. Load Core

`Core.xml` is parsed and every rule's `nameOverride` value is indexed into a set used for deduplication.

### 2. Load Build Files

For each `.xml` file in the builds directory:

1. Parse all `<Rule>` elements.
2. **Strip core rules** — any rule whose `nameOverride` exactly matches a name in the core index is dropped. This handles raw Maxroll downloads that include shared rules.
3. **Strip ignored rules** — any rule matching an `ignore_build_rules` entry is dropped.
4. The build name is read from the root `<n>` tag of the XML, not the filename.

### 3. Assign Rules to Sections

Sections from `config.yaml` are iterated in order. Each section either:

- **`source: core`** — finds the first core rule whose name matches the section's pattern. Placed once.
- **`source: build`** — finds the first matching rule from each build file. All matching rules are grouped together at this position in the output.

A rule can only be claimed once. Once a rule is assigned to a section it is removed from the candidate pool.

After all sections are processed, any unclaimed build rules are inserted at the position defined by `unmatched_build_rules`.

### 4. Apply Overrides

After placement, `overrides` entries are evaluated against every rule in the output. Matching rules have their XML fields mutated in place. Some fields have automatic side-effects (see [Overrides](#overrides)).

### 5. Generate Output XML

Rules are written in the order they were assigned. `Order` values are reassigned sequentially: the first rule in the list gets `Order = (total_rules - 1)` and the last gets `Order = 0`. Last Epoch evaluates rules from highest `Order` to lowest, so position in the YAML is all that matters.

Filter metadata (`<n>`, `<description>`, `<filterIcon>`, `<filterIconColor>`) is written from the `output` config block. The `{builds}` placeholder in `name_template` is expanded to a comma-separated list of all loaded build names.

---

## config.yaml Reference

### `output`

```yaml
output:
  name_template: "All Builds - {builds}"
  description: "Merged multi-build filter"
  filter_icon: 0
  filter_icon_color: 0
```

| Key | Type | Description |
| --- | ---- | ----------- |
| `name_template` | string | Filter name. `{builds}` expands to comma-separated build names read from each XML's `<n>` tag. |
| `description` | string | Filter description shown in-game. |
| `filter_icon` | int | Icon ID (matches Last Epoch's internal icon set). |
| `filter_icon_color` | int | Icon color ID. |

---

### `sections`

The ordered list of rule slots in the final filter. **YAML list order = in-game evaluation order (top = highest priority).**

```yaml
sections:
  - name: "Section Label"
    source: core
    match: "Pattern"
    match_mode: exact
    prefix_build_name: false
```

| Key | Type | Required | Default | Description |
| --- | ---- | -------- | ------- | ----------- |
| `name` | string | Yes | — | Human-readable label. Also used as the anchor name for `unmatched_build_rules.after`. |
| `source` | string | Yes | — | `core` or `build` |
| `match` | string | Yes | — | Pattern matched against `nameOverride` |
| `match_mode` | string | No | `contains` | `exact`, `startswith`, or `contains` |
| `prefix_build_name` | bool | No | `true` for build, `false` for core | Prepend `"BuildName - "` to the rule's `nameOverride` in the output |

#### `source` behavior

| Value | Behavior |
| ----- | -------- |
| `core` | Takes the first matching rule from `Core.xml`. Appears once in the output. |
| `build` | Takes the first matching rule from each build file and groups them together at this position. |

#### `match_mode` behavior

| Value | Behavior |
| ----- | -------- |
| `exact` | Case-insensitive full-string equality |
| `startswith` | Name must begin with the pattern (case-insensitive) |
| `contains` | Name must contain the pattern anywhere (case-insensitive) |

---

### `unmatched_build_rules`

Catch-all for build rules that were not claimed by any section.

```yaml
unmatched_build_rules:
  placement: after
  after: "Section Name"
  prefix_build_name: true
```

| Key | Type | Description |
| --- | ---- | ----------- |
| `placement` | string | Currently only `after` is supported. |
| `after` | string | The `name` of the section after which unclaimed rules are inserted. |
| `prefix_build_name` | bool | Prepend build name to each unclaimed rule's `nameOverride`. |

---

### `ignore_build_rules`

Rules matching any entry here are silently dropped from build files during load and will never appear in the output. Uses the same `match` / `match_mode` system as sections.

```yaml
ignore_build_rules:
  - match: "Old Tier 7 Strict"
    match_mode: startswith
  - match: "experimental"
    match_mode: contains
```

---

### `overrides`

Post-placement field mutations. Evaluated against every rule in the final output list after all sections are assigned.

```yaml
overrides:
  - match: "Shatter / Removal"
    match_mode: contains
    source: build
    set:
      color: 9
      isEnabled: false
      emphasized: true
      SoundId: 4
      MapIconId: 8
      BeamSizeOverride: VERYLARGE
      BeamColorOverride: 12
```

| Key | Type | Description |
| --- | ---- | ----------- |
| `match` | string | Pattern matched against `nameOverride` |
| `match_mode` | string | `exact`, `startswith`, or `contains` (default) |
| `source` | string | `core`, `build`, or `any` (default). Scopes which rules are eligible. |
| `set` | map | Fields to mutate (see table below) |

#### Overridable fields

| Field | XML type | Side-effects |
| ----- | -------- | ------------ |
| `color` | int | Automatically sets `recolor` to `true` |
| `isEnabled` | bool | — |
| `emphasized` | bool | — |
| `SoundId` | int | — |
| `MapIconId` | int | — |
| `BeamSizeOverride` | string (`NONE` `SMALL` `MEDIUM` `LARGE` `VERYLARGE`) | Automatically sets `BeamOverride` to `true` |
| `BeamColorOverride` | int | Automatically sets `BeamOverride` to `true` |

---

## XML Format Notes

### Input files

Last Epoch filter files are standard UTF-8 XML. The script uses Python's `xml.etree.ElementTree` parser. Relevant elements:

- `<n>` — filter name (root level = filter name; inside `<Rule>` = `nameOverride`)
- `<Order>` — integer, higher = evaluated first by the game engine
- `<recolor>`, `<BeamOverride>` — boolean flags that must be set alongside color/beam fields for them to take effect

### Output file

The script regenerates the XML from scratch rather than patching the input. Structure:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <n>All Builds - Build One, Build Two</n>
  <filterIcon>0</filterIcon>
  <filterIconColor>0</filterIconColor>
  <description>...</description>
  <lastModifiedInVersion>1.4.1.2</lastModifiedInVersion>
  <lootFilterVersion>9</lootFilterVersion>
  <rules>
    <Rule> ... </Rule>
    ...
  </rules>
</ItemFilter>
```

`lastModifiedInVersion` and `lootFilterVersion` are copied from the first build file's XML. Order values are reassigned as `(total - 1 - index)` so index 0 → highest priority.

---

## Console Output Reference

```
Loading core: Core.xml
  26 core rules loaded
Loading build: Lightning Blast Runemaster.xml
  38 rules before stripping
    Stripped 26 core rule(s): ['All Items', 'Important Runes', ...]
  12 build-specific rules remaining

Assigning rules to sections...
  [INFO] Build section 'Strict - Weaver Idols' matched no rules in any build

Total rules in merged filter: 87

── Final rule order (highest priority first) ──
   86  All Items
   ...
    0  S Tier & Extremely Rare Uniques

Merged filter written to: merged_filter.xml
```

| Tag | Meaning |
| --- | ------- |
| `[WARN]` | A `core` section matched nothing in `Core.xml` — likely a typo in `config.yaml` |
| `[INFO]` | A `build` section matched nothing in any build file — normal if not all builds share that rule type |
| `Stripped N core rule(s)` | Rules dropped from a build file because their names matched the core dedup index |
| `Ignored` | Rules dropped because they matched an `ignore_build_rules` entry |

---

## Extending the Script

### Adding a new overridable field

In `apply_overrides()`, add a branch to the `set` key handler that writes the new XML element and any required side-effect flags, following the same pattern as existing fields.

### Adding a new match mode

In `matches()`, add a new branch for the mode string. Update all config sections that accept `match_mode` to document the new option.

### Adding a new section source type

In `assign_rules_to_sections()`, add handling for the new source value alongside the existing `core` / `build` branches.
