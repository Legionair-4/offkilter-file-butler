import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { applyPlannedActions, undoApplyRun, type PlannedFileAction } from "../src/index.js";

test("applyPlannedActions renames ready actions and writes a run log", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-apply-"));
  const sourcePath = path.join(workspace, "incoming", "scan.pdf");
  const targetPath = path.join(workspace, "organised", "2026-07-05 - scan.pdf");
  const logDirectory = path.join(workspace, "logs");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "test", "utf8");

  const planned: PlannedFileAction[] = [
    {
      ruleId: "invoices",
      sourcePath,
      targetPath,
      status: "ready",
    },
  ];

  const run = await applyPlannedActions(planned, {
    logDirectory,
    runId: "test-run",
    now: new Date("2026-07-05T06:00:00.000Z"),
  });

  assert.equal(run.actions[0]?.status, "applied");
  assert.equal(await readText(targetPath), "test");
  await assert.rejects(fs.access(sourcePath));
  assert.match(await readText(path.join(logDirectory, "test-run.json")), /"status": "applied"/);
});

test("applyPlannedActions refuses to overwrite targets", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-conflict-"));
  const sourcePath = path.join(workspace, "incoming", "scan.pdf");
  const targetPath = path.join(workspace, "incoming", "renamed.pdf");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "source", "utf8");
  await fs.writeFile(targetPath, "target", "utf8");

  const run = await applyPlannedActions(
    [
      {
        ruleId: "invoices",
        sourcePath,
        targetPath,
        status: "ready",
      },
    ],
    {
      logDirectory: path.join(workspace, "logs"),
      runId: "conflict-run",
    },
  );

  assert.equal(run.actions[0]?.status, "failed");
  assert.equal(run.actions[0]?.reason, "Target file already exists.");
  assert.equal(await readText(sourcePath), "source");
  assert.equal(await readText(targetPath), "target");
});

test("undoApplyRun reverses applied actions without overwriting originals", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-undo-"));
  const sourcePath = path.join(workspace, "incoming", "scan.pdf");
  const targetPath = path.join(workspace, "organised", "scan.pdf");
  const logDirectory = path.join(workspace, "logs");
  await fs.mkdir(path.dirname(sourcePath), { recursive: true });
  await fs.writeFile(sourcePath, "test", "utf8");

  await applyPlannedActions(
    [
      {
        ruleId: "invoices",
        sourcePath,
        targetPath,
        status: "ready",
      },
    ],
    {
      logDirectory,
      runId: "undo-run",
    },
  );

  const undoRun = await undoApplyRun({ logDirectory, runId: "undo-run" });

  assert.equal(undoRun.actions[0]?.status, "undone");
  assert.equal(await readText(sourcePath), "test");
  await assert.rejects(fs.access(targetPath));
});

async function readText(filePath: string): Promise<string> {
  return fs.readFile(filePath, "utf8");
}
