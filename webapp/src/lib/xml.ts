import type { LoadedFilterFile, ParsedFilter } from "./types";

function stemFromFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "");
}

function normalizeDisplayName(preferredName: string | null | undefined, filename: string) {
  const stem = stemFromFilename(filename);
  const value = preferredName?.trim() ?? "";
  if (!value) {
    return stem;
  }
  if (/ #\d+$/.test(value) && stem.replace(/ #\d+$/, "") === value.replace(/ #\d+$/, "")) {
    return stem;
  }
  return value;
}

export function parseFilterXml(text: string, filename: string): ParsedFilter {
  const parser = new DOMParser();
  const document = parser.parseFromString(text, "application/xml");
  const parserError = document.querySelector("parsererror");
  if (parserError) {
    throw new Error(`Invalid XML in ${filename}`);
  }

  const root = document.documentElement;
  const displayName = normalizeDisplayName(
    root.querySelector(":scope > name")?.textContent || root.querySelector(":scope > n")?.textContent,
    filename,
  );

  const rules = Array.from(document.getElementsByTagName("Rule"));
  return { displayName, rules, document };
}

export function summarizeFilterFile(file: Pick<LoadedFilterFile, "text" | "filename">) {
  const parsed = parseFilterXml(file.text, file.filename);
  return {
    displayName: parsed.displayName,
    ruleCount: parsed.rules.length,
  };
}

export function triggerDownload(filename: string, text: string, mimeType: string) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
