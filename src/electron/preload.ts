import { contextBridge, ipcRenderer } from "electron";

/**
 * The entire surface the UI may touch. The renderer runs sandboxed with
 * context isolation; it never sees Node, Docker or the filesystem — only
 * these whitelisted calls, each handled (and validated) in the main process.
 */
const api = {
  dockerStatus: () => ipcRenderer.invoke("docker:status"),
  listApps: () => ipcRenderer.invoke("apps:list"),
  applyApp: (manifest: unknown) => ipcRenderer.invoke("apps:apply", manifest),
  deploySample: () => ipcRenderer.invoke("apps:sample"),
  scaleApp: (app: string, replicas: number) => ipcRenderer.invoke("apps:scale", app, replicas),
  deleteApp: (app: string) => ipcRenderer.invoke("apps:delete", app),
  exposeApp: (app: string, hostPort: number) => ipcRenderer.invoke("apps:expose", app, hostPort),
  fetchLogs: (app: string, tail: number) => ipcRenderer.invoke("apps:logs", app, tail),
  openUrl: (url: string) => ipcRenderer.invoke("shell:open", url),
  openWindow: (view: string, app: string) => ipcRenderer.invoke("window:open", view, app),
};

export type KhBridge = typeof api;

contextBridge.exposeInMainWorld("kh", api);
