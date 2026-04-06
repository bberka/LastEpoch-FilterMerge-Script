import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { LoadedFilterFile, MergerConfig, RuleIndexEntry, ValidationIssue } from "../lib/types";
import { triggerDownload } from "../lib/xml";

interface EditorPageProps {
  config: MergerConfig;
  setConfig: Dispatch<SetStateAction<MergerConfig>>;
  coreFile: LoadedFilterFile | null;
  setCoreFile: Dispatch<SetStateAction<LoadedFilterFile | null>>;
  buildFiles: LoadedFilterFile[];
  setBuildFiles: Dispatch<SetStateAction<LoadedFilterFile[]>>;
  configWarnings: string[];
  validationIssues: ValidationIssue[];
  ruleCatalog: RuleIndexEntry[];
  exportedYaml: string;
  onLoadPreset: (presetId: string) => Promise<void>;
  onImportConfig: (file: File) => Promise<void>;
  onImportCore: (file: File) => Promise<void>;
  onImportBuilds: (files: FileList | null) => Promise<void>;
  onRunMerge: () => void;
  presets: Array<{ id: string; label: string; description: string }>;
  currentPresetId: string | null;
  busy: boolean;
  loadError: string | null;
  setLoadError: Dispatch<SetStateAction<string | null>>;
}

function updateListItem<T>(items: T[], index: number, value: T) {
  return items.map((item, current) => (current === index ? value : item));
}

function removeListItem<T>(items: T[], index: number) {
  return items.filter((_, current) => current !== index);
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= items.length) {
    return items;
  }
  const clone = [...items];
  [clone[index], clone[next]] = [clone[next], clone[index]];
  return clone;
}

