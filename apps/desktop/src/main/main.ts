import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  applyPlannedActions,
  previewFileButlerRun,
  undoApplyRun,
  type ApplyRun,
  type FileButlerConfig,
  type PreviewResult,
  type UndoRun,
} from "@offkilter/file-butler-core";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";

const OFFKILTER_URL = "https://offkilter.app";
const MAX_RECENT_RUNS = 10;

interface StoredState {
  config: FileButlerConfig;
  lastRunId?: string;
  recentRunIds: string[];
}

const defaultState: StoredState = {
  config: {
    version: 1,
    folders: [
      {
        id: "folder-1",
        name: "Folder 1",
        enabled: false,
        sourceFolder: "",
        action: { type: "rename", pattern: "{date} - {originalName}" },
        conflictStrategy: "append-counter",
      },
      {
        id: "folder-2",
        name: "Folder 2",
        enabled: false,
        sourceFolder: "",
        action: { type: "rename", pattern: "{date} - {originalName}" },
        conflictStrategy: "append-counter",
      },
      {
        id: "folder-3",
        name: "Folder 3",
        enabled: false,
        sourceFolder: "",
        action: { type: "rename", pattern: "{date} - {originalName}" },
        conflictStrategy: "append-counter",
      },
    ],
  },
  recentRunIds: [],
};

function getStatePath(): string {
  return path.join(app.getPath("userData"), "file-butler-state.json");
}

function getLogDirectory(): string {
  return path.join(app.getPath("userData"), "action-logs");
}

async function readState(): Promise<StoredState> {
  try {
    const raw = await fs.readFile(getStatePath(), "utf8");
    return normalizeStoredState(JSON.parse(raw) as Partial<StoredState>);
  } catch (error) {
    if (isMissingFileError(error)) {
      return structuredClone(defaultState);
    }

    throw error;
  }
}

async function writeState(state: StoredState): Promise<StoredState> {
  const normalizedState = normalizeStoredState(state);
  await fs.mkdir(path.dirname(getStatePath()), { recursive: true });
  await fs.writeFile(getStatePath(), `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
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

function isMissingFileError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT";
}

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 940,
    minHeight: 620,
    backgroundColor: "#f6f0e5",
    title: "OffKilter File Butler",
    webPreferences: {
      preload: path.join(path.dirname(fileURLToPath(import.meta.url)), "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
    return;
  }

  await window.loadFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "../renderer/index.html"));
}

ipcMain.handle("file-butler:load-state", async (): Promise<StoredState> => readState());

ipcMain.handle("file-butler:save-config", async (_event, config: FileButlerConfig): Promise<StoredState> => {
  const currentState = await readState();
  return writeState({ ...currentState, config });
});

ipcMain.handle("file-butler:choose-folder", async (): Promise<string | undefined> => {
  const result = await dialog.showOpenDialog({
    properties: ["openDirectory", "createDirectory"],
  });

  return result.canceled ? undefined : result.filePaths[0];
});

ipcMain.handle("file-butler:preview", async (_event, config: FileButlerConfig): Promise<PreviewResult> => {
  await writeState({ ...(await readState()), config });
  return previewFileButlerRun(config);
});

ipcMain.handle("file-butler:apply", async (_event, config: FileButlerConfig): Promise<ApplyRun> => {
  await writeState({ ...(await readState()), config });
  const preview = await previewFileButlerRun(config);
  const run = await applyPlannedActions(preview.actions, {
    logDirectory: getLogDirectory(),
  });
  const currentState = await readState();

  await writeState({
    ...currentState,
    lastRunId: run.runId,
    recentRunIds: [run.runId, ...currentState.recentRunIds.filter((id) => id !== run.runId)].slice(0, MAX_RECENT_RUNS),
  });

  return run;
});

ipcMain.handle("file-butler:undo-last-run", async (): Promise<UndoRun> => {
  const currentState = await readState();
  if (!currentState.lastRunId) {
    throw new Error("There is no applied run to undo.");
  }

  const undoRun = await undoApplyRun({
    logDirectory: getLogDirectory(),
    runId: currentState.lastRunId,
  });

  await writeState({
    ...currentState,
    lastRunId: undefined,
    recentRunIds: currentState.recentRunIds.filter((id) => id !== currentState.lastRunId),
  });

  return undoRun;
});

ipcMain.handle("file-butler:open-offkilter", async (): Promise<void> => {
  await shell.openExternal(OFFKILTER_URL);
});

app.whenReady().then(async () => {
  await createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
