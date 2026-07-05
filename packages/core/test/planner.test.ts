import assert from "node:assert/strict";
import test from "node:test";
import { planRenameActions, validateConfig, type FileButlerConfig, type SourceFile } from "../src/index.js";

test("validateConfig rejects more than three watched folders", () => {
  const config: FileButlerConfig = {
    version: 1,
    folders: [0, 1, 2, 3].map((index) => ({
      id: `folder-${index}`,
      name: `Folder ${index}`,
      enabled: true,
      sourceFolder: `/source/${index}`,
      action: { type: "rename", pattern: "{date} - {originalName}" },
      conflictStrategy: "append-counter",
    })),
  };

  assert.equal(validateConfig(config).some((error) => error.path === "folders"), true);
});

test("planRenameActions plans safe dry-run rename actions", () => {
  const config: FileButlerConfig = {
    version: 1,
    folders: [
      {
        id: "invoices",
        name: "Invoices",
        enabled: true,
        sourceFolder: "/incoming",
        destinationFolder: "/organised/invoices",
        action: { type: "rename", pattern: "{date} - {originalBase}.{ext}" },
        conflictStrategy: "append-counter",
      },
    ],
  };
  const files = new Map<string, SourceFile[]>([
    [
      "invoices",
      [
        {
          absolutePath: "/incoming/Scan 001.PDF",
          fileName: "Scan 001.PDF",
          modifiedAt: new Date("2026-07-05T01:00:00.000Z"),
        },
      ],
    ],
  ]);

  const result = planRenameActions(config, files, {
    now: new Date("2026-07-05T02:00:00.000Z"),
  });

  assert.deepEqual(result.errors, []);
  assert.equal(result.dryRun, true);
  assert.equal(result.actions.length, 1);
  assert.equal(result.actions[0]?.status, "ready");
  assert.equal(result.actions[0]?.targetPath, "/organised/invoices/2026-07-05 - Scan 001.PDF");
});

test("planRenameActions appends a counter for target conflicts", () => {
  const config: FileButlerConfig = {
    version: 1,
    folders: [
      {
        id: "receipts",
        name: "Receipts",
        enabled: true,
        sourceFolder: "/receipts",
        action: { type: "rename", pattern: "{date} - {originalName}" },
        conflictStrategy: "append-counter",
      },
    ],
  };
  const files = new Map<string, SourceFile[]>([
    [
      "receipts",
      [
        {
          absolutePath: "/receipts/upload.pdf",
          fileName: "upload.pdf",
          modifiedAt: new Date("2026-07-05T01:00:00.000Z"),
        },
      ],
    ],
  ]);

  const result = planRenameActions(config, files, {
    now: new Date("2026-07-05T02:00:00.000Z"),
    existingTargetPaths: new Set(["/receipts/2026-07-05 - upload.pdf"]),
  });

  assert.equal(result.actions[0]?.status, "ready");
  assert.equal(result.actions[0]?.targetPath, "/receipts/2026-07-05 - upload (2).pdf");
});
