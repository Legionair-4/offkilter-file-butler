import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import type {
  AppliedFileAction,
  ConflictStrategy,
  FileButlerConfig,
  FolderRule,
  PlannedFileAction,
  PreviewResult,
  UndoFileAction,
} from "@offkilter/file-butler-core";
import "./styles.css";

type RunState = "loading" | "idle" | "previewing" | "applying" | "undoing";

interface AppState {
  config: FileButlerConfig;
  lastRunId?: string;
  recentRunIds: string[];
}

const emptyPreview: PreviewResult = {
  dryRun: true,
  actions: [],
  errors: [],
  scannedFileCount: 0,
};

function App() {
  const [state, setState] = useState<AppState | undefined>();
  const [preview, setPreview] = useState<PreviewResult>(emptyPreview);
  const [runState, setRunState] = useState<RunState>("loading");
  const [statusMessage, setStatusMessage] = useState("Loading File Butler...");
  const [applyResult, setApplyResult] = useState<AppliedFileAction[]>([]);
  const [undoResult, setUndoResult] = useState<UndoFileAction[]>([]);

  useEffect(() => {
    invoke<AppState>("load_state")
      .then((loadedState) => {
        setState(loadedState);
        setStatusMessage("Choose folders, preview the changes, then apply when ready.");
        setRunState("idle");
      })
      .catch((error: unknown) => {
        setStatusMessage(formatError(error));
        setRunState("idle");
      });
  }, []);

  const enabledFolderCount = useMemo(
    () => state?.config.folders.filter((folder) => folder.enabled).length ?? 0,
    [state?.config.folders],
  );

  const readyActionCount = useMemo(
    () => preview.actions.filter((action) => action.status === "ready").length,
    [preview.actions],
  );

  function updateConfig(updater: (config: FileButlerConfig) => FileButlerConfig) {
    setState((currentState) => {
      if (!currentState) {
        return currentState;
      }

      return {
        ...currentState,
        config: updater(currentState.config),
      };
    });
    setPreview(emptyPreview);
    setApplyResult([]);
    setUndoResult([]);
  }

  function updateFolder(ruleId: string, patch: Partial<FolderRule>) {
    updateConfig((config) => ({
      ...config,
      folders: config.folders.map((folder) => (folder.id === ruleId ? { ...folder, ...patch } : folder)),
    }));
  }

  async function chooseFolder(ruleId: string, field: "sourceFolder" | "destinationFolder") {
    const folderPath = await openDialog({
      directory: true,
      multiple: false,
    });

    if (!folderPath) {
      return;
    }

    updateFolder(ruleId, {
      [field]: Array.isArray(folderPath) ? folderPath[0] : folderPath,
      enabled: field === "sourceFolder" ? true : undefined,
    });
  }

  async function saveAndPreview() {
    if (!state) {
      return;
    }

    setRunState("previewing");
    setStatusMessage("Building preview...");
    setApplyResult([]);
    setUndoResult([]);

    try {
      await invoke<AppState>("save_config", { config: state.config });
      const nextPreview = await invoke<PreviewResult>("preview", { config: state.config });
      setPreview(nextPreview);
      setStatusMessage(makePreviewStatus(nextPreview));
    } catch (error) {
      setStatusMessage(formatError(error));
    } finally {
      setRunState("idle");
    }
  }

  async function applyReadyActions() {
    if (!state) {
      return;
    }

    setRunState("applying");
    setStatusMessage("Applying ready actions...");
    setUndoResult([]);

    try {
      const result = await invoke<{ actions: AppliedFileAction[] }>("apply", { config: state.config });
      const loadedState = await invoke<AppState>("load_state");
      setState(loadedState);
      setApplyResult(result.actions);
      setStatusMessage(`Applied ${result.actions.filter((action) => action.status === "applied").length} action(s).`);
    } catch (error) {
      setStatusMessage(formatError(error));
    } finally {
      setRunState("idle");
    }
  }

  async function undoLastRun() {
    setRunState("undoing");
    setStatusMessage("Undoing last applied run...");
    setApplyResult([]);

    try {
      const result = await invoke<{ actions: UndoFileAction[] }>("undo_last_run");
      const loadedState = await invoke<AppState>("load_state");
      setState(loadedState);
      setUndoResult(result.actions);
      setStatusMessage(`Undid ${result.actions.filter((action) => action.status === "undone").length} action(s).`);
    } catch (error) {
      setStatusMessage(formatError(error));
    } finally {
      setRunState("idle");
    }
  }

  if (!state) {
    return (
      <main className="app-shell app-shell--loading">
        <p>{statusMessage}</p>
      </main>
    );
  }

  const isBusy = runState !== "idle";
  const canPreview = enabledFolderCount > 0 && !isBusy;
  const canApply = readyActionCount > 0 && !isBusy;
  const canUndo = Boolean(state.lastRunId) && !isBusy;

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">OffKilter Plugin</p>
          <h1>File Butler</h1>
        </div>
        <div className="header-actions">
          <button className="button button--secondary" type="button" onClick={() => void invoke("open_offkilter")}>
            Open OffKilter
          </button>
        </div>
      </header>

      <section className="status-strip" aria-live="polite">
        <span>{statusMessage}</span>
        <span>{enabledFolderCount}/3 folders enabled</span>
      </section>

      <section className="workspace-grid" aria-label="File Butler setup and preview">
        <div className="setup-panel">
          <div className="section-heading">
            <h2>Folder Rules</h2>
            <p>Each folder gets one safe rename action.</p>
          </div>

          <div className="folder-list">
            {state.config.folders.map((folder) => (
              <FolderRuleCard key={folder.id} folder={folder} onChooseFolder={chooseFolder} onUpdateFolder={updateFolder} />
            ))}
          </div>
        </div>

        <div className="preview-panel">
          <div className="section-heading">
            <h2>Preview</h2>
            <p>{preview.scannedFileCount} file(s) scanned, {readyActionCount} ready.</p>
          </div>
          <PreviewTable actions={preview.actions} />
          <ResultList title="Apply Result" actions={applyResult} />
          <ResultList title="Undo Result" actions={undoResult} />
          {preview.errors.length > 0 ? (
            <div className="error-list">
              {preview.errors.map((error) => (
                <p key={`${error.path}-${error.message}`}>
                  <strong>{error.path}</strong>: {error.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <footer className="action-bar">
        <button className="button button--secondary" type="button" onClick={() => void invoke("open_offkilter")}>
          Get more OffKilter tools
        </button>
        <div className="action-group">
          <button className="button button--secondary" type="button" disabled={!canUndo} onClick={() => void undoLastRun()}>
            Undo last run
          </button>
          <button className="button button--secondary" type="button" disabled={!canPreview} onClick={() => void saveAndPreview()}>
            Preview
          </button>
          <button className="button button--primary" type="button" disabled={!canApply} onClick={() => void applyReadyActions()}>
            Apply ready actions
          </button>
        </div>
      </footer>
    </main>
  );
}

interface FolderRuleCardProps {
  folder: FolderRule;
  onChooseFolder(ruleId: string, field: "sourceFolder" | "destinationFolder"): Promise<void>;
  onUpdateFolder(ruleId: string, patch: Partial<FolderRule>): void;
}

function FolderRuleCard({ folder, onChooseFolder, onUpdateFolder }: FolderRuleCardProps) {
  return (
    <article className="folder-card">
      <div className="folder-card__header">
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={folder.enabled}
            onChange={(event) => onUpdateFolder(folder.id, { enabled: event.target.checked })}
          />
          <span>{folder.name}</span>
        </label>
        <select
          value={folder.conflictStrategy}
          onChange={(event) => onUpdateFolder(folder.id, { conflictStrategy: event.target.value as ConflictStrategy })}
          aria-label={`${folder.name} conflict behaviour`}
        >
          <option value="append-counter">Append counter</option>
          <option value="needs-review">Needs review</option>
          <option value="skip">Skip conflicts</option>
        </select>
      </div>

      <div className="field-grid">
        <PathField
          label="Source folder"
          value={folder.sourceFolder}
          buttonLabel="Choose source"
          onChoose={() => onChooseFolder(folder.id, "sourceFolder")}
        />
        <PathField
          label="Destination folder"
          value={folder.destinationFolder ?? ""}
          buttonLabel="Choose destination"
          placeholder="Same folder"
          onChoose={() => onChooseFolder(folder.id, "destinationFolder")}
        />
      </div>

      <label className="text-field">
        <span>Rename pattern</span>
        <input
          type="text"
          value={folder.action.pattern}
          onChange={(event) => onUpdateFolder(folder.id, { action: { type: "rename", pattern: event.target.value } })}
        />
      </label>
    </article>
  );
}

interface PathFieldProps {
  label: string;
  value: string;
  buttonLabel: string;
  placeholder?: string;
  onChoose(): Promise<void>;
}

function PathField({ label, value, buttonLabel, placeholder = "Not selected", onChoose }: PathFieldProps) {
  return (
    <label className="path-field">
      <span>{label}</span>
      <div>
        <output title={value || placeholder}>{value || placeholder}</output>
        <button type="button" className="button button--small" onClick={() => void onChoose()}>
          {buttonLabel}
        </button>
      </div>
    </label>
  );
}

function PreviewTable({ actions }: { actions: PlannedFileAction[] }) {
  if (actions.length === 0) {
    return <p className="empty-state">Run preview to see planned changes before anything moves.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Status</th>
            <th>From</th>
            <th>To</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={`${action.sourcePath}-${action.targetPath}`}>
              <td>
                <span className={`badge badge--${action.status}`}>{action.status}</span>
              </td>
              <td title={action.sourcePath}>{baseName(action.sourcePath)}</td>
              <td title={action.targetPath}>{baseName(action.targetPath)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ResultList({ title, actions }: { title: string; actions: Array<AppliedFileAction | UndoFileAction> }) {
  if (actions.length === 0) {
    return null;
  }

  return (
    <div className="result-list">
      <h3>{title}</h3>
      {actions.map((action) => (
        <p key={`${title}-${action.sourcePath}-${action.targetPath}`}>
          <span className={`badge badge--${action.status}`}>{action.status}</span>
          {baseName(action.sourcePath)} → {baseName(action.targetPath)}
        </p>
      ))}
    </div>
  );
}

function makePreviewStatus(result: PreviewResult): string {
  if (result.errors.length > 0) {
    return `${result.errors.length} issue(s) need attention before File Butler can plan actions.`;
  }

  const readyCount = result.actions.filter((action) => action.status === "ready").length;
  return `Preview ready: ${readyCount} action(s) can be applied.`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
