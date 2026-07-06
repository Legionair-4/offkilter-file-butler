import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const bridgePath = path.resolve("dist/bridge/bridge.js");

test("desktop bridge creates a 120-file QA workspace and previews it", async () => {
  const appDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-butler-bridge-qa-"));
  const state = await runBridge({
    command: "createQaWorkspace",
    appDataDir,
  });
  const sourceFolder = state.config.folders[0].sourceFolder;
  const files = await fs.readdir(sourceFolder);

  assert.equal(files.length, 120);

  const preview = await runBridge({
    command: "preview",
    appDataDir,
    payload: state.config,
  });

  assert.equal(preview.errors.length, 0);
  assert.equal(preview.scannedFileCount, 120);
  assert.equal(preview.actions.length, 120);
  assert.equal(preview.actions.every((action) => action.status === "ready"), true);
});

async function runBridge(request) {
  const result = await spawnJson("node", [bridgePath], request);

  if (!result.ok) {
    throw new Error(result.error ?? "File Butler bridge returned an unknown error.");
  }

  return result.result;
}

function spawnJson(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: path.resolve("."),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];

    child.stdout.on("data", (chunk) => stdout.push(Buffer.from(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(Buffer.from(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      const output = Buffer.concat(stdout).toString("utf8");

      if (code !== 0) {
        reject(new Error(Buffer.concat(stderr).toString("utf8") || output || `${command} exited with ${code}`));
        return;
      }

      try {
        resolve(JSON.parse(output));
      } catch (error) {
        reject(error);
      }
    });
    child.stdin.end(JSON.stringify(input));
  });
}
