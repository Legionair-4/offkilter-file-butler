import { contextBridge, ipcRenderer } from "electron";
import type { ApplyRun, FileButlerConfig, PreviewResult, UndoRun } from "@offkilter/file-butler-core";

export interface FileButlerDesktopApi {
  loadState(): Promise<{
    config: FileButlerConfig;
    lastRunId?: string;
    recentRunIds: string[];
  }>;
  saveConfig(config: FileButlerConfig): Promise<{
    config: FileButlerConfig;
    lastRunId?: string;
    recentRunIds: string[];
  }>;
  chooseFolder(): Promise<string | undefined>;
  preview(config: FileButlerConfig): Promise<PreviewResult>;
  apply(config: FileButlerConfig): Promise<ApplyRun>;
  undoLastRun(): Promise<UndoRun>;
  openOffKilter(): Promise<void>;
}

const api: FileButlerDesktopApi = {
  loadState: () => ipcRenderer.invoke("file-butler:load-state") as Promise<Awaited<ReturnType<FileButlerDesktopApi["loadState"]>>>,
  saveConfig: (config) => ipcRenderer.invoke("file-butler:save-config", config) as Promise<Awaited<ReturnType<FileButlerDesktopApi["saveConfig"]>>>,
  chooseFolder: () => ipcRenderer.invoke("file-butler:choose-folder") as Promise<string | undefined>,
  preview: (config) => ipcRenderer.invoke("file-butler:preview", config) as Promise<PreviewResult>,
  apply: (config) => ipcRenderer.invoke("file-butler:apply", config) as Promise<ApplyRun>,
  undoLastRun: () => ipcRenderer.invoke("file-butler:undo-last-run") as Promise<UndoRun>,
  openOffKilter: () => ipcRenderer.invoke("file-butler:open-offkilter") as Promise<void>,
};

contextBridge.exposeInMainWorld("fileButler", api);
