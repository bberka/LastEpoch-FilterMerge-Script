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
- Applies field overrides (color, isEnabled, emphasized, SoundId, etc.) from config
- Applies transforms: mutate existing rules or derive new sibling rules from them
"""

import argparse
import copy
import os
import sys
import xml.etree.ElementTree as ET
from pathlib import Path
from xml.sax.saxutils import escape

try:
    import yaml
except ImportError:
    print("PyYAML is required: pip install pyyaml --break-system-packages")
    sys.exit(1)

XMLNS_ATTR = 'xmlns:i="http://www.w3.org/2001/XMLSchema-instance"'

CONDITION_XMLNS = 'http://www.w3.org/2001/XMLSchema-instance'
XSI_TYPE = f'{{{CONDITION_XMLNS}}}type'


# ── XML helpers ───────────────────────────────────────────────────────────────

def parse_filter(path: str) -> tuple[str, list[ET.Element]]:
    """Parse a filter XML and return (build_name, list_of_Rule_elements)."""
    tree = ET.parse(path)
    root = tree.getroot()
    name = Path(path).stem
    rules = root.findall(".//Rule")
    return name, rules


def render_template(template: str, build_names: list[str]) -> str:
    """Expand supported placeholders in output text."""
    builds = ", ".join(build_names)
    return template.replace("{builds}", builds).replace("{builds]", builds)


def get_name(rule: ET.Element) -> str:
    return (rule.findtext("nameOverride") or "").strip()


def set_name(rule: ET.Element, new_name: str) -> None:
    node = rule.find("nameOverride")
    if node is not None:
        node.text = new_name


def set_order(rule: ET.Element, value: int) -> None:
    node = rule.find("Order")
    if node is not None:
        node.text = str(value)


def set_field(rule: ET.Element, field: str, value) -> None:
    node = rule.find(field)
    if node is not None:
        if isinstance(value, bool):
            node.text = "true" if value else "false"
        else:
            node.text = str(value)


# ── Matching ──────────────────────────────────────────────────────────────────

def matches(rule_name: str, pattern: str, mode: str) -> bool:
    """Check if a rule name matches a pattern."""
    rn = rule_name.lower()
    pt = pattern.lower()
    if mode == "exact":
        return rn == pt
    if mode == "startswith":
        return rn.startswith(pt)
    return pt in rn  # contains (default)


# ── Stripping ─────────────────────────────────────────────────────────────────

def build_core_name_set(core_rules: list[ET.Element]) -> set[str]:
    """Return the set of nameOverride values present in core (lowercased)."""
    return {get_name(r).lower() for r in core_rules}


def strip_core_rules(build_rules: list[ET.Element], core_names: set[str]) -> list[ET.Element]:
    """Remove any rule from build_rules whose name matches a core rule name."""
    kept, removed = [], []
    for r in build_rules:
        if get_name(r).lower() in core_names:
            removed.append(get_name(r))
        else:
            kept.append(r)
    if removed:
        print(f"    Stripped {len(removed)} core rule(s): {removed}")
    return kept


def strip_ignored_rules(
    build_rules: list[ET.Element],
    ignore_cfg: list[dict],
) -> list[ET.Element]:
    """Drop any build rule whose name matches an ignore entry."""
    kept, removed = [], []
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


# ── Transforms ────────────────────────────────────────────────────────────────

def _apply_condition_patches(conditions_node: ET.Element, patches: list[dict]) -> None:
    """
    Apply a list of condition patch operations to a <conditions> element.

    Each patch entry is a dict with:
      type        : condition type string, e.g. "AffixCondition"
      index       : which occurrence to target (0-based, default 0)
      set         : dict of field -> value to set on child elements
      inject_xml  : raw XML string of a new <Condition> element to append
      remove      : if true, remove this condition entirely
    """
    for patch in patches:
        ctype = patch.get("type")
        index = patch.get("index", 0)
        set_fields = patch.get("set", {})
        inject_xml = patch.get("inject_xml")
        remove = patch.get("remove", False)

        # Collect all conditions matching this type
        matching = [
            c for c in conditions_node
            if c.get(XSI_TYPE, "").split("}")[-1] == ctype
               or c.get(XSI_TYPE, "") == ctype
        ]

        if remove:
            if index < len(matching):
                conditions_node.remove(matching[index])
            continue

        if set_fields and index < len(matching):
            target = matching[index]
            for field, value in set_fields.items():
                node = target.find(field)
                if node is not None:
                    if isinstance(value, bool):
                        node.text = "true" if value else "false"
                    else:
                        node.text = str(value)

        if inject_xml:
            # Register xsi namespace so it survives parse
            ET.register_namespace("xsi", CONDITION_XMLNS)
            new_cond = ET.fromstring(inject_xml)
            conditions_node.append(new_cond)


def apply_transforms(
    build_data: list[tuple[str, list[ET.Element]]],
    transforms_cfg: list[dict],
) -> None:
    """
    Process all transform entries against all build rule lists in-place.

    Each transform entry:
      match            : pattern to match against nameOverride
      match_mode       : exact / startswith / contains (default contains)
      operation        : "mutate" or "derive"
      name_replace     : for derive — replace this substring in the name
      name_with        : for derive — replace with this substring
      set              : top-level field overrides (same as overrides.set)
      condition_patches: list of condition patch dicts (see _apply_condition_patches)
    """
    for transform in transforms_cfg:
        pattern = transform.get("match", "")
        mode = transform.get("match_mode", "contains")
        operation = transform.get("operation", "mutate")
        name_replace = transform.get("name_replace", "")
        name_with = transform.get("name_with", "")
        set_fields = transform.get("set", {})
        cond_patches = transform.get("condition_patches", [])

        for bname, rules in build_data:
            insertions = []  # (index, new_rule) for derive operations

            for i, rule in enumerate(rules):
                if not matches(get_name(rule), pattern, mode):
                    continue

                if operation == "mutate":
                    # Modify the rule directly
                    target = rule
                    _patch_rule(target, name_replace, name_with, set_fields, cond_patches)
                    print(f"    Transform mutate: '{get_name(target)}' in build '{bname}'")

                elif operation == "derive":
                    # Create a deep copy, patch the copy, insert it after the source
                    derived = copy.deepcopy(rule)
                    _patch_rule(derived, name_replace, name_with, set_fields, cond_patches)
                    insertions.append((i + 1, derived))
                    print(f"    Transform derive: '{get_name(derived)}' from '{get_name(rule)}' in build '{bname}'")

            # Insert derived rules in reverse order so indices remain valid
            for idx, new_rule in reversed(insertions):
                rules.insert(idx, new_rule)


def _patch_rule(
    rule: ET.Element,
    name_replace: str,
    name_with: str,
    set_fields: dict,
    cond_patches: list[dict],
) -> None:
    """Apply name replacement, field overrides, and condition patches to a rule."""
    # Name replacement
    if name_replace:
        old_name = get_name(rule)
        new_name = old_name.replace(name_replace, name_with)
        set_name(rule, new_name)

    # Top-level field overrides
    for field, value in set_fields.items():
        node = rule.find(field)
        if node is not None:
            if field == "color":
                recolor = rule.find("recolor")
                if recolor is not None:
                    recolor.text = "true"
            if field in ("BeamSizeOverride", "BeamColorOverride"):
                beam = rule.find("BeamOverride")
                if beam is not None:
                    beam.text = "true"
            if isinstance(value, bool):
                node.text = "true" if value else "false"
            else:
                node.text = str(value)

    # Condition patches
    if cond_patches:
        conditions = rule.find("conditions")
        if conditions is not None:
            _apply_condition_patches(conditions, cond_patches)


# ── Overrides ─────────────────────────────────────────────────────────────────

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

                if field == "color":
                    recolor_node = rule.find("recolor")
                    if recolor_node is not None:
                        recolor_node.text = "true"

                if field in ("BeamSizeOverride", "BeamColorOverride"):
                    beam_node = rule.find("BeamOverride")
                    if beam_node is not None:
                        beam_node.text = "true"

                if isinstance(value, bool):
                    node.text = "true" if value else "false"
                else:
                    node.text = str(value)


# ── Section assignment ────────────────────────────────────────────────────────

def assign_rules_to_sections(
    sections: list[dict],
    core_rules: list[ET.Element],
    build_data: list[tuple[str, list[ET.Element]]],
    unmatched_cfg: dict,
    overrides_cfg: list[dict],
) -> list[ET.Element]:
    """
    For each section in order, pick the matching rule(s) and collect them.
    Applies overrides after placement.
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
        For each build, find and remove all rules matching pattern/mode.
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

    unmatched_after_section = unmatched_cfg.get("after", None)
    unmatched_prefix = unmatched_cfg.get("prefix_build_name", True)
    unmatched_inserted = False

    def flush_unmatched() -> None:
        nonlocal unmatched_inserted
        if unmatched_inserted:
            return
        unmatched_inserted = True
        for bname, rules in unclaimed:
            for r in list(rules):
                rc = copy.deepcopy(r)
                if unmatched_prefix:
                    set_name(rc, f"{bname} - {get_name(rc)}")
                apply_overrides([rc], overrides_cfg, "build")
                result.append(rc)
                rules.remove(r)

    for section in sections:
        src = section.get("source", "core")
        pattern = section.get("match", "")
        mode = section.get("match_mode", "contains")
        prefix = section.get("prefix_build_name", True)
        sname = section["name"]

        if src == "core":
            matched = None
            for n, r in core_by_name.items():
                if matches(n, pattern, mode):
                    matched = r
                    break
            if matched is not None:
                rc = copy.deepcopy(matched)
                apply_overrides([rc], overrides_cfg, "core")
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
                apply_overrides([rc], overrides_cfg, "build")
                result.append(rc)

        if unmatched_after_section and sname == unmatched_after_section:
            flush_unmatched()

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
    total = len(ordered_rules)
    for i, rule in enumerate(ordered_rules):
        set_order(rule, total - 1 - i)

    lines = [
        '<?xml version="1.0" encoding="utf-8"?>',
        f'<ItemFilter {XMLNS_ATTR}>',
        f'  <n>{escape(filter_name)}</n>',
        f'  <filterIcon>{icon}</filterIcon>',
        f'  <filterIconColor>{icon_color}</filterIconColor>',
        f'  <description>{escape(description)}</description>',
        f'  <lastModifiedInVersion>1.4.1.2</lastModifiedInVersion>',
        f'  <lootFilterVersion>9</lootFilterVersion>',
        f'  <rules>',
    ]

    for rule in ordered_rules:
        ET.indent(rule, space="  ")
        rule_xml = ET.tostring(rule, encoding="unicode")
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
    if not os.path.exists(args.config):
        print(f"[ERROR] Config file not found: {args.config}")
        sys.exit(1)
    with open(args.config, "r", encoding="utf-8") as f:
        config = yaml.safe_load(f)

    sections = config.get("sections", [])
    output_cfg = config.get("output", {})
    unmatched_cfg = config.get("unmatched_build_rules", {"placement": "after", "after": None})
    ignore_cfg = config.get("ignore_build_rules", [])
    overrides_cfg = config.get("overrides", [])
    transforms_cfg = config.get("transforms", [])

    # ── Load core
    if not os.path.exists(args.core):
        print(f"[ERROR] Core file not found: {args.core}")
        sys.exit(1)
    print(f"Loading core: {args.core}")
    _, core_rules = parse_filter(args.core)
    print(f"  {len(core_rules)} core rules loaded")
    core_names = build_core_name_set(core_rules)

    # ── Load build files
    if not os.path.isdir(args.builds):
        print(f"[ERROR] Builds directory not found: {args.builds}")
        sys.exit(1)

    build_files = sorted(
        p for p in Path(args.builds).iterdir()
        if p.suffix.lower() == ".xml"
    )
    if not build_files:
        print(f"[ERROR] No XML files found in: {args.builds}")
        sys.exit(1)

    build_data: list[tuple[str, list[ET.Element]]] = []
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

    # ── Apply transforms (mutate / derive) before section assignment
    if transforms_cfg:
        print("\nApplying transforms...")
        apply_transforms(build_data, transforms_cfg)

    # ── Build output metadata
    filter_name = Path(args.output).stem
    description_template = output_cfg.get("description", "Merged multi-build filter")
    description = render_template(description_template, build_names)
    icon = output_cfg.get("filter_icon", 0)
    icon_color = output_cfg.get("filter_icon_color", 0)

    # ── Assign rules to sections and apply overrides
    print("\nAssigning rules to sections...")
    ordered_rules = assign_rules_to_sections(
        sections, core_rules, build_data, unmatched_cfg, overrides_cfg
    )
    print(f"\nTotal rules in merged filter: {len(ordered_rules)}")

    # ── Serialize and write
    xml_out = build_output_xml(ordered_rules, filter_name, description, icon, icon_color)
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(xml_out)
    print(f"\nMerged filter written to: {args.output}")

    # Print summary
    print("\nFinal rule order (highest priority first)")
    for i, r in enumerate(ordered_rules):
        print(f"  {len(ordered_rules) - 1 - i:>3}  {get_name(r)}")


if __name__ == "__main__":
    main()
