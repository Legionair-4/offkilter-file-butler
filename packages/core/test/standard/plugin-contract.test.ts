import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  applyPlannedActions,
  planRenameActions,
  previewFileButlerRun,
  validateConfig,
  type FileButlerConfig,
  type PlannedFileAction,
  type SourceFile,
} from "../../src/index.js";

test("standard contract: plugin config validation rejects unsupported versions and duplicate rule ids", () => {
  const config = {
    version: 2,
    folders: [
      createFolderRule("folder-1", "/incoming"),
      createFolderRule("folder-1", "/incoming-two"),
    ],
  } as unknown as FileButlerConfig;

  const errors = validateConfig(config);

  assert.equal(errors.some((error) => error.path === "version"), true);
  assert.equal(errors.some((error) => error.path === "folders[1].id"), true);
});

test("standard contract: preview is a dry run and does not mutate source files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-contract-preview-"));
  const sourceFolder = path.join(workspace, "incoming");
  const sourcePath = path.join(sourceFolder, "scan.pdf");
  await fs.mkdir(sourceFolder, { recursive: true });
  await fs.writeFile(sourcePath, "source", "utf8");

  const result = await previewFileButlerRun(
    {
      version: 1,
      folders: [createFolderRule("folder-1", sourceFolder, path.join(workspace, "organised"))],
    },
    {
      now: new Date("2026-07-05T06:00:00.000Z"),
      includeExtensions: ["pdf"],
    },
  );

  assert.equal(result.dryRun, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.actions[0]?.status, "ready");
  assert.equal(await fs.readFile(sourcePath, "utf8"), "source");
});

test("standard contract: planning reports conflicts instead of silently overwriting", () => {
  const sourceFolder = "/incoming";
  const targetPath = path.join(sourceFolder, "2026-07-05 - scan.pdf");
  const files = new Map<string, SourceFile[]>([
    [
      "folder-1",
      [
        {
          absolutePath: path.join(sourceFolder, "scan.pdf"),
          fileName: "scan.pdf",
          modifiedAt: new Date("2026-07-05T06:00:00.000Z"),
        },
      ],
    ],
  ]);

  const result = planRenameActions(
    {
      version: 1,
      folders: [
        {
          ...createFolderRule("folder-1", sourceFolder),
          conflictStrategy: "skip",
        },
      ],
    },
    files,
    {
      now: new Date("2026-07-05T06:00:00.000Z"),
      existingTargetPaths: new Set([targetPath]),
    },
  );

  assert.equal(result.actions[0]?.status, "conflict");
  assert.equal(result.actions[0]?.targetPath, targetPath);
});

test("standard contract: apply skips non-ready actions and records the run", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-contract-apply-"));
  const logDirectory = path.join(workspace, "logs");
  const planned: PlannedFileAction[] = [
    {
      ruleId: "folder-1",
      sourcePath: path.join(workspace, "source.pdf"),
      targetPath: path.join(workspace, "target.pdf"),
      status: "needs-review",
      reason: "Target path already exists and needs review.",
    },
  ];

  const run = await applyPlannedActions(planned, {
    logDirectory,
    runId: "standard-contract-run",
    now: new Date("2026-07-05T06:00:00.000Z"),
  });

  assert.equal(run.actions[0]?.status, "skipped");
  assert.match(await fs.readFile(path.join(logDirectory, "standard-contract-run.json"), "utf8"), /"status": "skipped"/);
});

function createFolderRule(id: string, sourceFolder: string, destinationFolder?: string): FileButlerConfig["folders"][number] {
  return {
    id,
    name: id,
    enabled: true,
    sourceFolder,
    ...(destinationFolder ? { destinationFolder } : {}),
    action: { type: "rename", pattern: "{date} - {originalName}" },
    conflictStrategy: "append-counter",
  };
}
