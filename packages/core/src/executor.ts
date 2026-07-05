import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { readApplyRun, writeApplyRun } from "./action-log.js";
import type {
  AppliedFileAction,
  ApplyOptions,
  ApplyRun,
  PlannedFileAction,
  UndoFileAction,
  UndoOptions,
  UndoRun,
} from "./types.js";

export async function applyPlannedActions(plannedActions: readonly PlannedFileAction[], options: ApplyOptions): Promise<ApplyRun> {
  const run: ApplyRun = {
    runId: options.runId ?? crypto.randomUUID(),
    createdAt: (options.now ?? new Date()).toISOString(),
    actions: [],
  };

  for (const action of plannedActions) {
    run.actions.push(await applySingleAction(action));
  }

  await writeApplyRun(options.logDirectory, run);
  return run;
}

export async function undoApplyRun(options: UndoOptions): Promise<UndoRun> {
  const appliedRun = await readApplyRun(options.logDirectory, options.runId);
  const undoRun: UndoRun = {
    runId: appliedRun.runId,
    undoneAt: (options.now ?? new Date()).toISOString(),
    actions: [],
  };

  for (const action of [...appliedRun.actions].reverse()) {
    undoRun.actions.push(await undoSingleAction(action));
  }

  return undoRun;
}

async function applySingleAction(action: PlannedFileAction): Promise<AppliedFileAction> {
  if (action.status !== "ready") {
    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "skipped",
      reason: action.reason ?? `Planned action status is ${action.status}.`,
    };
  }

  try {
    if (!(await pathExists(action.sourcePath))) {
      return {
        ruleId: action.ruleId,
        sourcePath: action.sourcePath,
        targetPath: action.targetPath,
        status: "failed",
        reason: "Source file no longer exists.",
      };
    }

    if (await pathExists(action.targetPath)) {
      return {
        ruleId: action.ruleId,
        sourcePath: action.sourcePath,
        targetPath: action.targetPath,
        status: "failed",
        reason: "Target file already exists.",
      };
    }

    await fs.mkdir(path.dirname(action.targetPath), { recursive: true });
    await fs.rename(action.sourcePath, action.targetPath);

    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "applied",
    };
  } catch (error) {
    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown filesystem error.",
    };
  }
}

async function undoSingleAction(action: AppliedFileAction): Promise<UndoFileAction> {
  if (action.status !== "applied") {
    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "skipped",
      reason: action.reason ?? `Applied action status is ${action.status}.`,
    };
  }

  try {
    if (!(await pathExists(action.targetPath))) {
      return {
        ruleId: action.ruleId,
        sourcePath: action.sourcePath,
        targetPath: action.targetPath,
        status: "failed",
        reason: "Target file no longer exists.",
      };
    }

    if (await pathExists(action.sourcePath)) {
      return {
        ruleId: action.ruleId,
        sourcePath: action.sourcePath,
        targetPath: action.targetPath,
        status: "failed",
        reason: "Original source path already exists; refusing to overwrite.",
      };
    }

    await fs.mkdir(path.dirname(action.sourcePath), { recursive: true });
    await fs.rename(action.targetPath, action.sourcePath);

    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "undone",
    };
  } catch (error) {
    return {
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "failed",
      reason: error instanceof Error ? error.message : "Unknown filesystem error.",
    };
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
