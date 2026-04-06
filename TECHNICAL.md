# Technical Reference — Last Epoch Filter Merger

For basic setup and usage, see [README.md](README.md). This document covers the config schema in full and explains how the script processes rules internally.

---

## Processing Pipeline

```
1. Load Core.xml              → index all rule names for dedup
2. Load filters              → strip core duplicates, drop ignored rules
3. Apply transforms           → mutate or derive rules before placement
4. Assign sections            → place rules into config-ordered slots
5. Flush unmatched            → dump remaining build rules to catch-all position
6. Apply overrides            → post-placement field mutations
7. Write output XML           → reassign Order values, serialize
```

### 1 — Load Core

Every `nameOverride` in `Core.xml` is lowercased and stored in a set. This set drives deduplication in step 2.

### 2 — Load Filters

Core is loaded first so its rule names can still drive build deduplication even if some core rules are later ignored by config.

Build files are loaded in alphabetical order by filename. For each file:

- All `<Rule>` elements are parsed
- Rules whose `nameOverride` (lowercased) matches anything in the core set are dropped — this handles raw Maxroll downloads that bundle shared rules alongside build-specific ones
- `ignore_rules` entries are applied to both core and build rules, filtered by each entry's `source`
- The build's display name comes from the root `<n>` tag; if that tag is empty, the filename stem is used as a fallback

### 3 — Apply Transforms

Transforms run before section assignment so the resulting rules are visible to the normal section-matching logic. Two operations are supported:

**`mutate`** — modifies the matched rule in-place. The original rule is changed directly; no copy is made.

**`derive`** — deep-copies the matched rule, applies the patch to the copy, then inserts the copy immediately after the source rule in the build's rule list. The source rule is left unchanged.

