import path from "node:path";
import { renderRenamePattern } from "./pattern.js";
import { validateConfig } from "./validation.js";
import type { FileButlerConfig, FolderRule, PlanOptions, PlanResult, PlannedFileAction, SourceFile } from "./types.js";

export function planRenameActions(config: FileButlerConfig, filesByRuleId: ReadonlyMap<string, SourceFile[]>, options: PlanOptions = {}): PlanResult {
  const errors = validateConfig(config);

  if (errors.length > 0) {
    return { dryRun: true, actions: [], errors };
  }

  const now = options.now ?? new Date();
  const occupiedPaths = new Set(options.existingTargetPaths ?? []);
  const actions: PlannedFileAction[] = [];

  for (const rule of config.folders) {
    if (!rule.enabled) {
      continue;
    }

    const files = filesByRuleId.get(rule.id) ?? [];

    for (const file of files) {
      const action = planFile(rule, file, now, occupiedPaths);
      actions.push(action);

      if (action.status === "ready") {
        occupiedPaths.add(action.targetPath);
      }
    }
  }

  return { dryRun: true, actions, errors: [] };
}

function planFile(rule: FolderRule, file: SourceFile, now: Date, occupiedPaths: Set<string>): PlannedFileAction {
  const destinationFolder = rule.destinationFolder?.trim() || rule.sourceFolder;
  const renderedName = renderRenamePattern({
    file,
    pattern: rule.action.pattern,
    now,
  });
  const initialTargetPath = path.resolve(destinationFolder, renderedName);

  if (path.resolve(file.absolutePath) === initialTargetPath) {
    return {
      ruleId: rule.id,
      sourcePath: file.absolutePath,
      targetPath: initialTargetPath,
      status: "skipped",
      reason: "Source file already matches the target path.",
    };
  }

  if (!occupiedPaths.has(initialTargetPath)) {
    return {
      ruleId: rule.id,
      sourcePath: file.absolutePath,
      targetPath: initialTargetPath,
      status: "ready",
    };
  }

  if (rule.conflictStrategy === "skip") {
    return {
      ruleId: rule.id,
      sourcePath: file.absolutePath,
      targetPath: initialTargetPath,
      status: "conflict",
      reason: "Target path already exists.",
    };
  }

  if (rule.conflictStrategy === "needs-review") {
    return {
      ruleId: rule.id,
      sourcePath: file.absolutePath,
      targetPath: initialTargetPath,
      status: "needs-review",
      reason: "Target path already exists and needs review.",
    };
  }

  return {
    ruleId: rule.id,
    sourcePath: file.absolutePath,
    targetPath: appendCounter(initialTargetPath, occupiedPaths),
    status: "ready",
    reason: "Target path already existed; appended a counter.",
  };
}

function appendCounter(targetPath: string, occupiedPaths: Set<string>): string {
  const parsed = path.parse(targetPath);

  for (let counter = 2; counter < 10_000; counter += 1) {
    const candidate = path.join(parsed.dir, `${parsed.name} (${counter})${parsed.ext}`);

    if (!occupiedPaths.has(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Could not find an available conflict-safe path for ${targetPath}.`);
}
