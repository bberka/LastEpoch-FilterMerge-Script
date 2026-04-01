# Last Epoch Loot Filter Merger

A Python script that merges multiple build-specific loot filters with a shared core filter into a single valid Last Epoch `.xml` filter file. Rule ordering, deduplication, naming, and field overrides are all controlled via a YAML config file.

---

## Requirements

- Python 3.10+
- PyYAML

```bash
pip install pyyaml --break-system-packages
```

---

## File Structure

```
merge_filters.py       # The merger script
order_config.yaml      # Ordering, ignore, and override configuration
Core.xml               # Shared rules used across all builds
builds/
    Shadow_Rend_Bladedancer.xml
    Lightning_Blast_Runemaster.xml
    Fire_Aura_Spellblade.xml
    ...
```

---

## Usage

```bash
python merge_filters.py \
    --builds ./builds \
    --core Core.xml \
    --config order_config.yaml \
    --output merged_filter.xml
```

| Argument | Required | Default | Description |
|---|---|---|---|
| `--builds` | Yes | — | Directory containing build XML files |
| `--core` | Yes | — | Path to Core.xml |
| `--config` | No | `order_config.yaml` | Path to the order config |
| `--output` | No | `merged_filter.xml` | Output file path |

---

## How It Works

### Build Files

Build files are downloaded from Maxroll and placed in the builds directory. They can be either:

- **Raw Maxroll downloads** — the script automatically strips any rule whose name matches a rule already present in `Core.xml`
- **Pre-trimmed files** — with shared rules already removed, these pass through stripping unchanged

The build name used for rule prefixing is read from the `<n>` tag inside the XML, not the filename.

### Core File

`Core.xml` contains all rules shared across every build — currency, runes, glyphs, omen idols, leveling uniques, LP tiers, exalted rules, etc. These rules appear exactly once in the merged output regardless of how many build files also contain them.

### Merging & Ordering

Rules are placed into the output in the order sections appear in `order_config.yaml`. Sections with `source: core` pull a single rule from `Core.xml`. Sections with `source: build` pull one matching rule from each build file and group them together. The game evaluates rules from highest `Order` value to lowest — the script reassigns all `Order` values sequentially so the YAML position is the only thing you need to think about.

---

## order_config.yaml

### `output`

Controls the merged filter's metadata.

```yaml
output:
  name_template: "All Builds - {builds}"   # {builds} expands to comma-separated build names
  description: "Merged multi-build filter"
  filter_icon: 0
  filter_icon_color: 0
```

---

### `sections`

The heart of the config. Each entry is a slot in the final filter. **Order in this list = order in the game.**

```yaml
sections:
  - name: "All Items"          # Human-readable label, also used by unmatched_build_rules
    source: core               # "core" or "build"
    match: "All Items"         # Pattern matched against the rule's nameOverride
    match_mode: exact          # "exact", "startswith", or "contains"
    prefix_build_name: true    # Prepend "BuildName - " to the rule name (build rules only)
```

#### `source`

| Value | Behaviour |
|---|---|
| `core` | Takes the matching rule from `Core.xml` once |
| `build` | Takes the matching rule from each build file and inserts them grouped together |

#### `match_mode`

| Value | Behaviour |
|---|---|
| `exact` | Full name must match exactly (case-insensitive) |
| `startswith` | Name must begin with the pattern |
| `contains` | Name must contain the pattern (default) |

#### `prefix_build_name`

When `true` (default for build rules), the build name is prepended to the rule name in the output:

```
Shatter / Removal / Important Affixes (Edit Affixes)
→ Shadow Rend Bladedancer - Shatter / Removal / Important Affixes (Edit Affixes)
```

---

### `unmatched_build_rules`

Any build rule not claimed by any section is collected here instead of being silently dropped.

```yaml
unmatched_build_rules:
  placement: after
  after: "Uniques From Planner 1 LP"   # Section name to insert after
  prefix_build_name: true
```

---

### `ignore_build_rules`

Rules matching any entry here are silently dropped from build files during loading and will never appear in the output. Uses the same `match` / `match_mode` system as sections.

```yaml
ignore_build_rules:
  - match: "Some Rule I Never Want"
    match_mode: exact
  - match: "Tier 7 Strict"
    match_mode: startswith
  - match: "old experimental"
    match_mode: contains
```

---

### `overrides`

Overrides let you change specific XML fields on rules after they are placed, without editing the source files. Useful for standardizing visual presentation across builds — colors, sounds, beams, enabled state, etc.

```yaml
overrides:
  - match: "Shatter / Removal / Important Affixes"
    match_mode: contains
    source: build        # "core", "build", or "any"
    set:
      color: 9
      isEnabled: false
      emphasized: true
      SoundId: 4
      BeamSizeOverride: VERYLARGE
      BeamColorOverride: 12
```

#### Overridable fields

| Field | Type | Notes |
|---|---|---|
| `color` | integer | Setting this automatically sets `recolor` to `true` |
| `isEnabled` | boolean | |
| `emphasized` | boolean | |
| `SoundId` | integer | |
| `MapIconId` | integer | |
| `BeamSizeOverride` | string | e.g. `NONE`, `SMALL`, `MEDIUM`, `LARGE`, `VERYLARGE` — setting this automatically sets `BeamOverride` to `true` |
| `BeamColorOverride` | integer | Setting this automatically sets `BeamOverride` to `true` |

The `source` field scopes the override so it only applies to rules of that origin:

| Value | Applies to |
|---|---|
| `build` | Build-specific rules only |
| `core` | Core rules only |
| `any` | All rules (default) |

---

## Adding a New Build

1. Download the filter from Maxroll and place the `.xml` file in the builds directory
2. Run the script — shared rules are stripped automatically
3. Add any new build-specific rule names to `order_config.yaml` if they don't match an existing section

---

## Adding a Custom Rule

Create the rule in the appropriate source file (`Core.xml` for shared rules, or a build file for build-specific rules), then add a matching section entry to `order_config.yaml` at the position you want it to appear.

Example — a custom rule called `Generic Havoc` that should appear above all `Shatter` rules:

```yaml
  - name: "Generic Havoc"
    source: build
    match: "Generic Havoc"
    match_mode: exact
    prefix_build_name: true

  - name: "Shatter / Removal / Important Affixes"
    source: build
    match: "Shatter / Removal / Important Affixes"
    match_mode: contains
    prefix_build_name: true
```

---

## Console Output

The script prints a full summary on every run:

```
Loading core: Core.xml
  26 core rules loaded
Loading build: Shadow_Rend_Bladedancer.xml
  16 rules before stripping
  16 build-specific rules remaining
Loading build: Lightning_Blast_Runemaster.xml
  38 rules before stripping
    Stripped 26 core rule(s): [...]
  12 build-specific rules remaining

Assigning rules to sections...
  [INFO] Build section 'Strict - Weaver Idols' matched no rules in any build

Total rules in merged filter: 87

── Final rule order (highest priority first) ──
   86  All Items
   85  Important Runes
   ...
    0  S Tier & Extremely Rare Uniques

Merged filter written to: merged_filter.xml
```

- `[WARN]` — a core section matched no rule in `Core.xml` (likely a typo in the config)
- `[INFO]` — a build section matched no rules in any build (normal if not all builds have that rule type)
- `Stripped` — rules removed because they duplicate a core rule
- `Ignored` — rules removed because they matched an `ignore_build_rules` entry