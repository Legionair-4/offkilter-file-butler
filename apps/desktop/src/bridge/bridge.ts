import fs from "node:fs/promises";
import path from "node:path";
import {
  applyPlannedActions,
  previewFileButlerRun,
  undoApplyRun,
  type FileButlerConfig,
} from "@offkilter/file-butler-core";

const MAX_RECENT_RUNS = 10;

interface BridgeRequest {
  command: string;
  appDataDir: string;
  payload?: unknown;
}

interface StoredState {
  config: FileButlerConfig;
  lastRunId?: string;
  recentRunIds: string[];
}

const defaultState: StoredState = {
  config: {
    version: 1,
    folders: [
      createDefaultFolder("folder-1", "Folder 1"),
      createDefaultFolder("folder-2", "Folder 2"),
      createDefaultFolder("folder-3", "Folder 3"),
    ],
  },
  recentRunIds: [],
};

void main();

async function main(): Promise<void> {
  try {
    const request = JSON.parse(await readStdin()) as BridgeRequest;
    const result = await handleRequest(request);
    process.stdout.write(JSON.stringify({ ok: true, result }));
  } catch (error) {
    process.stdout.write(JSON.stringify({ ok: false, error: formatError(error) }));
    process.exitCode = 1;
  }
}

async function handleRequest(request: BridgeRequest): Promise<unknown> {
  if (!request.appDataDir) {
    throw new Error("Missing appDataDir.");
  }

  switch (request.command) {
    case "createSampleWorkspace":
      return createSampleWorkspace(request.appDataDir);
    case "createQaWorkspace":
      return createQaWorkspace(request.appDataDir);
    case "loadState":
      return readState(request.appDataDir);
    case "saveConfig":
      return saveConfig(request.appDataDir, parseConfig(request.payload));
    case "preview":
      return preview(request.appDataDir, parseConfig(request.payload));
    case "apply":
      return apply(request.appDataDir, parseConfig(request.payload));
    case "undoLastRun":
      return undoLastRun(request.appDataDir);
    default:
      throw new Error(`Unknown File Butler bridge command: ${request.command}`);
  }
}

async function createSampleWorkspace(appDataDir: string): Promise<StoredState> {
  const now = new Date();
  const workspaceName = `sample-${formatTimestamp(now)}`;
  const workspaceDir = path.join(appDataDir, "sample-workspaces", workspaceName);
  const sourceFolder = path.join(workspaceDir, "incoming");
  const destinationFolder = path.join(workspaceDir, "renamed");

  await fs.mkdir(sourceFolder, { recursive: true });
  await fs.mkdir(destinationFolder, { recursive: true });

  await writeSampleFile(path.join(sourceFolder, "invoice-042.pdf"), "Sample invoice PDF placeholder.\n", now);
  await writeSampleFile(path.join(sourceFolder, "receipt coffee.jpg"), "Sample receipt image placeholder.\n", now);
  await writeSampleFile(path.join(sourceFolder, "scan final.png"), "Sample scan image placeholder.\n", now);

  const currentState = await readState(appDataDir);
  const sampleConfig: FileButlerConfig = {
    version: 1,
    folders: currentState.config.folders.map((folder, index) =>
      index === 0
        ? {
            ...folder,
            enabled: true,
            sourceFolder,
            destinationFolder,
            action: { type: "rename", pattern: "{date} - {originalName}" },
            conflictStrategy: "append-counter",
          }
        : {
            ...folder,
            enabled: false,
            sourceFolder: "",
            destinationFolder: undefined,
          },
    ),
  };

  return writeState(appDataDir, {
    ...currentState,
    config: sampleConfig,
    lastRunId: undefined,
  });
}

async function createQaWorkspace(appDataDir: string): Promise<StoredState> {
  const now = new Date();
  const workspaceName = `qa-${formatTimestamp(now)}`;
  const workspaceDir = path.join(appDataDir, "sample-workspaces", workspaceName);
  const sourceFolder = path.join(workspaceDir, "incoming");
  const destinationFolder = path.join(workspaceDir, "renamed");

  await fs.mkdir(sourceFolder, { recursive: true });
  await fs.mkdir(destinationFolder, { recursive: true });

  const sampleNames = buildQaSampleFileNames();
  await Promise.all(
    sampleNames.map((fileName, index) =>
      writeSampleFile(
        path.join(sourceFolder, fileName),
        `OffKilter File Butler QA sample ${index + 1}.\n`,
        new Date(now.getTime() - index * 60_000),
      ),
    ),
  );

  const currentState = await readState(appDataDir);
  const sampleConfig: FileButlerConfig = {
    version: 1,
    folders: currentState.config.folders.map((folder, index) =>
      index === 0
        ? {
            ...folder,
            enabled: true,
            sourceFolder,
            destinationFolder,
            action: { type: "rename", pattern: "{date} - {originalName}" },
            conflictStrategy: "append-counter",
          }
        : {
            ...folder,
            enabled: false,
            sourceFolder: "",
            destinationFolder: undefined,
          },
    ),
  };

  return writeState(appDataDir, {
    ...currentState,
    config: sampleConfig,
    lastRunId: undefined,
  });
}

