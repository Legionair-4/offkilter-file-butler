import { MAX_WATCHED_FOLDERS, type FileButlerConfig, type ValidationError } from "./types.js";

const TOKEN_PATTERN = /\{[a-zA-Z][a-zA-Z0-9]*\}/g;
const SUPPORTED_TOKENS = new Set(["{originalName}", "{originalBase}", "{ext}", "{date}"]);

export function validateConfig(config: FileButlerConfig): ValidationError[] {
  const errors: ValidationError[] = [];

  if (config.version !== 1) {
    errors.push({ path: "version", message: "Config version must be 1." });
  }

  if (!Array.isArray(config.folders)) {
    errors.push({ path: "folders", message: "Folders must be an array." });
    return errors;
  }

  if (config.folders.length > MAX_WATCHED_FOLDERS) {
    errors.push({
      path: "folders",
      message: `File Butler supports a maximum of ${MAX_WATCHED_FOLDERS} watched folders.`,
    });
  }

  const ids = new Set<string>();

  config.folders.forEach((folder, index) => {
    const basePath = `folders[${index}]`;

    if (!folder.id.trim()) {
      errors.push({ path: `${basePath}.id`, message: "Folder rule id is required." });
    }

    if (ids.has(folder.id)) {
      errors.push({ path: `${basePath}.id`, message: "Folder rule id must be unique." });
    }
    ids.add(folder.id);

    if (!folder.name.trim()) {
      errors.push({ path: `${basePath}.name`, message: "Folder rule name is required." });
    }

    if (!folder.sourceFolder.trim()) {
      errors.push({ path: `${basePath}.sourceFolder`, message: "Source folder is required." });
    }

    if (folder.action.type !== "rename") {
      errors.push({ path: `${basePath}.action.type`, message: "Only rename actions are supported in the MVP." });
    }

    if (!folder.action.pattern.trim()) {
      errors.push({ path: `${basePath}.action.pattern`, message: "Rename pattern is required." });
    }

    for (const token of folder.action.pattern.match(TOKEN_PATTERN) ?? []) {
      if (!SUPPORTED_TOKENS.has(token)) {
        errors.push({
          path: `${basePath}.action.pattern`,
          message: `Unsupported rename token ${token}.`,
        });
      }
    }
  });

  return errors;
}
