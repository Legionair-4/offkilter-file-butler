import { planRenameActions } from "./planner.js";
import { scanConfiguredFolders } from "./scanner.js";
import type { FileButlerConfig, PreviewOptions, PreviewResult } from "./types.js";

export async function previewFileButlerRun(config: FileButlerConfig, options: PreviewOptions = {}): Promise<PreviewResult> {
  const scanResult = await scanConfiguredFolders(config, options);

  if (scanResult.errors.length > 0) {
    return {
      dryRun: true,
      actions: [],
      errors: scanResult.errors,
      scannedFileCount: countScannedFiles(scanResult.filesByRuleId),
    };
  }

  const planResult = planRenameActions(config, scanResult.filesByRuleId, options);

  return {
    ...planResult,
    scannedFileCount: countScannedFiles(scanResult.filesByRuleId),
  };
}

function countScannedFiles(filesByRuleId: ReadonlyMap<string, readonly unknown[]>): number {
  let count = 0;

  for (const files of filesByRuleId.values()) {
    count += files.length;
  }

  return count;
}
