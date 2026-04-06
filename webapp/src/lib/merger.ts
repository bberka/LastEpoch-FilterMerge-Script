import { parseFilterXml } from "./xml";
import type {
  ConditionPatch,
  LoadedFilterFile,
  MatchMode,
  MergeLogEntry,
  MergeRunResult,
  MergerConfig,
  OverrideConfig,
  OverrideFieldSet,
  ParsedFilter,
  RuleIndexEntry,
  RuleSource,
  ValidationIssue,
} from "./types";

interface BuildRuleSet {
  buildName: string;
  rules: Element[];
}

function stem(filename: string) {
  return filename.replace(/\.[^.]+$/, "");
}

function renderTemplate(template: string, buildNames: string[]) {
  const builds = buildNames.join(", ");
  return template.replaceAll("{builds}", builds).replaceAll("{builds]", builds);
}

function getName(rule: Element) {
  return rule.querySelector(":scope > nameOverride")?.textContent?.trim() ?? "";
}

function setName(rule: Element, value: string) {
  const node = rule.querySelector(":scope > nameOverride");
  if (node) {
    node.textContent = value;
  }
}

function setField(rule: Element, field: string, value: string | number | boolean) {
  const node = rule.querySelector(`:scope > ${field}`);
  if (!node) {
    return;
  }
  node.textContent = typeof value === "boolean" ? String(value).toLowerCase() : String(value);
}

function setOrder(rule: Element, value: number) {
  setField(rule, "Order", value);
}

export function matches(ruleName: string, pattern: string, mode: MatchMode = "contains") {
  const rn = ruleName.toLowerCase();
  const pt = pattern.toLowerCase();
  if (mode === "exact") {
    return rn === pt;
  }
  if (mode === "startswith") {
    return rn.startsWith(pt);
  }
  return rn.includes(pt);
}

function buildCoreNameSet(coreRules: Element[]) {
  return new Set(coreRules.map((rule) => getName(rule).toLowerCase()));
}

function pushLog(logs: MergeLogEntry[], level: MergeLogEntry["level"], message: string) {
  logs.push({ level, message });
}

function stripCoreRules(buildRules: Element[], coreNames: Set<string>, logs: MergeLogEntry[]) {
  const kept: Element[] = [];
  const removed: string[] = [];
  for (const rule of buildRules) {
    const name = getName(rule);
    if (coreNames.has(name.toLowerCase())) {
      removed.push(name);
    } else {
      kept.push(rule);
    }
  }
  if (removed.length) {
    pushLog(logs, "info", `Stripped ${removed.length} core rule(s): ${removed.join(", ")}`);
  }
  return kept;
}

function stripIgnoredRules(
  rules: Element[],
  ignoreRules: MergerConfig["ignore_rules"] = [],
  ruleSource: "core" | "build",
  logs?: MergeLogEntry[],
) {
  const kept: Element[] = [];
  const removed: string[] = [];
  for (const rule of rules) {
    const name = getName(rule);
    const ignored = ignoreRules.some((entry) => {
      const source = entry.source ?? "build";
      return (source === "any" || source === ruleSource) && matches(name, entry.match, entry.match_mode ?? "contains");
    });
    if (ignored) {
      removed.push(name);
    } else {
      kept.push(rule);
    }
  }
  if (removed.length && logs) {
    pushLog(logs, "info", `Ignored ${removed.length} ${ruleSource} rule(s): ${removed.join(", ")}`);
  }
  return kept;
}

function conditionType(condition: Element) {
  return condition.getAttribute("i:type") || condition.getAttribute("xsi:type") || condition.getAttribute("type") || "";
}

function patchConditionFields(target: Element, fields: Record<string, string | number | boolean>) {
  for (const [field, value] of Object.entries(fields)) {
    const node = target.querySelector(`:scope > ${field}`);
    if (node) {
      node.textContent = typeof value === "boolean" ? String(value).toLowerCase() : String(value);
    }
  }
}

function parseConditionSnippet(injectXml: string) {
  const parser = new DOMParser();
  const document = parser.parseFromString(`<conditions xmlns:i="http://www.w3.org/2001/XMLSchema-instance">${injectXml}</conditions>`, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error("Invalid transform inject_xml snippet");
  }
  const condition = document.documentElement.firstElementChild;
  if (!condition) {
    throw new Error("inject_xml did not produce a Condition element");
  }
  return condition;
}

