import fs from "node:fs/promises";
import path from "node:path";
import type { ApplyRun } from "./types.js";

export async function writeApplyRun(logDirectory: string, run: ApplyRun): Promise<string> {
  await fs.mkdir(logDirectory, { recursive: true });
  const logPath = getApplyRunPath(logDirectory, run.runId);
  await fs.writeFile(logPath, `${JSON.stringify(run, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  return logPath;
}

export async function readApplyRun(logDirectory: string, runId: string): Promise<ApplyRun> {
  const logPath = getApplyRunPath(logDirectory, runId);
  const raw = await fs.readFile(logPath, "utf8");
  return JSON.parse(raw) as ApplyRun;
}

function getApplyRunPath(logDirectory: string, runId: string): string {
  return path.join(logDirectory, `${sanitiseRunId(runId)}.json`);
}

function sanitiseRunId(runId: string): string {
  const safeRunId = runId.replace(/[^a-zA-Z0-9_-]/g, "");

  if (!safeRunId) {
    throw new Error("Run id must contain at least one safe character.");
  }

  return safeRunId;
}
