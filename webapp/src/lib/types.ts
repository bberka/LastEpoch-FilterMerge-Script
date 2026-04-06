export type MatchMode = "exact" | "startswith" | "contains";
export type RuleSource = "core" | "build" | "any";
export type FilterFileKind = "core" | "build" | "config";
export type LogLevel = "info" | "warn";

export interface OutputConfig {
  name_template?: string;
  description?: string;
  filter_icon?: number;
  filter_icon_color?: number;
}

export interface SectionConfig {
  name: string;
  source: "core" | "build";
  match: string;
  match_mode?: MatchMode;
  prefix_build_name?: boolean;
  use_config_name?: boolean;
  merge?: boolean;
}

export interface UnmatchedBuildRulesConfig {
  placement?: "after";
  after?: string | null;
  prefix_build_name?: boolean;
}

export interface IgnoreRuleConfig {
  match: string;
  match_mode?: MatchMode;
  source?: RuleSource;
}

export interface OverrideFieldSet {
  color?: string | number;
  isEnabled?: string | boolean;
  emphasized?: string | boolean;
  SoundId?: string | number;
  MapIconId?: string | number;
  BeamSizeOverride?: string;
  BeamColorOverride?: string | number;
  [key: string]: string | number | boolean | undefined;
}

export interface OverrideConfig {
  match: string;
  match_mode?: MatchMode;
  source?: RuleSource;
  set: OverrideFieldSet;
}

export interface ConditionPatch {
  type: string;
  index?: number;
  set?: Record<string, string | number | boolean>;
  inject_xml?: string;
  remove?: boolean;
}

export interface TransformConfig {
  match: string;
  match_mode?: MatchMode;
  operation: "mutate" | "derive";
  name_replace?: string;
  name_with?: string;
  set?: OverrideFieldSet;
  condition_patches?: ConditionPatch[];
}

export interface MergerConfig {
  output?: OutputConfig;
  sections: SectionConfig[];
  unmatched_build_rules?: UnmatchedBuildRulesConfig;
  ignore_rules?: IgnoreRuleConfig[];
  overrides?: OverrideConfig[];
  transforms?: TransformConfig[];
}

export interface LoadedFilterFile {
  id: string;
  kind: FilterFileKind;
  filename: string;
  source: "preset" | "local";
  text: string;
  displayName: string;
  ruleCount: number;
  included?: boolean;
}

export interface RuleIndexEntry {
  name: string;
  normalizedName: string;
  source: "core" | "build";
  buildName?: string;
  count: number;
}

export interface MergeLogEntry {
  level: LogLevel;
  message: string;
}

export interface MergeStats {
  coreRuleCount: number;
  buildFileCount: number;
  buildRuleCount: number;
  totalRules: number;
}

export interface MergeRunResult {
  xml: string;
  outputName: string;
  orderedRuleNames: string[];
  logs: MergeLogEntry[];
  unmatchedBuildRules: string[];
  stats: MergeStats;
}

export interface ValidationIssue {
  level: "warn" | "info";
  message: string;
}

export interface ImportedConfigResult {
  config: MergerConfig;
  warnings: string[];
}

export interface ParsedFilter {
  displayName: string;
  rules: Element[];
  document: XMLDocument;
}
