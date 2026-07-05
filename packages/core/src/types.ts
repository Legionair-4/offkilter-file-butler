export const MAX_WATCHED_FOLDERS = 3;

export type ConflictStrategy = "append-counter" | "needs-review" | "skip";

export interface FileButlerConfig {
  version: 1;
  folders: FolderRule[];
}

export interface FolderRule {
  id: string;
  name: string;
  enabled: boolean;
  sourceFolder: string;
  destinationFolder?: string;
  action: RenameAction;
  conflictStrategy: ConflictStrategy;
}

export interface RenameAction {
  type: "rename";
  pattern: string;
}

export interface SourceFile {
  absolutePath: string;
  fileName: string;
  modifiedAt?: Date;
}

export interface ScanOptions {
  includeExtensions?: string[];
}

export interface ScanResult {
  filesByRuleId: Map<string, SourceFile[]>;
  errors: ValidationError[];
}

export interface PlanOptions {
  now?: Date;
  existingTargetPaths?: ReadonlySet<string>;
}

export type PlannedActionStatus = "ready" | "conflict" | "needs-review" | "skipped";

export interface PlannedFileAction {
  ruleId: string;
  sourcePath: string;
  targetPath: string;
  status: PlannedActionStatus;
  reason?: string;
}

export interface PlanResult {
  dryRun: true;
  actions: PlannedFileAction[];
  errors: ValidationError[];
}

export interface PreviewOptions extends ScanOptions, PlanOptions {}

export interface PreviewResult extends PlanResult {
  scannedFileCount: number;
}

export interface ApplyOptions {
  logDirectory: string;
  runId?: string;
  now?: Date;
}

export type AppliedActionStatus = "applied" | "failed" | "skipped";

export interface AppliedFileAction {
  ruleId: string;
  sourcePath: string;
  targetPath: string;
  status: AppliedActionStatus;
  reason?: string;
}

export interface ApplyRun {
  runId: string;
  createdAt: string;
  actions: AppliedFileAction[];
}

export interface UndoOptions {
  logDirectory: string;
  runId: string;
  now?: Date;
}

export type UndoActionStatus = "undone" | "failed" | "skipped";

export interface UndoFileAction {
  ruleId: string;
  sourcePath: string;
  targetPath: string;
  status: UndoActionStatus;
  reason?: string;
}

export interface UndoRun {
  runId: string;
  undoneAt: string;
  actions: UndoFileAction[];
}

export interface ValidationError {
  path: string;
  message: string;
}
