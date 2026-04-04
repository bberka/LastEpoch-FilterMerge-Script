# Last Epoch Loot Filter Merger

This tool combines multiple build-specific loot filters (downloaded from Maxroll) with a shared "core" filter into a single `.xml` file you can load directly in Last Epoch. Instead of switching filters every time you swap builds, you get one filter that covers all of them.

---

## What You Need

- **Python 3.10 or newer** — download from [python.org](https://www.python.org/downloads/)
- **PyYAML** — a small Python library. Install it by opening a terminal and running:

```
pip install pyyaml
```

---

## Setting Up Your Files

Organize your files like this:

```
merge_filters.py       ← the script (this tool)
config.yaml            ← controls rule order and settings
Core.xml               ← rules shared across all your builds
builds/
    Build One.xml
    Build Two.xml
    Build Three.xml
    ...
```

**Core.xml** — This is your "base" filter containing rules that apply to every build: currency, runes, glyphs, universal loot tiers, etc. These rules appear once in the final filter no matter how many builds you have.

**builds/ folder** — Put one `.xml` file per build here. Download each from Maxroll, rename them however you like. The script reads the actual filter name from inside the file.

**config.yaml** — Controls the order rules appear in the final filter. See the [example folder](example/) for ready-to-use configs at different strictness levels (Regular, Strict, Very Strict, Uber Strict). Copy the one closest to what you want and adjust it.

---

## Running the Script

Open a terminal in the same folder as `merge_filters.py` and run:

```
python merge_filters.py --builds ./builds --core Core.xml --config config.yaml --output merged_filter.xml
```

That's it. The script will create `merged_filter.xml` in the same folder.

### What the options mean

| Option | Required | What it does |
| ------ | -------- | ------------ |
| `--builds` | Yes | Path to the folder with your build `.xml` files |
| `--core` | Yes | Path to your shared core filter |
| `--config` | No | Path to your config file (default: `config.yaml`) |
| `--output` | No | Name/path for the output file (default: `merged_filter.xml`) |

---

## Using the Merged Filter in Last Epoch

1. Copy `merged_filter.xml` into your Last Epoch filters folder:
   - Windows: `%appdata%\..\LocalLow\Eleventh Hour Games\Last Epoch\Filters`
2. Open the game, go to **Settings → Loot Filter**, and select the merged filter.

---

## What Happens When You Run It

The script:

1. Loads your `Core.xml` and all build files in the builds folder
2. Removes duplicate rules — if a build file already contains a rule that's in Core.xml, the duplicate is dropped so it only appears once
3. Puts all rules in the order defined by your `config.yaml`
4. Writes a single clean `.xml` filter file

The console will print a summary showing which rules were loaded, which duplicates were removed, and the final rule order.

---

## Adding a New Build

1. Download the filter `.xml` from Maxroll
2. Drop it in your builds folder
3. Run the script again

Duplicate rules are handled automatically. If the new build has rules that don't match any section in `config.yaml`, they'll be placed in a catch-all group at the position defined by `unmatched_build_rules` in your config.

---

## Choosing a Strictness Level

The [example/](example/) folder contains four ready-made configs:

| File | Who it's for |
| ---- | ------------ |
| `config_Regular.yaml` | Casual / early game — shows most loot |
| `config_Strict.yaml` | Mid-game — hides low-tier drops |
| `config_VeryStrict.yaml` | Late game — only relevant items show |
| `config_UberStrict.yaml` | Endgame farming — shows only top-tier loot |

Copy whichever one fits your situation and pass it with `--config`.

---

## Troubleshooting

**The script won't start** — Make sure Python is installed and accessible. Run `python --version` in your terminal. If it's not found, reinstall Python and check "Add to PATH" during setup.

**My filter doesn't show up in-game** — Make sure the file is in the correct Filters folder and has a `.xml` extension (not `.xml.txt`).

**A rule is missing from the output** — Check the console output when running the script. Lines marked `[WARN]` or `[INFO]` tell you when a rule from your config matched nothing in your files.

**I want to understand the config in detail** — See [TECHNICAL.md](TECHNICAL.md) for a full reference.
