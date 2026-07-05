import path from "node:path";
import type { SourceFile } from "./types.js";

export interface RenderPatternInput {
  file: SourceFile;
  pattern: string;
  now: Date;
}

export function renderRenamePattern(input: RenderPatternInput): string {
  const parsed = path.parse(input.file.fileName);
  const date = formatDate(input.file.modifiedAt ?? input.now);
  const replacements: Record<string, string> = {
    "{originalName}": parsed.name + parsed.ext,
    "{originalBase}": parsed.name,
    "{ext}": parsed.ext.replace(/^\./, ""),
    "{date}": date,
  };

  const rendered = Object.entries(replacements).reduce(
    (value, [token, replacement]) => value.split(token).join(replacement),
    input.pattern,
  );

  return sanitiseFileName(rendered);
}

function formatDate(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function sanitiseFileName(fileName: string): string {
  return fileName
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}