async function saveConfig(appDataDir: string, config: FileButlerConfig): Promise<StoredState> {
  const currentState = await readState(appDataDir);
  return writeState(appDataDir, { ...currentState, config });
}

async function preview(appDataDir: string, config: FileButlerConfig): Promise<unknown> {
  await saveConfig(appDataDir, config);
  return previewFileButlerRun(config);
}

async function apply(appDataDir: string, config: FileButlerConfig): Promise<unknown> {
  await saveConfig(appDataDir, config);
  const previewResult = await previewFileButlerRun(config);
  const run = await applyPlannedActions(previewResult.actions, {
    logDirectory: getLogDirectory(appDataDir),
  });
  const currentState = await readState(appDataDir);

  await writeState(appDataDir, {
    ...currentState,
    lastRunId: run.runId,
    recentRunIds: [run.runId, ...currentState.recentRunIds.filter((id) => id !== run.runId)].slice(0, MAX_RECENT_RUNS),
  });

  return run;
}

async function undoLastRun(appDataDir: string): Promise<unknown> {
  const currentState = await readState(appDataDir);
  if (!currentState.lastRunId) {
    throw new Error("There is no applied run to undo.");
  }

  const undoRun = await undoApplyRun({
    logDirectory: getLogDirectory(appDataDir),
    runId: currentState.lastRunId,
  });

  await writeState(appDataDir, {
    ...currentState,
    lastRunId: undefined,
    recentRunIds: currentState.recentRunIds.filter((id) => id !== currentState.lastRunId),
  });

  return undoRun;
}

async function readState(appDataDir: string): Promise<StoredState> {
  try {
    const raw = await fs.readFile(getStatePath(appDataDir), "utf8");
    return normalizeStoredState(JSON.parse(raw) as Partial<StoredState>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return structuredClone(defaultState);
    }

    throw error;
  }
}

async function writeState(appDataDir: string, state: StoredState): Promise<StoredState> {
  const normalizedState = normalizeStoredState(state);
  await fs.mkdir(appDataDir, { recursive: true });
  await fs.writeFile(getStatePath(appDataDir), `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
  return normalizedState;
}

function normalizeStoredState(state: Partial<StoredState>): StoredState {
  const fallback = structuredClone(defaultState);
  const folders = Array.from({ length: 3 }, (_, index) => {
    const existing = state.config?.folders?.[index];
    const base = fallback.config.folders[index];

    return {
      ...base,
      ...existing,
      id: base.id,
      name: existing?.name?.trim() || base.name,
      enabled: Boolean(existing?.enabled),
      sourceFolder: existing?.sourceFolder ?? "",
      destinationFolder: existing?.destinationFolder?.trim() ? existing.destinationFolder : undefined,
      action: {
        type: "rename" as const,
        pattern: existing?.action?.pattern?.trim() || base.action.pattern,
      },
      conflictStrategy: existing?.conflictStrategy ?? base.conflictStrategy,
    };
  });

  return {
    config: {
      version: 1,
      folders,
    },
    lastRunId: state.lastRunId,
    recentRunIds: Array.isArray(state.recentRunIds) ? state.recentRunIds.slice(0, MAX_RECENT_RUNS) : [],
  };
}

function createDefaultFolder(id: string, name: string): FileButlerConfig["folders"][number] {
  return {
    id,
    name,
    enabled: false,
    sourceFolder: "",
    action: { type: "rename", pattern: "{date} - {originalName}" },
    conflictStrategy: "append-counter",
  };
}

function parseConfig(payload: unknown): FileButlerConfig {
  if (!payload || typeof payload !== "object" || !("version" in payload) || !("folders" in payload)) {
    throw new Error("Invalid File Butler config payload.");
  }

  return payload as FileButlerConfig;
}

function getStatePath(appDataDir: string): string {
  return path.join(appDataDir, "file-butler-state.json");
}

function getLogDirectory(appDataDir: string): string {
  return path.join(appDataDir, "action-logs");
}

async function writeSampleFile(filePath: string, content: string, timestamp: Date): Promise<void> {
  await fs.writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  await fs.utimes(filePath, timestamp, timestamp);
}

function formatTimestamp(date: Date): string {
  return date.toISOString().replace(/[^0-9]/g, "").slice(0, 14);
}

function buildQaSampleFileNames(): string[] {
  const extensions = ["pdf", "jpg", "png", "docx", "xlsx", "txt"];
  const groups = ["invoice", "receipt", "scan", "photo", "statement", "quote"];
  const names: string[] = [];

  for (let index = 1; index <= 120; index += 1) {
    const group = groups[(index - 1) % groups.length] ?? "file";
    const extension = extensions[(index - 1) % extensions.length] ?? "txt";
    const paddedIndex = String(index).padStart(3, "0");
    const separator = index % 5 === 0 ? " final " : index % 7 === 0 ? " copy " : " ";
    names.push(`${group}${separator}${paddedIndex}.${extension}`);
  }

  return names;
}

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown File Butler bridge error.";
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}
