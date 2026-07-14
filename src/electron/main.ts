// Default-import + destructure: the electron package is CJS whose named
// exports aren't statically detectable from an ESM main on all versions.
import electron from "electron";
import { dirname, join } from "node:path";

const { app, BrowserWindow, ipcMain, shell } = electron;
import { fileURLToPath } from "node:url";
import { createDockerClient, daemonStartHint } from "../docker/client.js";
import { appsOverview, engineOverview } from "../engine/view.js";

const here = dirname(fileURLToPath(import.meta.url));
const docker = createDockerClient();

/**
 * Every IPC handler resolves to this envelope instead of throwing: rejected
 * `invoke` promises reach the renderer as mangled strings, while a typed
 * envelope keeps error text human-readable for the UI.
 */
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function guard<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export type DockerStatus =
  | { reachable: false; hint: string }
  | ({ reachable: true } & Awaited<ReturnType<typeof engineOverview>>);

function registerIpc(): void {
  ipcMain.handle("docker:status", () =>
    guard<DockerStatus>(async () => {
      try {
        await docker.ping();
      } catch {
        return { reachable: false, hint: daemonStartHint() };
      }
      return { reachable: true, ...(await engineOverview(docker)) };
    })
  );

  ipcMain.handle("apps:list", () => guard(() => appsOverview(docker)));

  // Links in the UI (e.g. "open in browser") go to the system browser.
  ipcMain.handle("shell:open", (_event, url: string) =>
    guard(async () => {
      if (!/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) {
        throw new Error("only local URLs can be opened");
      }
      await shell.openExternal(url);
    })
  );
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1120,
    height: 780,
    minWidth: 760,
    minHeight: 520,
    backgroundColor: "#0b0f14",
    title: "kube-helper",
    webPreferences: {
      preload: join(here, "preload.cjs"),
    },
  });
  win.removeMenu();
  void win.loadFile(join(here, "index.html"));
}

void app.whenReady().then(() => {
  registerIpc();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => app.quit());