Both support name replacement, top-level field overrides, and condition-level patches (see [Transforms](#transforms) below).

### 4 — Assign Sections

Sections are processed in YAML order, which maps directly to in-game evaluation priority (first = highest). For each section:

- `source: core` — finds the first core rule matching the pattern, places it once
- `source: build` — finds all matching rules across all builds, groups them together at this position

Once a rule is claimed by a section it is removed from the pool and can't be matched again.

### 5 — Flush Unmatched

After all sections are processed, any build rules that weren't claimed are inserted at the position defined by `unmatched_build_rules`. These show up in the console so you can decide whether they need a proper section or should be ignored.

### 6 — Apply Overrides

`overrides` entries run against the completed rule list. Matching rules have their fields mutated in place. Some fields auto-set a companion flag — `color` sets `recolor: true`, `BeamSizeOverride` and `BeamColorOverride` set `BeamOverride: true`.

### 7 — Write Output

Rules are written in assignment order. `Order` values are assigned as `(total - 1 - index)` so the first rule in the list gets the highest `Order` and is evaluated first by the game. Filter metadata comes from the `output` config block.

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

`{builds}` in `name_template` expands to a comma-separated list of all loaded build names (from each file's `<n>` tag).

---

### `sections`

```yaml
sections:
  - name: "Wanted Tier 7 - Non Corrupt"
    source: build
    match: "Wanted Tier 7 - Non Corrupt"
    match_mode: contains
    prefix_build_name: true
```

| Key | Required | Default | Description |
| --- | -------- | ------- | ----------- |
| `name` | Yes | — | Human label. Also used as the anchor for `unmatched_build_rules.after` |
| `source` | Yes | — | `core` or `build` |
| `match` | Yes | — | Pattern matched against `nameOverride` (case-insensitive) |
| `match_mode` | No | `contains` | `exact`, `startswith`, or `contains` |
| `prefix_build_name` | No | `true` for build sections | When `true`, keep one copy per build and prepend `"BuildName - "`. When `false`, take the first matching build rule once with no prefix and discard duplicate matches from other builds |
| `use_config_name` | No | `false` | When `true`, export the rule using the section `name` instead of the matched XML rule name. If `prefix_build_name` is also `true`, the output becomes `"BuildName - {section.name}"` |

**YAML order = in-game evaluation order.** The first section listed is the first rule evaluated by the game.

---

### `unmatched_build_rules`

```yaml
unmatched_build_rules:
  placement: after
  after: "Uniques From Planner 1 LP"
  prefix_build_name: true
```

Any build rule that wasn't claimed by a section ends up here. `after` references the `name` of a section. Build names are prepended when `prefix_build_name` is true.

---

### `ignore_rules`

```yaml
ignore_rules:
  - match: "Harbinger's Needle"
    match_mode: exact
    source: core
  - match: ""
    match_mode: exact
    source: build
```

Rules matching any entry here are silently dropped during load. Same `match` / `match_mode` system as sections.

| Key | Description |
| --- | ----------- |
| `match` | Pattern matched against `nameOverride` |
| `match_mode` | `exact`, `startswith`, or `contains` (default) |
| `source` | `core`, `build`, or `any` |

`source` lets one config suppress rules from the shared core, the build files, or both. This is useful when multiple strictness profiles reuse the same core XML but need different subsets of rules.

---

### `overrides`

```yaml
overrides:
  - match: "Shatter / Removal / Important Affixes"
    match_mode: contains
    source: build
    set:
      isEnabled: "false"
```

| Key | Description |
| --- | ----------- |
| `match` | Pattern matched against `nameOverride` |
| `match_mode` | `exact`, `startswith`, or `contains` (default) |
| `source` | `core`, `build`, or `any` (default) — scopes which rules are eligible |
| `set` | Fields to mutate |

#### Overridable fields and side-effects

| Field | Type | Notes |
| ----- | ---- | ----- |
| `color` | int | Auto-sets `recolor: true` |
| `isEnabled` | bool | |
| `emphasized` | bool | |
| `SoundId` | int | |
| `MapIconId` | int | |
| `BeamSizeOverride` | string | `NONE` `SMALL` `MEDIUM` `LARGE` `VERYLARGE` — auto-sets `BeamOverride: true` |
| `BeamColorOverride` | int | Auto-sets `BeamOverride: true` |

---

### `transforms`

Transforms generate or modify build rules before they hit the section assignment step. The two operations are `mutate` (edit in-place) and `derive` (copy-and-patch, inserted after the source).

```yaml
transforms:
  - match: "Wanted Tier 7 (Can Edit Affixes & Item Type)"
    match_mode: exact
    operation: mutate
    name_replace: "Wanted Tier 7 (Can Edit Affixes & Item Type)"
    name_with: "Wanted Tier 7 - Non Corrupt (Can Edit Affixes & Item Type)"
    condition_patches:
      - type: AffixCondition
        index: 0
        set:
          combinedComparsionValue: "7"
      - type: RarityCondition
        inject_xml: >-
          <Condition xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                     xsi:type="RarityCondition"><rarity>EXALTED</rarity></Condition>
```

#### Top-level transform keys

| Key | Required | Description |
| --- | -------- | ----------- |
| `match` | Yes | Pattern matched against `nameOverride` |
| `match_mode` | No | `exact`, `startswith`, or `contains` (default) |
| `operation` | Yes | `mutate` or `derive` |
| `name_replace` | No | Substring to find in the rule's name |
| `name_with` | No | Replacement string |
| `set` | No | Top-level field overrides — same fields as `overrides.set` |
| `condition_patches` | No | List of patches to apply to the rule's `<conditions>` block |

#### `condition_patches` entries

Each entry targets one `<Condition>` element inside `<conditions>` by type and index.

| Key | Description |
| --- | ----------- |
| `type` | Condition type string, e.g. `AffixCondition`, `RarityCondition`, `SubTypeCondition`, `CorruptionCondition` |
| `index` | Which occurrence to target when multiple conditions share a type (0-based, default `0`) |
| `set` | Dict of field → value to write on child elements of the target condition |
| `inject_xml` | Raw XML string of a new `<Condition>` element to append to `<conditions>` |
| `remove` | `true` to remove the matched condition entirely |

#### The two built-in transform patterns

**Wanted Tier 7 → Wanted Tier 7 - Non Corrupt** (mutate)

Takes the original `Wanted Tier 7` rule from each build file and converts it to a non-corrupt exalted filter. Changes applied:

- `AffixCondition[0].combinedComparsionValue`: `1` → `7`
- Appends `RarityCondition: EXALTED`
- Appends `CorruptionCondition: OnlyUncorrupted`

**Wanted Tier 7 - Non Corrupt → Wanted Havoc** (derive)

Creates a disabled sibling rule for Rune of Havoc use. Same affix list as the Wanted Tier 7 rule, but instead of requiring those affixes at tier 7, it uses them as a presence check (has the affix at any tier) and gates on total tier sum to ensure there's room to craft.

Changes applied to the copy:

- Name: `"Wanted Tier 7 - Non Corrupt"` → `"Wanted Havoc"`
- `AffixCondition[0].advanced`: `true` → `false` (presence check mode, any tier)
- Injects a second `AffixCondition` with an empty affix list, `comparsionValue: 7`, `combinedComparsionValue: 15`, `advanced: true` — this ensures at least one T7 affix exists while keeping total tier sum low enough to leave crafting room
- `color`: `7` → `16`
- `isEnabled`: `false` (disabled by default — enable manually when hunting havoc targets)

---

## Architecture Reference

```
merge_filters.py
│
├── parse_filter(path)                XML → (build_name, [Rule elements])
├── get_name / set_name / set_order   Read/write nameOverride and Order fields
├── matches(name, pattern, mode)      Pattern matching (exact/startswith/contains)
│
├── build_core_name_set(rules)        Build dedup index from core rule names
├── strip_core_rules(rules, names)    Drop build rules whose names are in core
├── strip_ignored_rules(rules, cfg)   Drop rules matching ignore_rules
│
├── _apply_condition_patches(node, patches)   Patch/inject/remove Condition elements
├── _patch_rule(rule, ...)            Apply name replace + set fields + condition patches
├── apply_transforms(build_data, cfg) Run mutate/derive transforms on all builds
│
├── apply_overrides(rules, cfg)       Post-placement field mutations
├── assign_rules_to_sections(…)       Core merge: map rules → ordered section slots
├── build_output_xml(…)               Reassign Order values, serialize to XML string
└── main()                            CLI entry (argparse)
```

**Dependencies:** Python 3.10+, PyYAML. Nothing else.

---

## Console Tags

| Tag | What it means |
| --- | ------------- |
| `[WARN]` | A `core` section matched nothing in `Core.xml` — likely a typo in the section's `match` value |
| `[INFO]` | A `build` section matched nothing in any build file — normal if not all builds share that rule type |
| `Stripped N core rule(s)` | Rules dropped from a build file because their names were in the core dedup index |
| `Ignored N core/build rule(s)` | Rules dropped because they matched an `ignore_rules` entry |
| `Transform mutate` | A transform edited a build rule in-place |
| `Transform derive` | A transform created a new rule as a copy of an existing one |

---

## Extending the Script

**New overridable field** — add a branch in `apply_overrides()` that writes the XML element and any required side-effect flags, following the same pattern as `color` or `BeamSizeOverride`.

**New match mode** — add a branch in `matches()` and update any config documentation that lists `match_mode` options.

**New condition type** — `_apply_condition_patches()` matches conditions by their `xsi:type` attribute. No code changes needed — just use the type string in your config's `condition_patches` entry.

**New transform operation** — add a branch alongside `mutate` / `derive` in `apply_transforms()`.

---

## XML Format Notes

Last Epoch filter files are standard UTF-8 XML. The script uses `xml.etree.ElementTree`. A few quirks worth knowing:

- `<n>` at the root level is the filter name; `<nameOverride>` inside each `<Rule>` is what you see in the UI
- `<recolor>` must be `true` for the `<color>` field to take effect — the script sets this automatically via overrides and transforms
- `<BeamOverride>` must be `true` for beam fields to take effect — same automatic handling
- `Order` values are reassigned from scratch on every run — the input values don't matter

Output structure:

```xml
<?xml version="1.0" encoding="utf-8"?>
<ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance">
  <n>All Builds - Bladedancer, Runemaster</n>
  <filterIcon>0</filterIcon>
  <filterIconColor>0</filterIconColor>
  <description>Merged multi-build filter</description>
  <lastModifiedInVersion>1.4.1.2</lastModifiedInVersion>
  <lootFilterVersion>9</lootFilterVersion>
  <rules>
    <Rule> ... </Rule>
    ...
  </rules>
</ItemFilter>
```

---

*This project was developed with AI assistance.*