function applyConditionPatches(conditionsNode: Element, patches: ConditionPatch[] = []) {
  for (const patch of patches) {
    const found = Array.from(conditionsNode.children).filter((child) => conditionType(child) === patch.type);
    const index = patch.index ?? 0;
    const target = found[index];

    if (patch.remove) {
      target?.remove();
      continue;
    }

    if (patch.set && target) {
      patchConditionFields(target, patch.set);
    }

    if (patch.inject_xml) {
      conditionsNode.appendChild(conditionsNode.ownerDocument.importNode(parseConditionSnippet(patch.inject_xml), true));
    }
  }
}

function applyRuleFields(rule: Element, fields: OverrideFieldSet = {}) {
  for (const [field, value] of Object.entries(fields)) {
    if (value === undefined) {
      continue;
    }
    if (field === "color") {
      setField(rule, "recolor", true);
    }
    if (field === "BeamSizeOverride" || field === "BeamColorOverride") {
      setField(rule, "BeamOverride", true);
    }
    setField(rule, field, value);
  }
}

function patchRule(rule: Element, transform: NonNullable<MergerConfig["transforms"]>[number]) {
  if (transform.name_replace) {
    setName(rule, getName(rule).replace(transform.name_replace, transform.name_with ?? ""));
  }
  applyRuleFields(rule, transform.set);
  const conditions = rule.querySelector(":scope > conditions");
  if (conditions) {
    applyConditionPatches(conditions, transform.condition_patches);
  }
}

function applyTransforms(buildData: BuildRuleSet[], config: MergerConfig, logs: MergeLogEntry[]) {
  for (const transform of config.transforms ?? []) {
    for (const build of buildData) {
      const insertions: Array<{ index: number; rule: Element }> = [];
      build.rules.forEach((rule, index) => {
        if (!matches(getName(rule), transform.match, transform.match_mode ?? "contains")) {
          return;
        }
        if (transform.operation === "mutate") {
          patchRule(rule, transform);
          pushLog(logs, "info", `Transform mutate: ${getName(rule)} in build ${build.buildName}`);
          return;
        }
        const derived = rule.cloneNode(true) as Element;
        patchRule(derived, transform);
        insertions.push({ index: index + 1, rule: derived });
        pushLog(logs, "info", `Transform derive: ${getName(derived)} from ${getName(rule)} in build ${build.buildName}`);
      });
      insertions.reverse().forEach(({ index, rule }) => build.rules.splice(index, 0, rule));
    }
  }
}

function applyOverrides(rules: Element[], overrides: OverrideConfig[] = [], ruleSource: "core" | "build") {
  for (const override of overrides) {
    const source = override.source ?? "any";
    if (source !== "any" && source !== ruleSource) {
      continue;
    }
    for (const rule of rules) {
      if (!matches(getName(rule), override.match, override.match_mode ?? "contains")) {
        continue;
      }
      applyRuleFields(rule, override.set);
    }
  }
}

function conditionSignature(condition: Element) {
  const clone = condition.cloneNode(true) as Element;
  const type = conditionType(clone);
  if (type === "AffixCondition") {
    clone.querySelector(":scope > affixes")?.remove();
  } else if (type === "SubTypeCondition") {
    clone.querySelector(":scope > type")?.remove();
  } else if (type === "UniqueModifiersCondition") {
    clone.querySelectorAll(":scope > Uniques").forEach((node) => node.remove());
  } else if (type === "RarityCondition") {
    clone.querySelector(":scope > rarity")?.remove();
  }
  return new XMLSerializer().serializeToString(clone);
}

function dedupePreserveOrder(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}

function mergeAffixCondition(base: Element, other: Element) {
  const baseAffixes = base.querySelector(":scope > affixes");
  const otherAffixes = other.querySelector(":scope > affixes");
  if (!baseAffixes || !otherAffixes) {
    return;
  }
  const merged = dedupePreserveOrder([
    ...Array.from(baseAffixes.getElementsByTagName("int")).map((node) => node.textContent?.trim() ?? "").filter(Boolean),
    ...Array.from(otherAffixes.getElementsByTagName("int")).map((node) => node.textContent?.trim() ?? "").filter(Boolean),
  ]);
  baseAffixes.replaceChildren(...merged.map((value) => {
    const node = base.ownerDocument.createElement("int");
    node.textContent = value;
    return node;
  }));
}

