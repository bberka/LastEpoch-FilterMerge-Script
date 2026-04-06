import { useEffect, useMemo, useState } from "react";
import { exportConfigYaml, parseConfigYaml } from "./lib/config";
import { buildRuleCatalog, runMerge, validateConfig } from "./lib/merger";
import { loadPreset, loadSavedState, PRESETS, saveState } from "./lib/state";
import type { LoadedFilterFile, MergeRunResult, MergerConfig } from "./lib/types";
import { summarizeFilterFile, triggerDownload } from "./lib/xml";
import { EditorPage } from "./pages/EditorPage";
import { GuidePage } from "./pages/GuidePage";
import { MergePage } from "./pages/MergePage";

const EMPTY_CONFIG: MergerConfig = {
  output: {
    name_template: "Merged Filter - {builds}",
    description: "Merged multi-build filter",
    filter_icon: 0,
    filter_icon_color: 0,
  },
  sections: [],
  unmatched_build_rules: {
    placement: "after",
    after: null,
    prefix_build_name: true,
  },
  ignore_rules: [],
  overrides: [],
  transforms: [],
};

type Route = "/editor" | "/merge" | "/guide";

function currentRoute(): Route {
  const path = window.location.pathname as Route;
  if (path === "/merge" || path === "/guide") {
    return path;
  }
  return "/editor";
}

function navigate(path: Route) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function withSummary(file: LoadedFilterFile): LoadedFilterFile {
  const summary = summarizeFilterFile(file);
  return {
    ...file,
    displayName: summary.displayName,
    ruleCount: summary.ruleCount,
  };
}

async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsText(file);
  });
}

export function App() {
  const [route, setRoute] = useState<Route>(currentRoute());
  const [config, setConfig] = useState<MergerConfig>(EMPTY_CONFIG);
  const [coreFile, setCoreFile] = useState<LoadedFilterFile | null>(null);
  const [buildFiles, setBuildFiles] = useState<LoadedFilterFile[]>([]);
  const [configWarnings, setConfigWarnings] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<MergeRunResult | null>(null);
  const [currentPresetId, setCurrentPresetId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const saved = loadSavedState();
    if (saved) {
      setConfig(saved.config);
      setCoreFile(saved.coreFile ? withSummary(saved.coreFile) : null);
      setBuildFiles(saved.buildFiles.map(withSummary));
      setCurrentPresetId(saved.currentPresetId);
    }
  }, []);

  useEffect(() => {
    saveState(config, coreFile, buildFiles, currentPresetId);
  }, [config, coreFile, buildFiles, currentPresetId]);

  const ruleCatalog = useMemo(() => buildRuleCatalog(coreFile, buildFiles.filter((file) => file.included !== false)), [coreFile, buildFiles]);
  const validationIssues = useMemo(() => validateConfig(config, coreFile, buildFiles.filter((file) => file.included !== false)), [config, coreFile, buildFiles]);
  const exportedYaml = useMemo(() => exportConfigYaml(config), [config]);

  async function handleLoadPreset(presetId: string) {
    const preset = PRESETS.find((entry) => entry.id === presetId);
    if (!preset) {
      return;
    }
    setBusy(true);
    setLoadError(null);
    try {
      const loaded = await loadPreset(preset);
      const parsed = parseConfigYaml(loaded.configText);
      setConfig(parsed.config);
      setConfigWarnings(parsed.warnings);
      setCoreFile(withSummary(loaded.coreFile));
      setBuildFiles(loaded.buildFiles.map(withSummary));
      setCurrentPresetId(preset.id);
      setMergeResult(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  async function handleImportConfig(file: File) {
    const text = await readTextFile(file);
    const parsed = parseConfigYaml(text);
    setConfig(parsed.config);
    setConfigWarnings(parsed.warnings);
    setMergeResult(null);
  }

  async function handleImportCore(file: File) {
    const text = await readTextFile(file);
    setCoreFile(withSummary({
      id: `local-core-${crypto.randomUUID()}`,
      kind: "core",
      filename: file.name,
      source: "local",
      text,
      displayName: file.name,
      ruleCount: 0,
      included: true,
    }));
    setMergeResult(null);
  }

  async function handleImportBuilds(files: FileList | null) {
    if (!files?.length) {
      return;
    }
    const loaded = await Promise.all(
      Array.from(files).map(async (file) => {
        const text = await readTextFile(file);
        return withSummary({
          id: `local-build-${crypto.randomUUID()}`,
          kind: "build",
          filename: file.name,
          source: "local",
          text,
          displayName: file.name,
          ruleCount: 0,
          included: true,
        });
      }),
    );
    setBuildFiles((current) => [...current, ...loaded]);
    setMergeResult(null);
  }

  function handleRunMerge() {
    if (!coreFile) {
      setLoadError("Load a core XML before running merge.");
      return;
    }
    try {
      const result = runMerge(config, coreFile, buildFiles.filter((file) => file.included !== false));
      setMergeResult(result);
      setLoadError(null);
      navigate("/merge");
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  const sharedProps = {
    config,
    setConfig,
    coreFile,
    setCoreFile,
    buildFiles,
    setBuildFiles,
    configWarnings,
    validationIssues,
    ruleCatalog,
    exportedYaml,
    onLoadPreset: handleLoadPreset,
    onImportConfig: handleImportConfig,
    onImportCore: handleImportCore,
    onImportBuilds: handleImportBuilds,
    onRunMerge: handleRunMerge,
    presets: PRESETS,
    currentPresetId,
    busy,
    loadError,
    setLoadError,
  };

  return (
    <div className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Last Epoch Loot Filter Workbench</p>
          <h1>Config-first local merge UI for shared core filters and build filters.</h1>
          <p className="hero-copy">
            Edit the merger config safely, validate it against loaded XML rule names, and generate the merged filter entirely in your browser.
          </p>
        </div>
        <nav className="top-nav" aria-label="Primary">
          <button className={route === "/editor" ? "active" : ""} onClick={() => navigate("/editor")}>Editor</button>
          <button className={route === "/merge" ? "active" : ""} onClick={() => navigate("/merge")}>Merge</button>
          <button className={route === "/guide" ? "active" : ""} onClick={() => navigate("/guide")}>Guide</button>
        </nav>
      </header>

      {route === "/editor" && <EditorPage {...sharedProps} />}
      {route === "/merge" && (
        <MergePage
          mergeResult={mergeResult}
          loadError={loadError}
          onRunMerge={handleRunMerge}
          onDownloadXml={() => mergeResult && triggerDownload(`${mergeResult.outputName}.xml`, mergeResult.xml, "application/xml")}
          onDownloadYaml={() => triggerDownload("config.yaml", exportedYaml, "text/yaml")}
        />
      )}
      {route === "/guide" && <GuidePage />}
    </div>
  );
}
