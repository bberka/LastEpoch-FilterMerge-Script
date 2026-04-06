import yaml from "js-yaml";
import type { ImportedConfigResult, MergerConfig } from "./types";

const TOP_LEVEL_KEYS = new Set([
  "output",
  "sections",
  "unmatched_build_rules",
  "ignore_rules",
  "ignore_build_rules",
  "overrides",
  "transforms",
]);

function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : [];
}

export function normalizeConfig(value: unknown): MergerConfig {
  const data = (value ?? {}) as Record<string, unknown>;
  return {
    output: typeof data.output === "object" && data.output ? (data.output as MergerConfig["output"]) : {},
    sections: asArray(data.sections as MergerConfig["sections"]),
    unmatched_build_rules:
      typeof data.unmatched_build_rules === "object" && data.unmatched_build_rules
        ? (data.unmatched_build_rules as MergerConfig["unmatched_build_rules"])
        : { placement: "after", after: null, prefix_build_name: true },
    ignore_rules: asArray((data.ignore_rules ?? data.ignore_build_rules) as MergerConfig["ignore_rules"]),
    overrides: asArray(data.overrides as MergerConfig["overrides"]),
    transforms: asArray(data.transforms as MergerConfig["transforms"]),
  };
}

export function parseConfigYaml(text: string): ImportedConfigResult {
  const raw = (yaml.load(text) ?? {}) as Record<string, unknown>;
  const warnings = Object.keys(raw)
    .filter((key) => !TOP_LEVEL_KEYS.has(key))
    .map((key) => `Unsupported top-level config key imported: ${key}`);

  return {
    config: normalizeConfig(raw),
    warnings,
  };
}

export function exportConfigYaml(config: MergerConfig): string {
  return yaml.dump(config, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  });
}