function mergeSubtypeCondition(base: Element, other: Element) {
  const baseTypes = base.querySelector(":scope > type");
  const otherTypes = other.querySelector(":scope > type");
  if (!baseTypes || !otherTypes) {
    return;
  }
  const merged = dedupePreserveOrder([
    ...Array.from(baseTypes.getElementsByTagName("EquipmentType")).map((node) => node.textContent?.trim() ?? "").filter(Boolean),
    ...Array.from(otherTypes.getElementsByTagName("EquipmentType")).map((node) => node.textContent?.trim() ?? "").filter(Boolean),
  ]);
  baseTypes.replaceChildren(...merged.map((value) => {
    const node = base.ownerDocument.createElement("EquipmentType");
    node.textContent = value;
    return node;
  }));
}

function mergeUniqueModifiersCondition(base: Element, other: Element) {
  const seen = new Set<string>();
  const merged: Element[] = [];
  for (const entry of [...Array.from(base.querySelectorAll(":scope > Uniques")), ...Array.from(other.querySelectorAll(":scope > Uniques"))]) {
    const id = entry.querySelector(":scope > UniqueId")?.textContent?.trim() ?? "";
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    merged.push(entry.cloneNode(true) as Element);
  }
  base.replaceChildren(...merged.map((entry) => base.ownerDocument.importNode(entry, true)));
}

function mergeRarityCondition(base: Element, other: Element) {
  const baseNode = base.querySelector(":scope > rarity");
  const otherNode = other.querySelector(":scope > rarity");
  if (!baseNode || !otherNode) {
    return;
  }
  const merged = dedupePreserveOrder([...(baseNode.textContent ?? "").trim().split(/\s+/).filter(Boolean), ...(otherNode.textContent ?? "").trim().split(/\s+/).filter(Boolean)]);
  baseNode.textContent = merged.join(" ");
}

function mergeSupportedCondition(base: Element, other: Element) {
  const type = conditionType(base);
  if (type === "AffixCondition") {
    mergeAffixCondition(base, other);
  } else if (type === "SubTypeCondition") {
    mergeSubtypeCondition(base, other);
  } else if (type === "UniqueModifiersCondition") {
    mergeUniqueModifiersCondition(base, other);
  } else if (type === "RarityCondition") {
    mergeRarityCondition(base, other);
  }
}

function mergeBuildRules(claimed: Array<{ buildName: string; rule: Element }>) {
  const first = claimed[0];
  const mergedRule = first.rule.cloneNode(true) as Element;
  const mergedConditions = mergedRule.querySelector(":scope > conditions");
  if (!mergedConditions) {
    return { buildName: first.buildName, rule: mergedRule };
  }

  const indexed = new Map<string, { signature: string; condition: Element }>();
  const counts = new Map<string, number>();
  for (const condition of Array.from(mergedConditions.children)) {
    const type = conditionType(condition);
    const index = counts.get(type) ?? 0;
    indexed.set(`${type}:${index}`, { signature: conditionSignature(condition), condition });
    counts.set(type, index + 1);
  }

  for (const entry of claimed.slice(1)) {
    const otherConditions = entry.rule.querySelector(":scope > conditions");
    if (!otherConditions) {
      continue;
    }
    const otherCounts = new Map<string, number>();
    for (const otherCondition of Array.from(otherConditions.children)) {
      const type = conditionType(otherCondition);
      const index = otherCounts.get(type) ?? 0;
      otherCounts.set(type, index + 1);
      const base = indexed.get(`${type}:${index}`);
      if (!base) {
        continue;
      }
      if (base.signature === conditionSignature(otherCondition)) {
        mergeSupportedCondition(base.condition, otherCondition);
      }
    }
  }

  return { buildName: first.buildName, rule: mergedRule };
}

