import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { parseConfigYaml } from "./config";
import { matches, runMerge } from "./merger";
import type { LoadedFilterFile } from "./types";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function fixture(path: string) {
  return readFileSync(resolve(__dirname, "../../..", path), "utf8");
}

function file(kind: "core" | "build", filename: string, text: string): LoadedFilterFile {
  return {
    id: `${kind}:${filename}`,
    kind,
    filename,
    source: "local",
    text,
    displayName: filename,
    ruleCount: 0,
    included: true,
  };
}

function parseSummary(xml: string) {
  const document = new DOMParser().parseFromString(xml, "application/xml");
  return {
    outputName:
      document.querySelector("ItemFilter > n")?.textContent?.trim() ||
      document.querySelector("ItemFilter > name")?.textContent?.trim() ||
      "",
    description: document.querySelector("ItemFilter > description")?.textContent?.trim() || "",
    ruleNames: Array.from(document.getElementsByTagName("Rule")).map(
      (rule) => rule.getElementsByTagName("nameOverride")[0]?.textContent?.trim() ?? "",
    ),
  };
}

describe("matches", () => {
  it("supports exact startswith and contains", () => {
    expect(matches("Harbinger Uniques", "Harbinger Uniques", "exact")).toBe(true);
    expect(matches("Harbinger Uniques", "Harbinger", "startswith")).toBe(true);
    expect(matches("Harbinger Uniques", "Uniques", "contains")).toBe(true);
  });
});

describe("runMerge parity", () => {
  it("matches the shipped uber merged structure", () => {
    const config = parseConfigYaml(fixture("config-uber.yaml")).config;
    config.output ??= {};
    config.output.name_template = "TalaFilter CoF - Custom - Uber Strict";

    const result = runMerge(config, file("core", "Core-Uber.xml", fixture("Core-Uber.xml")), [
      file("build", "Anurok Frogs Beastmaster.xml", fixture("builds/Anurok Frogs Beastmaster.xml")),
      file("build", "Ballista Falconer.xml", fixture("builds/Ballista Falconer.xml")),
      file("build", "Bladestorm Bladedancer.xml", fixture("builds/Bladestorm Bladedancer.xml")),
      file("build", "Lightning Blast Runemaster.xml", fixture("builds/Lightning Blast Runemaster.xml")),
      file("build", "Shadow Cascade Bladedancer.xml", fixture("builds/Shadow Cascade Bladedancer.xml")),
      file("build", "Warpath Void Knight.xml", fixture("builds/Warpath Void Knight.xml")),
    ]);

    const expected = parseSummary(fixture("TalaFilter CoF - Custom - Uber Strict.xml"));
    const actual = parseSummary(result.xml);
    expect(actual.outputName).toBe("TalaFilter CoF - Custom - Uber Strict");
    expect(actual.description).toBe(expected.description);
    expect(actual.ruleNames).toEqual(expected.ruleNames);
  });

  it("matches the shipped giga merged structure", () => {
    const config = parseConfigYaml(fixture("config-giga.yaml")).config;
    config.output ??= {};
    config.output.name_template = "TalaFilter CoF - All Maxroll S Tier Builds - Giga Strict";

    const result = runMerge(config, file("core", "Core-Giga.xml", fixture("Core-Giga.xml")), [
      file("build", "Abomination Necromancer.xml", fixture("stier/Abomination Necromancer.xml")),
      file("build", "Anurok Frogs Beastmaster.xml", fixture("stier/Anurok Frogs Beastmaster.xml")),
      file("build", "Ballista Falconer.xml", fixture("stier/Ballista Falconer.xml")),
      file("build", "Erasing Strike Void Knight.xml", fixture("stier/Erasing Strike Void Knight.xml")),
      file("build", "Flay Mana Lich.xml", fixture("stier/Flay Mana Lich.xml")),
      file("build", "Judgement Aura Paladin.xml", fixture("stier/Judgement Aura Paladin.xml")),
      file("build", "Judgement Paladin.xml", fixture("stier/Judgement Paladin.xml")),
      file("build", "Lightning Blast Runemaster.xml", fixture("stier/Lightning Blast Runemaster.xml")),
      file("build", "Rip Blood Lich.xml", fixture("stier/Rip Blood Lich.xml")),
      file("build", "Shadow Cascade Bladedancer.xml", fixture("stier/Shadow Cascade Bladedancer.xml")),
      file("build", "Shadow Rend Bladedancer.xml", fixture("stier/Shadow Rend Bladedancer.xml")),
      file("build", "Storm Crows Beastmaster.xml", fixture("stier/Storm Crows Beastmaster.xml")),
      file("build", "Warpath Void Knight.xml", fixture("stier/Warpath Void Knight.xml")),
    ]);

    const expected = parseSummary(fixture("TalaFilter CoF - All Maxroll S Tier Builds - Giga Strict.xml"));
    const actual = parseSummary(result.xml);
    expect(actual.outputName).toBe("TalaFilter CoF - All Maxroll S Tier Builds - Giga Strict");
    expect(actual.description.startsWith("Merged multi-build filter, contains following builds:")).toBe(true);
    expect(actual.ruleNames).toEqual(expected.ruleNames);
  });
});
