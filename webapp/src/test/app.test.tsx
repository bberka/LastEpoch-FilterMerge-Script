import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { App } from "../App";

const CORE_XML = `<?xml version="1.0" encoding="utf-8"?><ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><name>Core Demo</name><rules><Rule><nameOverride>All Items</nameOverride><Order>0</Order><recolor>false</recolor><color>0</color><BeamOverride>false</BeamOverride><BeamSizeOverride>NONE</BeamSizeOverride><BeamColorOverride>0</BeamColorOverride></Rule></rules></ItemFilter>`;
const BUILD_XML = `<?xml version="1.0" encoding="utf-8"?><ItemFilter xmlns:i="http://www.w3.org/2001/XMLSchema-instance"><name>Build Demo</name><rules><Rule><nameOverride>Wanted Tier 7</nameOverride><Order>0</Order><recolor>false</recolor><color>0</color><BeamOverride>false</BeamOverride><BeamSizeOverride>NONE</BeamSizeOverride><BeamColorOverride>0</BeamColorOverride></Rule></rules></ItemFilter>`;
const CONFIG_YAML = `output:\n  name_template: Demo Merge\n  description: Demo description\nsections:\n  - name: Missing Exact\n    source: build\n    match: Definitely Missing\n    match_mode: exact\nunmatched_build_rules:\n  placement: after\n  after: Missing Exact\n  prefix_build_name: true\nignore_rules: []\noverrides: []\ntransforms: []\n`;

describe("App", () => {
  it("supports local file import, validation, and merge", async () => {
    window.history.replaceState({}, "", "/editor");
    const user = userEvent.setup();
    render(<App />);

    const inputs = screen.getAllByLabelText(/Import/i);
    await user.upload(inputs[0], new File([CONFIG_YAML], "config.yaml", { type: "text/yaml" }));
    await user.upload(inputs[1], new File([CORE_XML], "Core.xml", { type: "application/xml" }));
    await user.upload(inputs[2], new File([BUILD_XML], "Build.xml", { type: "application/xml" }));

    expect(await screen.findByText("Core Demo")).toBeInTheDocument();
    expect(screen.getByText(/exact match currently hits no loaded build rule/i)).toBeInTheDocument();

    await user.click(screen.getAllByText("Run Merge")[0]);

    await waitFor(() => expect(screen.getByText("Merge summary")).toBeInTheDocument());
    expect(screen.getAllByText("Build Demo - Wanted Tier 7").length).toBeGreaterThan(0);
  });

  it("loads preset data through fetch", async () => {
    window.history.replaceState({}, "", "/editor");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => CORE_XML,
    } as Response);

    render(<App />);
    fireEvent.click(screen.getByText("Uber Demo Preset"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    fetchMock.mockRestore();
  });
});

