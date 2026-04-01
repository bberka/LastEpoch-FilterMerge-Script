#!/usr/bin/env python3
"""
Last Epoch Loot Filter Merger
Usage:
    python merge_filters.py --builds <dir> --core <core.xml> [--config <order_config.yaml>] [--output <out.xml>]

Merges build-specific loot filter XML files with a shared Core.xml.
- Strips rules from build files that already exist in Core.xml (matched by nameOverride)
- Prefixes build-specific rule names with the build name
- Orders all rules according to order_config.yaml
- Reassigns Order values sequentially based on final position
"""

import argparse
import copy
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

try:
    import yaml
except ImportError:
    print("PyYAML is required: pip install pyyaml --break-system-packages")
    sys.exit(1)

NS = {"i": "http://www.w3.org/2001/XMLSchema-instance"}
XMLNS_ATTR = 'xmlns:i="http://www.w3.org/2001/XMLSchema-instance"'


# ── XML helpers ───────────────────────────────────────────────────────────────

def parse_filter(path: str) -> tuple[str, list[ET.Element]]:
    """Parse a filter XML and return (build_name, list_of_Rule_elements)."""
    tree = ET.parse(path)
    root = tree.getroot()
    name = root.findtext("n", default=Path(path).stem).strip()
    rules = root.findall(".//Rule")
    return name, rules


def get_name(rule: ET.Element) -> str:
    return (rule.findtext("nameOverride") or "").strip()


def rule_fingerprint(rule: ET.Element) -> str:
    """Canonical fingerprint for deduplication: just the nameOverride."""
    return get_name(rule)


def set_name(rule: ET.Element, new_name: str) -> None:
    node = rule.find("nameOverride")
    if node is not None:
        node.text = new_name


def set_order(rule: ET.Element, value: int) -> None:
    node = rule.find("Order")
    if node is not None:
        node.text = str(value)


def rule_to_xml_string(rule: ET.Element, indent: int = 4) -> str:
    """Serialize a Rule element to an indented XML string."""
    ET.indent(rule, space="  ")
    raw = ET.tostring(rule, encoding="unicode", xml_declaration=False)
    lines = raw.splitlines()
    pad = " " * indent
    return "\n".join(pad + line for line in lines)


# ── Matching ──────────────────────────────────────────────────────────────────

def matches(rule_name: str, pattern: str, mode: str) -> bool:
    """Check if a rule name matches a section pattern."""
    rn = rule_name.lower()
    pt = pattern.lower()
    if mode == "exact":
        return rn == pt
    if mode == "startswith":
        return rn.startswith(pt)
    # default: contains
    return pt in rn


# ── Core rule deduplication ───────────────────────────────────────────────────

def build_core_name_set(core_rules: list[ET.Element]) -> set[str]:
    """Return the set of nameOverride values present in core (lowercased)."""
    return {get_name(r).lower() for r in core_rules}


def strip_core_rules(build_rules: list[ET.Element], core_names: set[str]) -> list[ET.Element]:
    """Remove any rule from build_rules whose name matches a core rule name."""
    kept = []
    removed = []
    for r in build_rules:
        name_lower = get_name(r).lower()
        if name_lower in core_names:
            removed.append(get_name(r))
        else:
            kept.append(r)
    if removed:
        print(f"    Stripped {len(removed)} core rule(s): {removed}")
    return kept

def apply_overrides(
    rules: list[ET.Element],
    overrides_cfg: list[dict],
    rule_source: str,  # "core" or "build"
) -> None:
    """Mutate rules in-place applying any matching overrides from config."""
    for override in overrides_cfg:
        pattern = override.get("match", "")
        mode = override.get("match_mode", "contains")
        source_filter = override.get("source", "any")
        fields = override.get("set", {})

        if source_filter != "any" and source_filter != rule_source:
            continue

        for rule in rules:
            if not matches(get_name(rule), pattern, mode):
                continue

            for field, value in fields.items():
                node = rule.find(field)
                if node is None:
                    continue

                # Auto-set recolor if color is being overridden
                if field == "color":
                    recolor_node = rule.find("recolor")
                    if recolor_node is not None:
                        recolor_node.text = "true"

                # Auto-set BeamOverride if beam fields are touched
                if field in ("BeamSizeOverride", "BeamColorOverride"):
                    beam_node = rule.find("BeamOverride")
                    if beam_node is not None:
                        beam_node.text = "true"

                # Serialize value to XML text
                if isinstance(value, bool):
                    node.text = "true" if value else "false"
                else:
                    node.text = str(value)
                    
