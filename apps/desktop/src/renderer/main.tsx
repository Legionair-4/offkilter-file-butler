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
  const [activeRuleId, setActiveRuleId] = useState("folder-1");
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
  const activeFolder = useMemo(
    () => state?.config.folders.find((folder) => folder.id === activeRuleId) ?? state?.config.folders[0],
    [activeRuleId, state?.config.folders],
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
  const currentStep = getCurrentStep(activeFolder, preview);

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-mark">OK</span>
          <div>
            <p className="eyebrow">OffKilter Plugin</p>
            <h1>File Butler</h1>
          </div>
        </div>
        <div className="header-summary" aria-live="polite">
          <span>{statusMessage}</span>
          <strong>{enabledFolderCount}/3 folders active</strong>
        </div>
        <button className="button button--secondary" type="button" onClick={() => void invoke("open_offkilter")}>
          Open OffKilter
        </button>
      </header>

      <section className="workflow-shell" aria-label="Guided File Butler setup">
        <aside className="workflow-rail" aria-label="Setup steps">
          <div className="cta-panel">
            <p className="eyebrow">OffKilter</p>
            <h2>More tools for repetitive work.</h2>
            <button className="button button--secondary" type="button" onClick={() => void invoke("open_offkilter")}>
              Get more OffKilter tools
            </button>
          </div>

          <StepList currentStep={currentStep} folder={activeFolder} preview={preview} />
        </aside>

        <section className="guided-flow">
          <div className="flow-header">
            <div>
              <p className="eyebrow">Step {currentStep} of 4</p>
              <h2>{getStepTitle(currentStep)}</h2>
            </div>
            <div className="flow-actions">
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
          </div>

          <div className="folder-tabs" role="tablist" aria-label="Folder slots">
            {state.config.folders.map((folder, index) => (
              <button
                key={folder.id}
                type="button"
                role="tab"
                aria-selected={folder.id === activeRuleId}
                className={`folder-tab ${folder.id === activeRuleId ? "folder-tab--active" : ""}`}
                onClick={() => setActiveRuleId(folder.id)}
              >
                <span>Folder {index + 1}</span>
                <strong>{folder.sourceFolder ? baseName(folder.sourceFolder) : "Not selected"}</strong>
              </button>
            ))}
          </div>

          {activeFolder ? (
            <FolderRuleCard folder={activeFolder} onChooseFolder={chooseFolder} onUpdateFolder={updateFolder} />
          ) : null}

          <PreviewPanel preview={preview} applyResult={applyResult} undoResult={undoResult} />
        </section>
      </section>
    </main>
  );
}

interface StepListProps {
  currentStep: number;
  folder: FolderRule | undefined;
  preview: PreviewResult;
}

function StepList({ currentStep, folder, preview }: StepListProps) {
  const steps = [
    {
      number: 1,
      title: "Choose a folder",
      detail: folder?.sourceFolder ? baseName(folder.sourceFolder) : "Pick the folder File Butler should clean.",
    },
    {
      number: 2,
      title: "Set the rename rule",
      detail: folder?.action.pattern || "Choose how files should be renamed.",
    },
    {
      number: 3,
      title: "Preview changes",
      detail: preview.actions.length > 0 ? `${preview.actions.length} planned change(s).` : "Check the plan before anything moves.",
    },
    {
      number: 4,
      title: "Apply safely",
      detail: "Apply ready actions or undo the last run.",
    },
  ];

  return (
    <ol className="step-list">
      {steps.map((step) => (
        <li key={step.number} className={step.number === currentStep ? "step step--active" : "step"}>
          <span>{step.number}</span>
          <div>
            <strong>{step.title}</strong>
            <p>{step.detail}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface PreviewPanelProps {
  preview: PreviewResult;
  applyResult: AppliedFileAction[];
  undoResult: UndoFileAction[];
}

function PreviewPanel({ preview, applyResult, undoResult }: PreviewPanelProps) {
  const readyCount = preview.actions.filter((action) => action.status === "ready").length;
  return (
    <section className="preview-panel" aria-label="Preview and results">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{readyCount} ready action(s)</h2>
        </div>
        <span>{preview.scannedFileCount} file(s) scanned</span>
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
    </section>
  );
}

function getCurrentStep(folder: FolderRule | undefined, preview: PreviewResult): number {
  if (!folder?.sourceFolder) {
    return 1;
  }

  if (!folder.action.pattern.trim()) {
    return 2;
  }

  if (preview.actions.length === 0 && preview.errors.length === 0) {
    return 3;
  }

  return 4;
}

function getStepTitle(step: number): string {
  if (step === 1) {
    return "Choose the folder File Butler should clean.";
  }

  if (step === 2) {
    return "Set the rename pattern.";
  }

  if (step === 3) {
    return "Preview before anything moves.";
  }

  return "Apply the safe actions.";
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
