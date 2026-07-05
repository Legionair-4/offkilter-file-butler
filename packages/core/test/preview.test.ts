import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { previewFileButlerRun, scanConfiguredFolders, type FileButlerConfig } from "../src/index.js";

test("scanConfiguredFolders reads enabled folder files and ignores subfolders", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-scan-"));
  const sourceFolder = path.join(workspace, "incoming");
  await fs.mkdir(path.join(sourceFolder, "nested"), { recursive: true });
  await fs.writeFile(path.join(sourceFolder, "receipt.pdf"), "receipt", "utf8");
  await fs.writeFile(path.join(sourceFolder, "notes.txt"), "notes", "utf8");
  await fs.writeFile(path.join(sourceFolder, "nested", "ignored.pdf"), "ignored", "utf8");

  const result = await scanConfiguredFolders(createConfig(sourceFolder), {
    includeExtensions: ["pdf"],
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.filesByRuleId.get("folder-1")?.length, 1);
  assert.equal(result.filesByRuleId.get("folder-1")?.[0]?.fileName, "receipt.pdf");
});

test("previewFileButlerRun scans and plans UI-ready dry-run actions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-preview-"));
  const sourceFolder = path.join(workspace, "incoming");
  const destinationFolder = path.join(workspace, "organised");
  await fs.mkdir(sourceFolder, { recursive: true });
  await fs.writeFile(path.join(sourceFolder, "receipt.pdf"), "receipt", "utf8");

  const result = await previewFileButlerRun(
    createConfig(sourceFolder, destinationFolder),
    {
      now: new Date("2026-07-05T06:00:00.000Z"),
      includeExtensions: ["pdf"],
    },
  );

  assert.deepEqual(result.errors, []);
  assert.equal(result.scannedFileCount, 1);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0]?.status, "ready");
  assert.equal(result.actions[0]?.targetPath, path.join(destinationFolder, "2026-07-05 - receipt.pdf"));
});

test("previewFileButlerRun returns folder read errors without planning actions", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-preview-error-"));
  const missingFolder = path.join(workspace, "missing");

  const result = await previewFileButlerRun(createConfig(missingFolder));

  assert.equal(result.actions.length, 0);
  assert.equal(result.scannedFileCount, 0);
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0]?.message ?? "", /ENOENT/);
});

function createConfig(sourceFolder: string, destinationFolder?: string): FileButlerConfig {
  const folder = {
    id: "folder-1",
    name: "Folder 1",
    enabled: true,
    sourceFolder,
    action: { type: "rename" as const, pattern: "{date} - {originalName}" },
    conflictStrategy: "append-counter" as const,
  };

  return {
    version: 1,
    folders: [
      destinationFolder ? { ...folder, destinationFolder } : folder,
    ],
  };
}