def strip_ignored_rules(
    build_rules: list[ET.Element],
    ignore_cfg: list[dict],
) -> list[ET.Element]:
    """Drop any build rule whose name matches an ignore entry."""
    kept = []
    removed = []
    for r in build_rules:
        name = get_name(r)
        ignored = any(
            matches(name, entry.get("match", ""), entry.get("match_mode", "contains"))
            for entry in ignore_cfg
        )
        if ignored:
            removed.append(name)
        else:
            kept.append(r)
    if removed:
        print(f"    Ignored {len(removed)} rule(s): {removed}")
    return kept

# ── Section assignment ────────────────────────────────────────────────────────

def assign_rules_to_sections(
    sections: list[dict],
    core_rules: list[ET.Element],
    build_data: list[tuple[str, list[ET.Element]]],
    unmatched_cfg: dict,
) -> list[ET.Element]:
    """
    For each section in order, pick the matching rule(s) and collect them.
    Returns flat ordered list of rules (not yet Order-numbered).
    """

    # Index core rules by name for O(1) lookup
    core_by_name: dict[str, ET.Element] = {}
    for r in core_rules:
        n = get_name(r)
        if n not in core_by_name:
            core_by_name[n] = r

    # Track which build rules have been claimed (per build)
    unclaimed: list[tuple[str, list[ET.Element]]] = [
        (bname, list(rules)) for bname, rules in build_data
    ]

    def claim_build_rules(pattern: str, mode: str) -> list[tuple[str, ET.Element]]:
        """
        For each build, find and remove the first rule matching pattern/mode.
        Returns list of (build_name, rule_element) in build order.
        """
        claimed = []
        for bname, rules in unclaimed:
            to_remove = []
            for r in rules:
                if matches(get_name(r), pattern, mode):
                    claimed.append((bname, r))
                    to_remove.append(r)
            for r in to_remove:
                rules.remove(r)
        return claimed

    result: list[ET.Element] = []
    section_names = [s["name"] for s in sections]

    # Determine insertion point for unmatched build rules
    unmatched_after_section = unmatched_cfg.get("after", None)
    unmatched_prefix = unmatched_cfg.get("prefix_build_name", True)
    unmatched_inserted = False

    def flush_unmatched():
        nonlocal unmatched_inserted
        if unmatched_inserted:
            return
        unmatched_inserted = True
        for bname, rules in unclaimed:
            for r in list(rules):
                rc = copy.deepcopy(r)
                if unmatched_prefix:
                    set_name(rc, f"{bname} - {get_name(rc)}")
                result.append(rc)
                rules.remove(r)

    for section in sections:
        src = section.get("source", "core")
        pattern = section.get("match", "")
        mode = section.get("match_mode", "contains")
        prefix = section.get("prefix_build_name", True)
        sname = section["name"]

        if src == "core":
            # Find the matching core rule
            matched = None
            for n, r in core_by_name.items():
                if matches(n, pattern, mode):
                    matched = r
                    break
            if matched is not None:
                rc = copy.deepcopy(matched)
                result.append(rc)
            else:
                print(f"  [WARN] Core section '{sname}' matched no rule (pattern='{pattern}')")

        elif src == "build":
            claimed = claim_build_rules(pattern, mode)
            if not claimed:
                print(f"  [INFO] Build section '{sname}' matched no rules in any build")
            for bname, r in claimed:
                rc = copy.deepcopy(r)
                if prefix:
                    original_name = get_name(rc)
                    if not original_name.startswith(bname):
                        set_name(rc, f"{bname} - {original_name}")
                result.append(rc)

        # After this section, flush unmatched if configured
        if unmatched_after_section and sname == unmatched_after_section:
            flush_unmatched()

    # If unmatched flush was never triggered, append at end
    flush_unmatched()

    return result


# ── Output serialization ──────────────────────────────────────────────────────