function CatalogList({ title, entries }: { title: string; entries: RuleIndexEntry[] }) {
  return (
    <section className="panel compact-panel">
      <h3>{title}</h3>
      <div className="catalog-list">
        {entries.slice(0, 120).map((entry, index) => (
          <div key={`${entry.source}:${entry.buildName ?? "core"}:${entry.name}:${index}`} className="catalog-item">
            <strong>{entry.name || "(empty name)"}</strong>
            <span>{entry.source === "build" ? entry.buildName : "Core"}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function EditorPage(props: EditorPageProps) {
  const {
    config,
    setConfig,
    coreFile,
    buildFiles,
    setBuildFiles,
    configWarnings,
    validationIssues,
    ruleCatalog,
    exportedYaml,
    onLoadPreset,
    onImportConfig,
    onImportCore,
    onImportBuilds,
    onRunMerge,
    presets,
    currentPresetId,
    busy,
    loadError,
    setLoadError,
  } = props;

  const buildCatalog = ruleCatalog.filter((entry) => entry.source === "build");
  const coreCatalog = ruleCatalog.filter((entry) => entry.source === "core");

  function setOutputField(field: string, value: string | number) {
    setConfig((current) => ({
      ...current,
      output: {
        ...current.output,
        [field]: value,
      },
    }));
  }

  async function handleConfigUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await onImportConfig(file);
      event.target.value = "";
    }
  }

  async function handleCoreUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) {
      await onImportCore(file);
      event.target.value = "";
    }
  }

  async function handleBuildUpload(event: ChangeEvent<HTMLInputElement>) {
    await onImportBuilds(event.target.files);
    event.target.value = "";
  }

  return (
    <main className="page-grid">
      <section className="panel hero-panel">
        <div className="section-header">
          <div>
            <h2>Preset and file loading</h2>
            <p>Start from bundled demo assets or load your own XML and YAML locally.</p>
          </div>
          <button className="primary" onClick={onRunMerge}>Run Merge</button>
        </div>

        <div className="preset-grid">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={`preset-card ${currentPresetId === preset.id ? "selected" : ""}`}
              disabled={busy}
              onClick={() => void onLoadPreset(preset.id)}
            >
              <strong>{preset.label}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>

        <div className="upload-grid">
          <label className="upload-card">
            <span>Import config YAML</span>
            <input type="file" accept=".yaml,.yml" onChange={handleConfigUpload} />
          </label>
          <label className="upload-card">
            <span>Import core XML</span>
            <input type="file" accept=".xml" onChange={handleCoreUpload} />
          </label>
          <label className="upload-card">
            <span>Import build XML files</span>
            <input type="file" accept=".xml" multiple onChange={handleBuildUpload} />
          </label>
          <button className="ghost" onClick={() => triggerDownload("config.yaml", exportedYaml, "text/yaml")}>Export current YAML</button>
        </div>

        {loadError && (
          <div className="notice warn">
            <span>{loadError}</span>
            <button onClick={() => setLoadError(null)}>Dismiss</button>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Loaded assets</h2>
        <div className="asset-summary-grid">
          <div className="asset-summary">
            <h3>Core</h3>
            {coreFile ? (
              <>
                <strong>{coreFile.displayName}</strong>
                <span>{coreFile.filename}</span>
                <span>{coreFile.ruleCount} total rules</span>
              </>
            ) : (
              <span>No core loaded yet.</span>
            )}
          </div>
          <div className="asset-summary">
            <h3>Build filters</h3>
            <span>{buildFiles.length} loaded</span>
            <span>{buildFiles.filter((file) => file.included !== false).length} included in merge</span>
          </div>
        </div>
        <div className="build-list">
          {buildFiles.map((file, index) => (
            <label key={file.id} className="build-row">
              <input
                type="checkbox"
                checked={file.included !== false}
                onChange={(event) => {
                  setBuildFiles((current) =>
                    updateListItem(current, index, { ...current[index], included: event.target.checked }),
                  );
                }}
              />
              <div>
                <strong>{file.displayName}</strong>
                <span>{file.filename}</span>
              </div>
              <span>{file.ruleCount} rules</span>
              <button onClick={() => setBuildFiles((current) => removeListItem(current, index))}>Remove</button>
            </label>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Output config</h2>
        <div className="field-grid two-up">
          <label>
            <span>Name template</span>
            <input value={config.output?.name_template ?? ""} onChange={(event) => setOutputField("name_template", event.target.value)} />
          </label>
          <label>
            <span>Description</span>
            <input value={config.output?.description ?? ""} onChange={(event) => setOutputField("description", event.target.value)} />
          </label>
          <label>
            <span>Filter icon</span>
            <input type="number" value={config.output?.filter_icon ?? 0} onChange={(event) => setOutputField("filter_icon", Number(event.target.value))} />
          </label>
          <label>
            <span>Filter icon color</span>
            <input type="number" value={config.output?.filter_icon_color ?? 0} onChange={(event) => setOutputField("filter_icon_color", Number(event.target.value))} />
          </label>
          <label>
            <span>Unmatched build rules anchor</span>
            <input
              value={config.unmatched_build_rules?.after ?? ""}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  unmatched_build_rules: {
                    ...current.unmatched_build_rules,
                    after: event.target.value,
                  },
                }))
              }
            />
          </label>
          <label className="inline-check">
            <input
              type="checkbox"
              checked={config.unmatched_build_rules?.prefix_build_name ?? true}
              onChange={(event) =>
                setConfig((current) => ({
                  ...current,
                  unmatched_build_rules: {
                    ...current.unmatched_build_rules,
                    prefix_build_name: event.target.checked,
                  },
                }))
              }
            />
            <span>Prefix unmatched build names</span>
          </label>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Sections</h2>
            <p>Order here becomes in-game evaluation order.</p>
          </div>
          <button
            onClick={() =>
              setConfig((current) => ({
                ...current,
                sections: [
                  ...current.sections,
                  { name: "New section", source: "build", match: "", match_mode: "contains", prefix_build_name: true },
                ],
              }))
            }
          >
            Add section
          </button>
        </div>
        <div className="stack-list">
          {config.sections.map((section, index) => (
            <article key={`${section.name}-${index}`} className="list-card">
              <div className="field-grid four-up">
                <label>
                  <span>Name</span>
                  <input value={section.name} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, name: event.target.value }) }))} />
                </label>
                <label>
                  <span>Source</span>
                  <select value={section.source} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, source: event.target.value as "core" | "build" }) }))}>
                    <option value="core">core</option>
                    <option value="build">build</option>
                  </select>
                </label>
                <label>
                  <span>Match</span>
                  <input value={section.match} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, match: event.target.value }) }))} />
                </label>
                <label>
                  <span>Match mode</span>
                  <select value={section.match_mode ?? "contains"} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, match_mode: event.target.value as "exact" | "startswith" | "contains" }) }))}>
                    <option value="contains">contains</option>
                    <option value="exact">exact</option>
                    <option value="startswith">startswith</option>
                  </select>
                </label>
              </div>
              <div className="checkbox-row">
                <label className="inline-check"><input type="checkbox" checked={section.prefix_build_name ?? (section.source === "build")} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, prefix_build_name: event.target.checked }) }))} /><span>Prefix build name</span></label>
                <label className="inline-check"><input type="checkbox" checked={section.use_config_name ?? false} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, use_config_name: event.target.checked }) }))} /><span>Use config name</span></label>
                <label className="inline-check"><input type="checkbox" checked={section.merge ?? false} onChange={(event) => setConfig((current) => ({ ...current, sections: updateListItem(current.sections, index, { ...section, merge: event.target.checked }) }))} /><span>Merge build rules</span></label>
              </div>
              <div className="button-row">
                <button onClick={() => setConfig((current) => ({ ...current, sections: moveItem(current.sections, index, -1) }))}>Move up</button>
                <button onClick={() => setConfig((current) => ({ ...current, sections: moveItem(current.sections, index, 1) }))}>Move down</button>
                <button onClick={() => setConfig((current) => ({ ...current, sections: removeListItem(current.sections, index) }))}>Remove</button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split-panel">
        <div>
          <div className="section-header">
            <div>
              <h2>Ignore rules</h2>
              <p>Rules are removed during load before assignment.</p>
            </div>
            <button onClick={() => setConfig((current) => ({ ...current, ignore_rules: [...(current.ignore_rules ?? []), { match: "", match_mode: "exact", source: "build" }] }))}>Add ignore rule</button>
          </div>
          <div className="stack-list">
            {(config.ignore_rules ?? []).map((item, index) => (
              <article key={`ignore-${index}`} className="list-card compact-card">
                <div className="field-grid three-up">
                  <label><span>Match</span><input value={item.match} onChange={(event) => setConfig((current) => ({ ...current, ignore_rules: updateListItem(current.ignore_rules ?? [], index, { ...item, match: event.target.value }) }))} /></label>
                  <label><span>Mode</span><select value={item.match_mode ?? "contains"} onChange={(event) => setConfig((current) => ({ ...current, ignore_rules: updateListItem(current.ignore_rules ?? [], index, { ...item, match_mode: event.target.value as "exact" | "startswith" | "contains" }) }))}><option value="contains">contains</option><option value="exact">exact</option><option value="startswith">startswith</option></select></label>
                  <label><span>Source</span><select value={item.source ?? "build"} onChange={(event) => setConfig((current) => ({ ...current, ignore_rules: updateListItem(current.ignore_rules ?? [], index, { ...item, source: event.target.value as "core" | "build" | "any" }) }))}><option value="build">build</option><option value="core">core</option><option value="any">any</option></select></label>
                </div>
                <button onClick={() => setConfig((current) => ({ ...current, ignore_rules: removeListItem(current.ignore_rules ?? [], index) }))}>Remove</button>
              </article>
            ))}
          </div>
        </div>

        <div>
          <div className="section-header">
            <div>
              <h2>Overrides</h2>
              <p>Safe post-placement tweaks for common fields.</p>
            </div>
            <button onClick={() => setConfig((current) => ({ ...current, overrides: [...(current.overrides ?? []), { match: "", match_mode: "contains", source: "any", set: { isEnabled: "false" } }] }))}>Add override</button>
          </div>
          <div className="stack-list">
            {(config.overrides ?? []).map((item, index) => (
              <article key={`override-${index}`} className="list-card compact-card">
                <div className="field-grid three-up">
                  <label><span>Match</span><input value={item.match} onChange={(event) => setConfig((current) => ({ ...current, overrides: updateListItem(current.overrides ?? [], index, { ...item, match: event.target.value }) }))} /></label>
                  <label><span>Mode</span><select value={item.match_mode ?? "contains"} onChange={(event) => setConfig((current) => ({ ...current, overrides: updateListItem(current.overrides ?? [], index, { ...item, match_mode: event.target.value as "exact" | "startswith" | "contains" }) }))}><option value="contains">contains</option><option value="exact">exact</option><option value="startswith">startswith</option></select></label>
                  <label><span>Source</span><select value={item.source ?? "any"} onChange={(event) => setConfig((current) => ({ ...current, overrides: updateListItem(current.overrides ?? [], index, { ...item, source: event.target.value as "core" | "build" | "any" }) }))}><option value="any">any</option><option value="build">build</option><option value="core">core</option></select></label>
                </div>
                <div className="field-grid four-up">
                  <label><span>Set field</span><input value={Object.keys(item.set)[0] ?? ""} onChange={(event) => { const nextValue = Object.values(item.set)[0] ?? ""; setConfig((current) => ({ ...current, overrides: updateListItem(current.overrides ?? [], index, { ...item, set: { [event.target.value]: nextValue } }) })); }} /></label>
                  <label><span>Set value</span><input value={String(Object.values(item.set)[0] ?? "")} onChange={(event) => { const nextKey = Object.keys(item.set)[0] ?? "isEnabled"; setConfig((current) => ({ ...current, overrides: updateListItem(current.overrides ?? [], index, { ...item, set: { [nextKey]: event.target.value } }) })); }} /></label>
                </div>
                <button onClick={() => setConfig((current) => ({ ...current, overrides: removeListItem(current.overrides ?? [], index) }))}>Remove</button>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="section-header">
          <div>
            <h2>Transforms</h2>
            <p>Advanced area for mutate and derive rules before section assignment.</p>
          </div>
          <button onClick={() => setConfig((current) => ({ ...current, transforms: [...(current.transforms ?? []), { match: "", match_mode: "contains", operation: "mutate", set: {} }] }))}>Add transform</button>
        </div>
        <div className="stack-list">
          {(config.transforms ?? []).map((transform, index) => (
            <article key={`transform-${index}`} className="list-card">
              <div className="field-grid four-up">
                <label><span>Match</span><input value={transform.match} onChange={(event) => setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, match: event.target.value }) }))} /></label>
                <label><span>Match mode</span><select value={transform.match_mode ?? "contains"} onChange={(event) => setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, match_mode: event.target.value as "exact" | "startswith" | "contains" }) }))}><option value="contains">contains</option><option value="exact">exact</option><option value="startswith">startswith</option></select></label>
                <label><span>Operation</span><select value={transform.operation} onChange={(event) => setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, operation: event.target.value as "mutate" | "derive" }) }))}><option value="mutate">mutate</option><option value="derive">derive</option></select></label>
                <label><span>Name replace</span><input value={transform.name_replace ?? ""} onChange={(event) => setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, name_replace: event.target.value }) }))} /></label>
                <label><span>Name with</span><input value={transform.name_with ?? ""} onChange={(event) => setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, name_with: event.target.value }) }))} /></label>
                <label><span>Top-level set field</span><input value={Object.keys(transform.set ?? {})[0] ?? ""} onChange={(event) => { const currentValue = Object.values(transform.set ?? {})[0] ?? ""; setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, set: { [event.target.value]: currentValue } }) })); }} /></label>
                <label><span>Top-level set value</span><input value={String(Object.values(transform.set ?? {})[0] ?? "")} onChange={(event) => { const currentKey = Object.keys(transform.set ?? {})[0] ?? "isEnabled"; setConfig((current) => ({ ...current, transforms: updateListItem(current.transforms ?? [], index, { ...transform, set: { [currentKey]: event.target.value } }) })); }} /></label>
              </div>
              <label>
                <span>Advanced condition patches YAML/JSON not surfaced yet</span>
                <textarea value={(transform.condition_patches ?? []).map((patch) => `${patch.type}#${patch.index ?? 0}`).join("\n")} readOnly rows={3} />
              </label>
              <button onClick={() => setConfig((current) => ({ ...current, transforms: removeListItem(current.transforms ?? [], index) }))}>Remove</button>
            </article>
          ))}
        </div>
      </section>

      <section className="panel split-panel">
        <div>
          <h2>Validation</h2>
          {[...configWarnings.map((message) => ({ level: "warn", message })), ...validationIssues].map((issue, index) => (
            <div key={`${issue.message}-${index}`} className={`notice ${issue.level}`}>
              <span>{issue.message}</span>
            </div>
          ))}
          {!configWarnings.length && !validationIssues.length && <div className="notice info"><span>No config warnings with the current loaded assets.</span></div>}
        </div>
        <div>
          <h2>Advanced YAML</h2>
          <textarea className="yaml-view" value={exportedYaml} readOnly rows={18} />
        </div>
      </section>

      <section className="catalog-grid">
        <CatalogList title="Known core rule names" entries={coreCatalog} />
        <CatalogList title="Known build rule names" entries={buildCatalog} />
      </section>
    </main>
  );
}
