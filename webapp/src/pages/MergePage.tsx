import type { MergeRunResult } from "../lib/types";

interface MergePageProps {
  mergeResult: MergeRunResult | null;
  loadError: string | null;
  onRunMerge: () => void;
  onDownloadXml: () => void;
  onDownloadYaml: () => void;
}

export function MergePage({ mergeResult, loadError, onRunMerge, onDownloadXml, onDownloadYaml }: MergePageProps) {
  return (
    <main className="page-grid">
      <section className="panel hero-panel">
        <div className="section-header">
          <div>
            <h2>Run merge</h2>
            <p>Generate the final XML entirely in the browser, then download it straight to your Last Epoch filters folder.</p>
          </div>
          <div className="button-row">
            <button className="primary" onClick={onRunMerge}>Run Merge</button>
            <button onClick={onDownloadYaml}>Download YAML</button>
            <button onClick={onDownloadXml} disabled={!mergeResult}>Download merged XML</button>
          </div>
        </div>
        {loadError && <div className="notice warn"><span>{loadError}</span></div>}
      </section>

      {mergeResult ? (
        <>
          <section className="panel split-panel">
            <div>
              <h2>Merge summary</h2>
              <div className="stats-grid">
                <div><strong>{mergeResult.stats.coreRuleCount}</strong><span>core rules after ignores</span></div>
                <div><strong>{mergeResult.stats.buildFileCount}</strong><span>build files included</span></div>
                <div><strong>{mergeResult.stats.buildRuleCount}</strong><span>build rules after stripping</span></div>
                <div><strong>{mergeResult.stats.totalRules}</strong><span>final merged rules</span></div>
              </div>
              <p className="inline-note">Output name: <strong>{mergeResult.outputName}</strong></p>
            </div>
            <div>
              <h2>Unmatched build rules</h2>
              {mergeResult.unmatchedBuildRules.length ? (
                <ul className="plain-list">
                  {mergeResult.unmatchedBuildRules.map((name) => <li key={name}>{name}</li>)}
                </ul>
              ) : (
                <p>No unmatched build rules in this run.</p>
              )}
            </div>
          </section>

          <section className="panel split-panel">
            <div>
              <h2>Run log</h2>
              <div className="log-list">
                {mergeResult.logs.map((entry, index) => (
                  <div key={`${entry.message}-${index}`} className={`notice ${entry.level}`}>
                    <span>{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <h2>Final rule order</h2>
              <div className="rule-order-list">
                {mergeResult.orderedRuleNames.map((name, index) => (
                  <div key={`${name}-${index}`} className="rule-order-row">
                    <span>{mergeResult.orderedRuleNames.length - 1 - index}</span>
                    <strong>{name}</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="panel">
            <h2>Merged XML preview</h2>
            <textarea className="yaml-view" value={mergeResult.xml} readOnly rows={20} />
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>No merge has run yet</h2>
          <p>Use the Editor page to load a preset or your own files, then come back here to generate and download the merged filter.</p>
        </section>
      )}
    </main>
  );
}