def build_output_xml(
    ordered_rules: list[ET.Element],
    filter_name: str,
    description: str,
    icon: int,
    icon_color: int,
) -> str:
    """Reassign Order values and serialize to XML string."""

    # Order values: highest = first in list (game evaluates highest Order first)
    total = len(ordered_rules)
    for i, rule in enumerate(ordered_rules):
        set_order(rule, total - 1 - i)

    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<ItemFilter {XMLNS_ATTR}>',
        f'  <n>{filter_name}</n>',
        f'  <filterIcon>{icon}</filterIcon>',
        f'  <filterIconColor>{icon_color}</filterIconColor>',
        f'  <description>{description}</description>',
        f'  <lastModifiedInVersion>1.4.1.2</lastModifiedInVersion>',
        f'  <lootFilterVersion>9</lootFilterVersion>',
        f'  <rules>',
    ]

    for rule in ordered_rules:
        ET.indent(rule, space="  ")
        rule_xml = ET.tostring(rule, encoding="unicode")
        # Indent each line by 4 spaces to sit inside <rules>
        for line in rule_xml.splitlines():
            lines.append("    " + line)

    lines.append("  </rules>")
    lines.append("</ItemFilter>")
    return "\n".join(lines)


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Merge Last Epoch build loot filters with a shared Core filter"
    )
    parser.add_argument("--builds", required=True, help="Directory containing build XML files")
    parser.add_argument("--core", required=True, help="Path to Core.xml")
    parser.add_argument(
        "--config",
        default="order_config.yaml",
        help="Path to order_config.yaml (default: order_config.yaml)",
    )
    parser.add_argument(
        "--output",
        default="merged_filter.xml",
        help="Output file path (default: merged_filter.xml)",
    )
    args = parser.parse_args()

    # ── Load config
    config_path = args.config
    if not os.path.exists(config_path):
        print(f"[ERROR] Config file not found: {config_path}")
        sys.exit(1)
    with open(config_path, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    sections = config.get("sections", [])
    output_cfg = config.get("output", {})
    unmatched_cfg = config.get("unmatched_build_rules", {"placement": "after", "after": None})

    # ── Load core
    if not os.path.exists(args.core):
        print(f"[ERROR] Core file not found: {args.core}")
        sys.exit(1)
    print(f"Loading core: {args.core}")
    _, core_rules = parse_filter(args.core)
    print(f"  {len(core_rules)} core rules loaded")
    core_names = build_core_name_set(core_rules)

    # ── Load build files
    builds_dir = args.builds
    if not os.path.isdir(builds_dir):
        print(f"[ERROR] Builds directory not found: {builds_dir}")
        sys.exit(1)

    build_files = sorted(
        p for p in Path(builds_dir).iterdir()
        if p.suffix.lower() == ".xml"
    )
    if not build_files:
        print(f"[ERROR] No XML files found in: {builds_dir}")
        sys.exit(1)

    build_data: list[tuple[str, list[ET.Element]]] = []
    ignore_cfg = config.get("ignore_build_rules", [])
    build_names: list[str] = []
    for bf in build_files:
        print(f"Loading build: {bf.name}")
        bname, brules = parse_filter(str(bf))
        print(f"  {len(brules)} rules before stripping")
        brules = strip_core_rules(brules, core_names)
        brules = strip_ignored_rules(brules, ignore_cfg)
        print(f"  {len(brules)} build-specific rules remaining")
        build_data.append((bname, brules))
        build_names.append(bname)

    # ── Build output name
    name_template = output_cfg.get("name_template", "All Builds - {builds}")
    filter_name = name_template.replace("{builds}", ", ".join(build_names))
    description = output_cfg.get("description", "Merged multi-build filter")
    icon = output_cfg.get("filter_icon", 0)
    icon_color = output_cfg.get("filter_icon_color", 0)

    # ── Assign rules to sections and produce ordered list
    print("\nAssigning rules to sections...")
    ordered_rules = assign_rules_to_sections(sections, core_rules, build_data, unmatched_cfg)
    print(f"\nTotal rules in merged filter: {len(ordered_rules)}")

    # ── Serialize
    xml_out = build_output_xml(ordered_rules, filter_name, description, icon, icon_color)

    out_path = args.output
    with open(out_path, "w", encoding="utf-8") as f:
        f.write(xml_out)
    print(f"\nMerged filter written to: {out_path}")

    # ── Print summary of final rule order
    print("\n── Final rule order (highest priority first) ──")
    for i, r in enumerate(ordered_rules):
        print(f"  {len(ordered_rules) - 1 - i:>3}  {get_name(r)}")


if __name__ == "__main__":
    main()