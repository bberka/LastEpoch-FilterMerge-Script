import type { LoadedFilterFile, MergerConfig } from "./types";

export interface PresetDefinition {
  id: string;
  label: string;
  description: string;
  corePath: string;
  configPath: string;
  buildPaths: string[];
}

export const PRESETS: PresetDefinition[] = [
  {
    id: "uber",
    label: "Uber Demo Preset",
    description: "Core-Uber + config-uber + builds folder",
    corePath: "/presets/uber/Core-Uber.xml",
    configPath: "/presets/uber/config-uber.yaml",
    buildPaths: [
      "/presets/uber/Anurok Frogs Beastmaster.xml",
      "/presets/uber/Ballista Falconer.xml",
      "/presets/uber/Bladestorm Bladedancer.xml",
      "/presets/uber/Lightning Blast Runemaster.xml",
      "/presets/uber/Shadow Cascade Bladedancer.xml",
      "/presets/uber/Warpath Void Knight.xml"
    ]
  },
  {
    id: "giga",
    label: "Giga Demo Preset",
    description: "Core-Giga + config-giga + stier folder",
    corePath: "/presets/giga/Core-Giga.xml",
    configPath: "/presets/giga/config-giga.yaml",
    buildPaths: [
      "/presets/giga/Abomination Necromancer.xml",
      "/presets/giga/Anurok Frogs Beastmaster.xml",
      "/presets/giga/Ballista Falconer.xml",
      "/presets/giga/Erasing Strike Void Knight.xml",
      "/presets/giga/Flay Mana Lich.xml",
      "/presets/giga/Judgement Aura Paladin.xml",
      "/presets/giga/Judgement Paladin.xml",
      "/presets/giga/Lightning Blast Runemaster.xml",
      "/presets/giga/Rip Blood Lich.xml",
      "/presets/giga/Shadow Cascade Bladedancer.xml",
      "/presets/giga/Shadow Rend Bladedancer.xml",
      "/presets/giga/Storm Crows Beastmaster.xml",
      "/presets/giga/Warpath Void Knight.xml"
    ]
  }
];

export async function fetchTextAsset(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Failed to load ${path}`);
  }
  return response.text();
}

export async function loadPreset(preset: PresetDefinition): Promise<{
  coreFile: LoadedFilterFile;
  buildFiles: LoadedFilterFile[];
  configText: string;
}> {
  const [coreText, configText, ...buildTexts] = await Promise.all([
    fetchTextAsset(preset.corePath),
    fetchTextAsset(preset.configPath),
    ...preset.buildPaths.map((path) => fetchTextAsset(path)),
  ]);

  const coreFile: LoadedFilterFile = {
    id: `${preset.id}:core`,
    kind: "core",
    filename: preset.corePath.split("/").pop()!,
    source: "preset",
    text: coreText,
    displayName: preset.label,
    ruleCount: 0,
    included: true,
  };

  const buildFiles = buildTexts.map((text, index) => ({
    id: `${preset.id}:build:${index}`,
    kind: "build" as const,
    filename: preset.buildPaths[index].split("/").pop()!,
    source: "preset" as const,
    text,
    displayName: preset.buildPaths[index].split("/").pop()!.replace(/\.[^.]+$/, ""),
    ruleCount: 0,
    included: true,
  }));

  return { coreFile, buildFiles, configText };
}

const STORAGE_KEY = "le-workbench-state-v1";

export function saveState(config: MergerConfig, coreFile: LoadedFilterFile | null, buildFiles: LoadedFilterFile[], currentPresetId: string | null) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      config,
      coreFile,
      buildFiles,
      currentPresetId,
    }),
  );
}

export function loadSavedState(): {
  config: MergerConfig;
  coreFile: LoadedFilterFile | null;
  buildFiles: LoadedFilterFile[];
  currentPresetId: string | null;
} | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : null;
}
