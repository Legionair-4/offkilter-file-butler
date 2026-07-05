import type { FileButlerDesktopApi } from "../main/preload";

declare global {
  interface Window {
    fileButler: FileButlerDesktopApi;
  }
}

export {};
