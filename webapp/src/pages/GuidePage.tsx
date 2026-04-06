export function GuidePage() {
  return (
    <main className="page-grid">
      <section className="panel hero-panel">
        <h2>How to use this tool</h2>
        <p>This tool is for players who want one merged Last Epoch loot filter built from a shared core filter plus one or more build filters.</p>
      </section>

      <section className="panel split-panel">
        <div>
          <h3>What it does</h3>
          <p>It edits and validates the merge config, then generates a merged XML locally in your browser. It is not a full visual loot-rule editor.</p>
          <h3>Core vs build filters</h3>
          <p>The core filter contains global rules you want for every character. Build filters contain rules that are specific to individual builds, item targets, idols, or planner uniques.</p>
        </div>
        <div>
          <h3>Quick start</h3>
          <ol className="plain-list numbered">
            <li>Open the Editor page.</li>
            <li>Load an Uber or Giga demo preset, or import your own config and XML files.</li>
            <li>Check which build filters are enabled for the merge.</li>
            <li>Tweak sections, ignore rules, overrides, or output settings.</li>
            <li>Run Merge and download the final XML.</li>
          </ol>
        </div>
      </section>

      <section className="panel split-panel">
        <div>
          <h3>Common safe edits</h3>
          <ul className="plain-list">
            <li>Reorder sections to change priority.</li>
            <li>Add ignore rules to suppress noisy rules.</li>
            <li>Add overrides to disable or recolor matched rules.</li>
            <li>Change the output name template and description.</li>
            <li>Choose which build XML files are included in the merge.</li>
          </ul>
        </div>
        <div>
          <h3>Common mistakes</h3>
          <ul className="plain-list">
            <li>Importing the wrong XML type or mixing strictness variants.</li>
            <li>Using exact rule names that do not exist in the loaded files.</li>
            <li>Ending up above the 200-rule in-game limit.</li>
            <li>Referencing an unmatched-build anchor section name that no longer exists.</li>
          </ul>
        </div>
      </section>

      <section className="panel">
        <h3>What happens under the hood</h3>
        <ol className="plain-list numbered">
          <li>The tool loads your core XML and indexes its rule names.</li>
          <li>It loads each build XML, strips duplicate core rules, and applies ignore rules.</li>
          <li>It applies transforms that mutate or derive build rules before assignment.</li>
          <li>It places rules into config-defined sections in top-to-bottom order.</li>
          <li>Any build rule not claimed by a section is inserted into the unmatched slot.</li>
          <li>Overrides are applied to the finished ordered rule list.</li>
          <li>The merged XML is written with fresh in-game Order values and downloaded locally.</li>
        </ol>
      </section>

      <section className="panel">
        <h3>Where to put the final file</h3>
        <p>Copy the downloaded XML into <code>%appdata%\..\LocalLow\Eleventh Hour Games\Last Epoch\Filters</code>, then select it in Last Epoch under Settings and Loot Filter.</p>
      </section>
    </main>
  );
}
