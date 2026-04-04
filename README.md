# Last Epoch Loot Filter Merger

Tired of swapping filters every time you switch builds? This tool takes your build-specific filters from Maxroll and a shared core filter, and merges them into a single `.xml` you can load directly in Last Epoch. One filter, all your builds.

---

## Requirements

- **Python 3.10 or newer** — [python.org](https://www.python.org/downloads/)
- **PyYAML** — install with:

```
pip install pyyaml
```

---

## File Layout

```
merge_filters.py       ← the script
config.yaml            ← controls rule order and settings
Core.xml               ← your shared base filter
builds/
    Bladedancer.xml
    Runemaster.xml
    Void Knight.xml
```

**Core.xml** contains rules that apply to every build — currency, runes, glyphs, universal loot tiers, altar rules, etc. These appear once in the merged output no matter how many builds you load.

**builds/** holds one `.xml` per build. Download them from Maxroll and drop them in. Rename the files however you want — the script reads the actual filter name from inside the XML, not the filename. If the `<n>` tag inside the file is empty the filename is used as a fallback.

**config.yaml** controls what ends up in the output and in what order. The `example/` folder has ready-made configs for different strictness levels — pick the closest one and adjust from there. See [TECHNICAL.md](TECHNICAL.md) for the full config reference.

---

## Running

```
python merge_filters.py --builds ./builds --core Core.xml --config config.yaml --output merged_filter.xml
```

| Option | Required | Default |
| ------ | -------- | ------- |
| `--builds` | Yes | — |
| `--core` | Yes | — |
| `--config` | No | `config.yaml` |
| `--output` | No | `merged_filter.xml` |

---

## Loading in Last Epoch

Copy `merged_filter.xml` to your filters folder:

```
%appdata%\..\LocalLow\Eleventh Hour Games\Last Epoch\Filters
```

Then pick it from **Settings → Loot Filter** in-game. If you regenerate the file with the same name, just reload the filter in the settings screen — no need to re-select it.

---

## What the Script Actually Does

1. Loads `Core.xml` and indexes every rule name
2. Loads each build file, strips any rules whose names already appear in core (handles raw Maxroll downloads that bundle shared rules), and drops anything listed in `ignore_build_rules`
3. Runs any `transforms` entries — these can mutate existing build rules or generate new sibling rules derived from them (see TECHNICAL.md)
4. Assigns every rule to its section slot in config order
5. Any build rules that didn't match a section are placed at the `unmatched_build_rules` position
6. Applies `overrides` — post-placement field mutations (disable a rule, change color, etc.)
7. Writes the final XML with sequential `Order` values assigned from top to bottom

The console output tells you exactly what was stripped, ignored, transformed, and where unmatched rules landed.

---

## Adding a New Build

Drop the `.xml` into your builds folder and re-run. Duplicate rules are handled automatically. If the new build introduces rules that don't match any section in your config, they'll appear in the catch-all group at the `unmatched_build_rules` position — check the console output to see what landed there and decide whether to add a proper section for them.

---

## Strictness Levels

The `example/` folder has four configs:

| File | Description |
| ---- | ----------- |
| `config_Regular.yaml` | Early game / casual — shows most loot |
| `config_Strict.yaml` | Mid-game — starts hiding low-tier drops |
| `config_VeryStrict.yaml` | Late game — only things worth picking up |
| `config_UberStrict.yaml` | Deep endgame — absolute minimum shown |

---

## Troubleshooting

**Script won't start** — Run `python --version`. If Python isn't found, reinstall it and check "Add to PATH" during setup.

**Filter doesn't appear in-game** — Check the file is in the correct Filters folder and ends in `.xml`, not `.xml.txt`. Windows sometimes hides extensions.

**A rule I expected is missing** — Look at the console output when you ran the script. `[WARN]` means a `core` section in your config matched nothing in `Core.xml` — usually a typo. `[INFO]` means a `build` section matched nothing in any build file, which is normal if not every build has that rule type.

**Rule shows up with the wrong name** — The prefix comes from the `<n>` tag inside each build XML. If it's empty, the filename is used. Rename the file or update the `<n>` tag to get a cleaner label.

---

## Console Output Reference

```
Loading core: Core.xml
  38 core rules loaded
Loading build: Bladedancer.xml
  34 rules before stripping
    Stripped 19 core rule(s): ['All Items', 'Important Runes', ...]
    Ignored 2 rule(s): ['', "Harbinger's Needle"]
  13 build-specific rules remaining

Applying transforms...
    Transform mutate: 'Wanted Tier 7 - Non Corrupt ...' in build 'Bladedancer'
    Transform derive: 'Wanted Havoc ...' from 'Wanted Tier 7 - Non Corrupt ...' in build 'Bladedancer'

Assigning rules to sections...
  [INFO] Build section 'Strict - Stout Idols' matched no rules in any build

Total rules in merged filter: 52

Merged filter written to: merged_filter.xml
```

---

*This project was developed with AI assistance.*