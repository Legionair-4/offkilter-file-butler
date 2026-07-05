import fs from "node:fs/promises";
import type { Dirent } from "node:fs";
import path from "node:path";
import type { FileButlerConfig, FolderRule, ScanOptions, ScanResult, SourceFile, ValidationError } from "./types.js";
import { validateConfig } from "./validation.js";

export async function scanConfiguredFolders(config: FileButlerConfig, options: ScanOptions = {}): Promise<ScanResult> {
  const errors = validateConfig(config);

  if (errors.length > 0) {
    return { filesByRuleId: new Map(), errors };
  }

  const filesByRuleId = new Map<string, SourceFile[]>();
  const scanErrors: ValidationError[] = [];
  const allowedExtensions = normaliseExtensions(options.includeExtensions);

  for (const rule of config.folders) {
    if (!rule.enabled) {
      continue;
    }

    const result = await scanFolder(rule, allowedExtensions);
    filesByRuleId.set(rule.id, result.files);
    scanErrors.push(...result.errors);
  }

  return { filesByRuleId, errors: scanErrors };
}

async function scanFolder(rule: FolderRule, allowedExtensions: ReadonlySet<string> | null): Promise<{ files: SourceFile[]; errors: ValidationError[] }> {
  const files: SourceFile[] = [];
  const errors: ValidationError[] = [];
  let entries: Dirent[];

  try {
    entries = await fs.readdir(rule.sourceFolder, { withFileTypes: true });
  } catch (error) {
    return {
      files,
      errors: [
        {
          path: `folders.${rule.id}.sourceFolder`,
          message: error instanceof Error ? error.message : "Could not read source folder.",
        },
      ],
    };
  }

  for (const entry of entries) {
    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = path.join(rule.sourceFolder, entry.name);
    const extension = path.extname(entry.name).replace(/^\./, "").toLowerCase();

    if (allowedExtensions && !allowedExtensions.has(extension)) {
      continue;
    }

    try {
      const stat = await fs.stat(absolutePath);
      files.push({
        absolutePath,
        fileName: entry.name,
        modifiedAt: stat.mtime,
      });
    } catch (error) {
      errors.push({
        path: absolutePath,
        message: error instanceof Error ? error.message : "Could not inspect file.",
      });
    }
  }

  files.sort((left, right) => left.fileName.localeCompare(right.fileName));

  return { files, errors };
}

function normaliseExtensions(extensions: readonly string[] | undefined): ReadonlySet<string> | null {
  if (!extensions || extensions.length === 0) {
    return null;
  }

  return new Set(extensions.map((extension) => extension.replace(/^\./, "").toLowerCase()).filter(Boolean));
}
