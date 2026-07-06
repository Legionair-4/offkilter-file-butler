import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { invoke as tauriInvoke } from "@tauri-apps/api/core";
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
type TauriWindow = Window & { __TAURI_INTERNALS__?: unknown };

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

const renamePresets = [
  {
    label: "Date + original",
    pattern: "{date} - {originalName}",
    example: "2026-07-06 - invoice.pdf",
  },
  {
    label: "Original + date",
    pattern: "{originalBase} - {date}.{ext}",
    example: "invoice - 2026-07-06.pdf",
  },
  {
    label: "Clean name",
    pattern: "{originalBase}.{ext}",
    example: "invoice.pdf",
  },
  {
    label: "By type",
    pattern: "{ext} - {originalBase}.{ext}",
    example: "pdf - invoice.pdf",
  },
] as const;

const browserStateKey = "offkilter:file-butler:browser-state";
const offkilterUrl = "https://offkiltergroup.com/";

const defaultState: AppState = {
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

function App() {
  const [state, setState] = useState<AppState | undefined>();
  const [activeRuleId, setActiveRuleId] = useState("folder-1");
  const [preview, setPreview] = useState<PreviewResult>(emptyPreview);
  const [isPreviewDrawerOpen, setIsPreviewDrawerOpen] = useState(false);
  const [runState, setRunState] = useState<RunState>("loading");
  const [statusMessage, setStatusMessage] = useState("Loading File Butler...");
  const [applyResult, setApplyResult] = useState<AppliedFileAction[]>([]);
  const [undoResult, setUndoResult] = useState<UndoFileAction[]>([]);

  useEffect(() => {
    invokeFileButler<AppState>("load_state")
      .then((loadedState) => {
        setState(loadedState);
        setStatusMessage(
          isTauriRuntime()
            ? "Choose folders, preview the changes, then apply when ready."
            : "Browser preview mode: use sample paths to test the UI. File actions run only in the desktop app.",
        );
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
  const previewSummary = useMemo(() => summarizePreview(preview), [preview]);
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
    setIsPreviewDrawerOpen(false);
  }

  function updateFolder(ruleId: string, patch: Partial<FolderRule>) {
    updateConfig((config) => ({
      ...config,
      folders: config.folders.map((folder) => (folder.id === ruleId ? { ...folder, ...patch } : folder)),
    }));
  }

  async function chooseFolder(ruleId: string, field: "sourceFolder" | "destinationFolder") {
    const folderPath = isTauriRuntime()
      ? await openDialog({
          directory: true,
          multiple: false,
        })
      : window.prompt(
          `Enter a sample ${field === "sourceFolder" ? "source" : "destination"} folder path for browser preview:`,
          field === "sourceFolder" ? "/Users/shane/Downloads" : "",
        );

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
      await invokeFileButler<AppState>("save_config", { config: state.config });
      const nextPreview = await invokeFileButler<PreviewResult>("preview", { config: state.config });
      setPreview(nextPreview);
      setIsPreviewDrawerOpen(true);
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
      const result = await invokeFileButler<{ actions: AppliedFileAction[] }>("apply", { config: state.config });
      const loadedState = await invokeFileButler<AppState>("load_state");
      setState(loadedState);
      setApplyResult(result.actions);
      setIsPreviewDrawerOpen(true);
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
      const result = await invokeFileButler<{ actions: UndoFileAction[] }>("undo_last_run");
      const loadedState = await invokeFileButler<AppState>("load_state");
      setState(loadedState);
      setUndoResult(result.actions);
      setIsPreviewDrawerOpen(true);
      setStatusMessage(`Undid ${result.actions.filter((action) => action.status === "undone").length} action(s).`);
    } catch (error) {
      setStatusMessage(formatError(error));
    } finally {
      setRunState("idle");
    }
  }

  async function loadSampleWorkspace() {
    setRunState("loading");
    setStatusMessage("Creating sample workspace...");
    setPreview(emptyPreview);
    setApplyResult([]);
    setUndoResult([]);
    setIsPreviewDrawerOpen(false);

    try {
      const loadedState = await invokeFileButler<AppState>("create_sample_workspace");
      setState(loadedState);
      setActiveRuleId(loadedState.config.folders[0]?.id ?? "folder-1");
      setStatusMessage("Sample workspace loaded. Run preview to inspect the planned renames.");
    } catch (error) {
      setStatusMessage(formatError(error));
    } finally {
      setRunState("idle");
    }
  }

  async function loadQaWorkspace() {
    setRunState("loading");
    setStatusMessage("Creating QA sample workspace...");
    setPreview(emptyPreview);
    setApplyResult([]);
    setUndoResult([]);
    setIsPreviewDrawerOpen(false);

    try {
      const loadedState = await invokeFileButler<AppState>("create_qa_workspace");
      setState(loadedState);
      setActiveRuleId(loadedState.config.folders[0]?.id ?? "folder-1");
      setStatusMessage("QA sample workspace loaded. Run preview to inspect the larger disposable file set.");
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
  const hasPreviewContent = preview.actions.length > 0 || preview.errors.length > 0 || applyResult.length > 0 || undoResult.length > 0;

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
        <button className="button button--secondary" type="button" onClick={() => void openOffkilter()}>
          Open OffKilter
        </button>
      </header>

      <section className="workflow-shell" aria-label="Guided File Butler setup">
        <aside className="workflow-rail" aria-label="Setup steps">
          <div className="cta-panel">
            <p className="eyebrow">OffKilter</p>
            <h2>More tools for repetitive work.</h2>
            <button className="button button--secondary" type="button" onClick={() => void openOffkilter()}>
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
              <button className="button button--secondary" type="button" disabled={isBusy} onClick={() => void loadSampleWorkspace()}>
                Load sample
              </button>
              <button className="button button--secondary" type="button" disabled={isBusy} onClick={() => void loadQaWorkspace()}>
                Load QA sample
              </button>
              <button className="button button--secondary" type="button" disabled={!canPreview} onClick={() => void saveAndPreview()}>
                Preview
              </button>
              <button
                className="button button--secondary"
                type="button"
                disabled={!hasPreviewContent}
                onClick={() => setIsPreviewDrawerOpen(true)}
              >
                Review preview
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
        </section>
      </section>

      <PreviewDrawer
        isOpen={isPreviewDrawerOpen}
        preview={preview}
        previewSummary={previewSummary}
        applyResult={applyResult}
        undoResult={undoResult}
        recentRunIds={state.recentRunIds}
        lastRunId={state.lastRunId}
        canApply={canApply}
        canUndo={canUndo}
        isBusy={isBusy}
        onApply={() => void applyReadyActions()}
        onUndo={() => void undoLastRun()}
        onClose={() => setIsPreviewDrawerOpen(false)}
      />
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
  previewSummary: PreviewSummary;
  applyResult: AppliedFileAction[];
  undoResult: UndoFileAction[];
  recentRunIds: string[];
  lastRunId: string | undefined;
  canUndo: boolean;
  isBusy: boolean;
  onUndo(): void;
}

interface PreviewDrawerProps extends PreviewPanelProps {
  isOpen: boolean;
  canApply: boolean;
  onApply(): void;
  onClose(): void;
}

function PreviewDrawer({
  isOpen,
  preview,
  previewSummary,
  applyResult,
  undoResult,
  recentRunIds,
  lastRunId,
  canApply,
  canUndo,
  isBusy,
  onApply,
  onUndo,
  onClose,
}: PreviewDrawerProps) {
  return (
    <aside className={`preview-drawer ${isOpen ? "preview-drawer--open" : ""}`} aria-label="Preview drawer" aria-hidden={!isOpen}>
      <div className="preview-drawer__header">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{previewSummary.ready} ready action(s)</h2>
        </div>
        <div className="preview-drawer__actions">
          <button className="button button--primary" type="button" disabled={!canApply || isBusy} onClick={onApply}>
            Apply
          </button>
          <button className="button button--secondary" type="button" disabled={!canUndo || isBusy} onClick={onUndo}>
            Undo
          </button>
          <button className="button button--secondary" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
      <PreviewPanel
        preview={preview}
        previewSummary={previewSummary}
        applyResult={applyResult}
        undoResult={undoResult}
        recentRunIds={recentRunIds}
        lastRunId={lastRunId}
        canUndo={canUndo}
        isBusy={isBusy}
        onUndo={onUndo}
      />
    </aside>
  );
}

function PreviewPanel({
  preview,
  previewSummary,
  applyResult,
  undoResult,
  recentRunIds,
  lastRunId,
  canUndo,
  isBusy,
  onUndo,
}: PreviewPanelProps) {
  return (
    <section className="preview-panel" aria-label="Preview and results">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Preview</p>
          <h2>{previewSummary.ready} ready action(s)</h2>
        </div>
        <span>{preview.scannedFileCount} file(s) scanned</span>
      </div>

      <StatusSummary summary={previewSummary} />
      <PreviewTable actions={preview.actions} />
      <RunHistory lastRunId={lastRunId} recentRunIds={recentRunIds} canUndo={canUndo} isBusy={isBusy} onUndo={onUndo} />
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

interface PreviewSummary {
  ready: number;
  conflict: number;
  needsReview: number;
  skipped: number;
}

function summarizePreview(preview: PreviewResult): PreviewSummary {
  return preview.actions.reduce<PreviewSummary>(
    (summary, action) => {
      if (action.status === "ready") {
        summary.ready += 1;
      } else if (action.status === "conflict") {
        summary.conflict += 1;
      } else if (action.status === "needs-review") {
        summary.needsReview += 1;
      } else {
        summary.skipped += 1;
      }

      return summary;
    },
    { ready: 0, conflict: 0, needsReview: 0, skipped: 0 },
  );
}

function StatusSummary({ summary }: { summary: PreviewSummary }) {
  return (
    <div className="status-summary" aria-label="Preview status summary">
      <StatusTile label="Ready" value={summary.ready} tone="ready" />
      <StatusTile label="Review" value={summary.needsReview} tone="needs-review" />
      <StatusTile label="Conflict" value={summary.conflict} tone="conflict" />
      <StatusTile label="Skipped" value={summary.skipped} tone="skipped" />
    </div>
  );
}

function StatusTile({ label, value, tone }: { label: string; value: number; tone: PlannedFileAction["status"] }) {
  return (
    <div className={`status-tile status-tile--${tone}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function RunHistory({
  lastRunId,
  recentRunIds,
  canUndo,
  isBusy,
  onUndo,
}: {
  lastRunId: string | undefined;
  recentRunIds: string[];
  canUndo: boolean;
  isBusy: boolean;
  onUndo(): void;
}) {
  if (!lastRunId && recentRunIds.length === 0) {
    return null;
  }

  return (
    <section className="run-history" aria-label="Run history">
      <div>
        <h3>Undo history</h3>
        <p>{lastRunId ? `Last applied run: ${shortRunId(lastRunId)}` : "No run is currently available to undo."}</p>
      </div>
      <button className="button button--small" type="button" disabled={!canUndo || isBusy} onClick={onUndo}>
        Undo last run
      </button>
      {recentRunIds.length > 0 ? (
        <ol>
          {recentRunIds.slice(0, 3).map((runId) => (
            <li key={runId}>{shortRunId(runId)}</li>
          ))}
        </ol>
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
        <div className="preset-grid" aria-label="Rename pattern presets">
          {renamePresets.map((preset) => (
            <button
              key={preset.pattern}
              type="button"
              className={`preset-chip ${folder.action.pattern === preset.pattern ? "preset-chip--active" : ""}`}
              onClick={() => onUpdateFolder(folder.id, { action: { type: "rename", pattern: preset.pattern } })}
              title={preset.example}
            >
              <strong>{preset.label}</strong>
              <span>{preset.example}</span>
            </button>
          ))}
        </div>
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
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {actions.map((action) => (
            <tr key={`${action.sourcePath}-${action.targetPath}`} className={`row--${action.status}`}>
              <td>
                <span className={`badge badge--${action.status}`}>{formatStatus(action.status)}</span>
              </td>
              <td title={action.sourcePath}>{baseName(action.sourcePath)}</td>
              <td title={action.targetPath}>{baseName(action.targetPath)}</td>
              <td title={action.reason ?? ""}>{action.reason ?? "Ready to apply."}</td>
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
  const reviewCount = result.actions.filter((action) => action.status === "needs-review" || action.status === "conflict").length;
  return `Preview ready: ${readyCount} action(s) can be applied${reviewCount > 0 ? `, ${reviewCount} need attention` : ""}.`;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function baseName(filePath: string): string {
  return filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
}

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && Boolean((window as TauriWindow).__TAURI_INTERNALS__);
}

async function invokeFileButler<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (isTauriRuntime()) {
    return tauriInvoke<T>(command, args);
  }

  return handleBrowserCommand<T>(command, args);
}

async function openOffkilter(): Promise<void> {
  if (isTauriRuntime()) {
    await tauriInvoke("open_offkilter");
    return;
  }

  window.open(offkilterUrl, "_blank", "noopener,noreferrer");
}

async function handleBrowserCommand<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  switch (command) {
    case "load_state":
      return loadBrowserState() as T;
    case "create_sample_workspace":
      return createBrowserSampleWorkspace() as T;
    case "create_qa_workspace":
      return createBrowserQaWorkspace() as T;
    case "save_config":
      return saveBrowserState({ ...loadBrowserState(), config: parseBrowserConfig(args?.config) }) as T;
    case "preview":
      return buildBrowserPreview(parseBrowserConfig(args?.config)) as T;
    case "apply":
      return applyBrowserPreview(parseBrowserConfig(args?.config)) as T;
    case "undo_last_run":
      return { actions: [] } as T;
    default:
      throw new Error(`Browser preview does not support command: ${command}`);
  }
}

function createBrowserSampleWorkspace(): AppState {
  const currentState = loadBrowserState();
  const sampleState = normalizeBrowserState({
    ...currentState,
    lastRunId: undefined,
    config: {
      version: 1,
      folders: currentState.config.folders.map((folder, index) =>
        index === 0
          ? {
              ...folder,
              enabled: true,
              sourceFolder: "/Users/shane/File Butler Sample/incoming",
              destinationFolder: "/Users/shane/File Butler Sample/renamed",
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
    },
  });

  return saveBrowserState(sampleState);
}

function createBrowserQaWorkspace(): AppState {
  const currentState = loadBrowserState();
  const sampleState = normalizeBrowserState({
    ...currentState,
    lastRunId: undefined,
    config: {
      version: 1,
      folders: currentState.config.folders.map((folder, index) =>
        index === 0
          ? {
              ...folder,
              enabled: true,
              sourceFolder: "/Users/shane/File Butler QA Sample/incoming",
              destinationFolder: "/Users/shane/File Butler QA Sample/renamed",
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
    },
  });

  return saveBrowserState(sampleState);
}

function loadBrowserState(): AppState {
  try {
    const rawState = window.localStorage.getItem(browserStateKey);
    if (!rawState) {
      return structuredClone(defaultState);
    }

    return normalizeBrowserState(JSON.parse(rawState) as Partial<AppState>);
  } catch {
    return structuredClone(defaultState);
  }
}

function saveBrowserState(state: AppState): AppState {
  const normalizedState = normalizeBrowserState(state);
  window.localStorage.setItem(browserStateKey, JSON.stringify(normalizedState));
  return normalizedState;
}

function parseBrowserConfig(value: unknown): FileButlerConfig {
  if (!value || typeof value !== "object" || !("folders" in value)) {
    throw new Error("Missing File Butler config.");
  }

  return normalizeBrowserState({ config: value as FileButlerConfig }).config;
}

function normalizeBrowserState(state: Partial<AppState>): AppState {
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
    recentRunIds: Array.isArray(state.recentRunIds) ? state.recentRunIds.slice(0, 10) : [],
  };
}

function createDefaultFolder(id: string, name: string): FolderRule {
  return {
    id,
    name,
    enabled: false,
    sourceFolder: "",
    action: { type: "rename", pattern: "{date} - {originalName}" },
    conflictStrategy: "append-counter",
  };
}

function buildBrowserPreview(config: FileButlerConfig): PreviewResult {
  saveBrowserState({ ...loadBrowserState(), config });

  const enabledFolders = config.folders.filter((folder) => folder.enabled);
  const errors = enabledFolders
    .filter((folder) => !folder.sourceFolder.trim())
    .map((folder) => ({
      path: `folders.${folder.id}.sourceFolder`,
      message: "Source folder is required.",
    }));

  if (errors.length > 0) {
    return {
      dryRun: true,
      actions: [],
      errors,
      scannedFileCount: 0,
    };
  }

  const actions = enabledFolders.flatMap((folder) => makeBrowserPreviewActions(folder));

  return {
    dryRun: true,
    actions,
    errors: [],
    scannedFileCount: actions.length,
  };
}

function applyBrowserPreview(config: FileButlerConfig): { actions: AppliedFileAction[] } {
  const preview = buildBrowserPreview(config);
  const runId = `browser-preview-${Date.now()}`;
  saveBrowserState({
    ...loadBrowserState(),
    config,
    lastRunId: runId,
    recentRunIds: [runId, ...loadBrowserState().recentRunIds].slice(0, 10),
  });

  return {
    actions: preview.actions.map((action) => ({
      ruleId: action.ruleId,
      sourcePath: action.sourcePath,
      targetPath: action.targetPath,
      status: "skipped",
      reason: "Browser preview mode does not rename files. Use the desktop app to apply actions.",
    })),
  };
}

function makeBrowserPreviewActions(folder: FolderRule): PlannedFileAction[] {
  const destinationFolder = folder.destinationFolder?.trim() || folder.sourceFolder;
  const isQaSample = folder.sourceFolder.includes("QA Sample");
  const samples = isQaSample ? buildBrowserQaSampleFileNames() : ["invoice-042.pdf", "receipt coffee.jpg", "scan final.png"];

  return samples.map((fileName) => ({
    ruleId: folder.id,
    sourcePath: `${folder.sourceFolder.replace(/[\\/]$/, "")}/${fileName}`,
    targetPath: `${destinationFolder.replace(/[\\/]$/, "")}/${renderBrowserPattern(folder.action.pattern, fileName)}`,
    status: "ready" as const,
  }));
}

function buildBrowserQaSampleFileNames(): string[] {
  const extensions = ["pdf", "jpg", "png", "docx", "xlsx", "txt"];
  const groups = ["invoice", "receipt", "scan", "photo", "statement", "quote"];

  return Array.from({ length: 120 }, (_, index) => {
    const number = index + 1;
    const group = groups[index % groups.length] ?? "file";
    const extension = extensions[index % extensions.length] ?? "txt";
    const paddedNumber = String(number).padStart(3, "0");
    const separator = number % 5 === 0 ? " final " : number % 7 === 0 ? " copy " : " ";
    return `${group}${separator}${paddedNumber}.${extension}`;
  });
}

function formatStatus(status: PlannedFileAction["status"]): string {
  if (status === "needs-review") {
    return "Review";
  }

  return status.charAt(0).toUpperCase() + status.slice(1);
}

function shortRunId(runId: string): string {
  return runId.length > 16 ? `${runId.slice(0, 8)}...${runId.slice(-4)}` : runId;
}

function renderBrowserPattern(pattern: string, fileName: string): string {
  const extensionIndex = fileName.lastIndexOf(".");
  const originalBase = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const ext = extensionIndex > 0 ? fileName.slice(extensionIndex + 1) : "";

  return pattern
    .split("{date}")
    .join("2026-07-06")
    .split("{originalName}")
    .join(fileName)
    .split("{originalBase}")
    .join(originalBase)
    .split("{ext}")
    .join(ext)
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