function assignRulesToSections(
  config: MergerConfig,
  coreRules: Element[],
  buildData: BuildRuleSet[],
  logs: MergeLogEntry[],
) {
  const coreByName = new Map<string, Element>();
  coreRules.forEach((rule) => {
    const name = getName(rule);
    if (!coreByName.has(name)) {
      coreByName.set(name, rule);
    }
  });

  const unclaimed = buildData.map((build) => ({ buildName: build.buildName, rules: [...build.rules] }));
  const result: Element[] = [];
  const unmatchedNames: string[] = [];
  const unmatchedConfig = config.unmatched_build_rules ?? { placement: "after", after: null, prefix_build_name: true };
  let unmatchedInserted = false;

  const flushUnmatched = () => {
    if (unmatchedInserted) {
      return;
    }
    unmatchedInserted = true;
    for (const build of unclaimed) {
      for (const rule of [...build.rules]) {
        const cloned = rule.cloneNode(true) as Element;
        if (unmatchedConfig.prefix_build_name ?? true) {
          setName(cloned, `${build.buildName} - ${getName(cloned)}`);
        }
        applyOverrides([cloned], config.overrides, "build");
        result.push(cloned);
        unmatchedNames.push(getName(cloned));
        build.rules.splice(build.rules.indexOf(rule), 1);
      }
    }
  };

  const claimBuildRules = (pattern: string, mode: MatchMode, firstOnly: boolean) => {
    const claimed: Array<{ buildName: string; rule: Element }> = [];
    let firstClaim: { buildName: string; rule: Element } | undefined;
    for (const build of unclaimed) {
      const toRemove: Element[] = [];
      for (const rule of build.rules) {
        if (!matches(getName(rule), pattern, mode)) {
          continue;
        }
        if (firstOnly) {
          firstClaim ??= { buildName: build.buildName, rule };
        } else {
          claimed.push({ buildName: build.buildName, rule });
        }
        toRemove.push(rule);
      }
      toRemove.forEach((rule) => build.rules.splice(build.rules.indexOf(rule), 1));
    }
    if (firstOnly && firstClaim) {
      claimed.push(firstClaim);
    }
    return claimed;
  };

  for (const section of config.sections) {
    const mode = section.match_mode ?? "contains";
    const prefix = section.prefix_build_name ?? (section.source === "build");
    const useConfigName = section.use_config_name ?? false;

    if (section.source === "core") {
      let matched: Element | undefined;
      for (const [name, rule] of coreByName) {
        if (matches(name, section.match, mode)) {
          matched = rule;
          break;
        }
      }
      if (!matched) {
        pushLog(logs, "warn", `Core section '${section.name}' matched no rule (pattern='${section.match}')`);
      } else {
        const cloned = matched.cloneNode(true) as Element;
        if (useConfigName) {
          setName(cloned, section.name);
        }
        applyOverrides([cloned], config.overrides, "core");
        result.push(cloned);
      }
    } else {
      let claimed = claimBuildRules(section.match, mode, !section.merge && !prefix);
      if (!claimed.length) {
        pushLog(logs, "info", `Build section '${section.name}' matched no rules in any build`);
      }
      if (section.merge && claimed.length) {
        claimed = [mergeBuildRules(claimed)];
      }
      for (const entry of claimed) {
        const cloned = entry.rule.cloneNode(true) as Element;
        const baseName = useConfigName ? section.name : getName(cloned);
        if (prefix) {
          if (!baseName.startsWith(entry.buildName)) {
            setName(cloned, `${entry.buildName} - ${baseName}`);
          }
        } else if (useConfigName) {
          setName(cloned, baseName);
        }
        applyOverrides([cloned], config.overrides, "build");
        result.push(cloned);
      }
    }

    if (unmatchedConfig.after && section.name === unmatchedConfig.after) {
      flushUnmatched();
    }
  }

  flushUnmatched();
  return { rules: result, unmatchedNames };
}

