import { contextBridge, ipcRenderer } from "electron";

/**
 * The entire surface the UI may touch. The renderer runs sandboxed with
 * context isolation; it never sees Node, Docker or the filesystem — only
 * these whitelisted calls, each handled (and validated) in the main process.
 */
const api = {
  dockerStatus: () => ipcRenderer.invoke("docker:status"),
  listApps: () => ipcRenderer.invoke("apps:list"),
  openUrl: (url: string) => ipcRenderer.invoke("shell:open", url),
};

export type KhBridge = typeof api;

contextBridge.exposeInMainWorld("kh", api);