function buildOutputXml(orderedRules: Element[], filterName: string, description: string, icon: number, iconColor: number) {
  const parser = new DOMParser();
  const document = parser.parseFromString(
    `<?xml version="1.0" encoding="utf-8"?><ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><name></name><filterIcon>0</filterIcon><filterIconColor>0</filterIconColor><description></description><lastModifiedInVersion>1.4.2.2</lastModifiedInVersion><lootFilterVersion>9</lootFilterVersion><rules></rules></ItemFilter>`,
    "application/xml",
  );
  document.querySelector("name")!.textContent = filterName;
  document.querySelector("filterIcon")!.textContent = String(icon);
  document.querySelector("filterIconColor")!.textContent = String(iconColor);
  document.querySelector("description")!.textContent = description;
  const rulesNode = document.querySelector("rules")!;
  const total = orderedRules.length;
  orderedRules.forEach((rule, index) => {
    setOrder(rule, total - 1 - index);
    rulesNode.appendChild(document.importNode(rule, true));
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n${new XMLSerializer().serializeToString(document.documentElement)}`;
}

export function buildRuleCatalog(coreFile: LoadedFilterFile | null, buildFiles: LoadedFilterFile[]): RuleIndexEntry[] {
  const counts = new Map<string, RuleIndexEntry>();
  const loaded: Array<{ file: LoadedFilterFile; parsed: ParsedFilter }> = [];
  if (coreFile) {
    loaded.push({ file: coreFile, parsed: parseFilterXml(coreFile.text, coreFile.filename) });
  }
  for (const file of buildFiles) {
    loaded.push({ file, parsed: parseFilterXml(file.text, file.filename) });
  }

  for (const { file, parsed } of loaded) {
    const source = file.kind === "core" ? "core" : "build";
    for (const rule of parsed.rules) {
      const name = getName(rule);
      const key = `${source}:${parsed.displayName}:${name}`;
      const existing = counts.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        counts.set(key, {
          name,
          normalizedName: name.toLowerCase(),
          source,
          buildName: source === "build" ? parsed.displayName : undefined,
          count: 1,
        });
      }
    }
  }

  return [...counts.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function validateConfig(config: MergerConfig, coreFile: LoadedFilterFile | null, buildFiles: LoadedFilterFile[]): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const coreNames = new Set<string>();
  const buildNames = new Set<string>();

  if (coreFile) {
    for (const rule of parseFilterXml(coreFile.text, coreFile.filename).rules) {
      coreNames.add(getName(rule).toLowerCase());
    }
  }
  for (const file of buildFiles) {
    for (const rule of parseFilterXml(file.text, file.filename).rules) {
      buildNames.add(getName(rule).toLowerCase());
    }
  }

  for (const section of config.sections) {
    if (section.match_mode === "exact") {
      const bucket = section.source === "core" ? coreNames : buildNames;
      if (!bucket.has(section.match.toLowerCase())) {
        issues.push({ level: "warn", message: `Section '${section.name}' exact match currently hits no loaded ${section.source} rule.` });
      }
    }
  }

  const anchor = config.unmatched_build_rules?.after;
  if (anchor && !config.sections.some((section) => section.name === anchor)) {
    issues.push({ level: "warn", message: `Unmatched build rules anchor '${anchor}' does not match any section name.` });
  }

  return issues;
}

export function runMerge(config: MergerConfig, coreFile: LoadedFilterFile, buildFiles: LoadedFilterFile[]): MergeRunResult {
  const logs: MergeLogEntry[] = [];
  const parsedCore = parseFilterXml(coreFile.text, coreFile.filename);
  pushLog(logs, "info", `Loading core: ${coreFile.filename}`);
  pushLog(logs, "info", `${parsedCore.rules.length} core rules loaded`);

  let coreRules = parsedCore.rules.map((rule) => rule.cloneNode(true) as Element);
  const coreNames = buildCoreNameSet(coreRules);
  coreRules = stripIgnoredRules(coreRules, config.ignore_rules, "core", logs);

  const buildData: BuildRuleSet[] = [];
  const buildNames: string[] = [];
  let buildRuleCount = 0;
  for (const file of buildFiles.filter((entry) => entry.included !== false)) {
    const parsedBuild = parseFilterXml(file.text, file.filename);
    pushLog(logs, "info", `Loading build: ${file.filename}`);
    pushLog(logs, "info", `${parsedBuild.rules.length} rules before stripping`);
    let buildRules = parsedBuild.rules.map((rule) => rule.cloneNode(true) as Element);
    buildRules = stripCoreRules(buildRules, coreNames, logs);
    buildRules = stripIgnoredRules(buildRules, config.ignore_rules, "build", logs);
    pushLog(logs, "info", `${buildRules.length} build-specific rules remaining`);
    buildData.push({ buildName: parsedBuild.displayName || stem(file.filename), rules: buildRules });
    buildNames.push(parsedBuild.displayName || stem(file.filename));
    buildRuleCount += buildRules.length;
  }

  if (config.transforms?.length) {
    pushLog(logs, "info", "Applying transforms...");
    applyTransforms(buildData, config, logs);
  }

  pushLog(logs, "info", "Assigning rules to sections...");
  const assigned = assignRulesToSections(config, coreRules, buildData, logs);
  const outputName = renderTemplate(config.output?.name_template || "Merged Filter - {builds}", buildNames);
  const description = renderTemplate(config.output?.description || "Merged multi-build filter", buildNames);
  const xml = buildOutputXml(
    assigned.rules,
    outputName,
    description,
    Number(config.output?.filter_icon ?? 0),
    Number(config.output?.filter_icon_color ?? 0),
  );

  const totalRules = assigned.rules.length;
  if (totalRules > 200) {
    pushLog(logs, "warn", `Merged filter has ${totalRules} rules, which exceeds the 200-rule limit`);
  }

  return {
    xml,
    outputName,
    orderedRuleNames: assigned.rules.map((rule) => getName(rule)),
    logs,
    unmatchedBuildRules: assigned.unmatchedNames,
    stats: {
      coreRuleCount: coreRules.length,
      buildFileCount: buildData.length,
      buildRuleCount,
      totalRules,
    },
  };
}

