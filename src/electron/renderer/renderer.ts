/**
 * The desktop UI. Runs sandboxed: everything it knows about Docker arrives
 * through the `window.kh` bridge (see ../preload.ts), and all wording is
 * aimed at people who have never used Docker or Kubernetes.
 */

interface ReplicaView {
  name: string;
  state: string;
  health: string | null;
  ready: boolean;
  status: string;
  ports: string[];
}
interface AppView {
  name: string;
  image: string;
  desired: number;
  ready: number;
  ports: string[];
  hostPorts: number[];
  replicas: ReplicaView[];
  spec?: unknown;
}
type IpcResult<T> = { ok: true; data: T } | { ok: false; error: string };
interface SpecView {
  image: string;
  replicas: number;
  command?: string[];
  env?: Record<string, string>;
  ports?: Array<{ container: number; host?: number; protocol?: string }>;
  volumes?: Array<{ name?: string; host?: string; mount: string; readOnly?: boolean }>;
  healthcheck?: unknown;
  restart?: string;
}
interface LogLine {
  replica: string;
  line: string;
  source: string;
}
interface KhBridge {
  dockerStatus(): Promise<IpcResult<{ reachable: boolean; hint?: string; engine?: string; os?: string; arch?: string }>>;
  listApps(): Promise<IpcResult<{ apps: AppView[] }>>;
  applyApp(manifest: unknown): Promise<IpcResult<unknown>>;
  deploySample(): Promise<IpcResult<{ port: number }>>;
  scaleApp(app: string, replicas: number): Promise<IpcResult<unknown>>;
  deleteApp(app: string): Promise<IpcResult<unknown>>;
  exposeApp(app: string, hostPort: number): Promise<IpcResult<unknown>>;
  fetchLogs(app: string, tail: number): Promise<IpcResult<LogLine[]>>;
  openUrl(url: string): Promise<IpcResult<void>>;
}
declare global {
  interface Window {
    kh: KhBridge;
  }
}

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
}

function showError(msg: string): void {
  const box = $("error-banner");
  box.textContent = msg;
  box.style.display = "block";
  setTimeout(() => {
    box.style.display = "none";
  }, 6000);
}

function stateClass(r: ReplicaView): string {
  if (r.ready) return "s-ready";
  return r.state === "running" ? "s-warn" : "s-down";
}

/** Plain-language line for an app's health, e.g. "2 of 2 copies running". */
function readyLabel(a: AppView): string {
  if (a.desired === 0) return "paused (0 copies)";
  return `${a.ready} of ${a.desired} ${a.desired === 1 ? "copy" : "copies"} running`;
}

/** Apps by name from the last refresh (edit/scale read from here). */
let lastApps: AppView[] = [];
/** Two-click delete: app name → time the first click armed it. */
const deleteArmedAt = new Map<string, number>();
const DELETE_ARM_MS = 4000;

function renderApps(apps: AppView[]): void {
  lastApps = apps;
  document.title = `kube-helper — ${apps.length} app(s)`;
  $("empty").style.display = apps.length ? "none" : "block";
  $("apps").innerHTML = apps
    .map(
      (a) => `
    <section class="card">
      <div class="app-head">
        <span class="app-name">${esc(a.name)}</span>
        <span class="badge ${a.ready >= a.desired && a.desired > 0 ? "ok" : "bad"}">${esc(readyLabel(a))}</span>
        <span class="meta mono" title="The app package this runs — like the installer it was made from">${esc(a.image)}</span>
        ${a.hostPorts
          .map(
            (p) =>
              `<a class="local-link mono" href="#" data-open="http://localhost:${p}" title="This app is reachable in your browser here">localhost:${p}</a>`
          )
          .join(" ")}
        <span class="actions" style="margin-left:auto;display:flex;gap:6px;flex-wrap:wrap">
          <button data-action="scale-down" data-app="${esc(a.name)}" title="Run one fewer copy" ${a.desired <= 0 ? "disabled" : ""}>−</button>
          <button data-action="scale-up" data-app="${esc(a.name)}" title="Run one more copy — added with no downtime" ${a.desired >= 100 ? "disabled" : ""}>+</button>
          <button data-action="logs" data-app="${esc(a.name)}" title="See what the app prints — first place to look when something misbehaves">Logs</button>
          <button data-action="edit" data-app="${esc(a.name)}" title="Change the package, settings or ports — changes roll out one copy at a time">Edit</button>
          <button data-action="share" data-app="${esc(a.name)}" title="One stable address that spreads visitors across all copies">Share…</button>
          <button data-action="delete" data-app="${esc(a.name)}" class="danger">${
            Date.now() - (deleteArmedAt.get(a.name) ?? 0) < DELETE_ARM_MS ? "Sure? click again" : "Delete"
          }</button>
        </span>
      </div>
      ${
        a.replicas.length
          ? `<table>
        <tr>
          <th title="Each copy of the app runs separately; if one crashes the others keep serving">copy</th>
          <th>state</th><th>details</th><th>reachable at</th>
        </tr>
        ${a.replicas
          .map(
            (r) => `
          <tr>
            <td class="mono">${esc(r.name)}</td>
            <td class="${stateClass(r)}">${esc(r.state)}${r.health ? ` (${esc(r.health)})` : ""}</td>
            <td class="meta">${esc(r.status)}</td>
            <td class="mono">${r.ports.map(esc).join(", ") || "—"}</td>
          </tr>`
          )
          .join("")}
      </table>`
          : `<p class="hint" style="margin-top:8px">Paused — no copies are running right now.</p>`
      }
    </section>`
    )
    .join("");

  for (const link of document.querySelectorAll<HTMLAnchorElement>("a[data-open]")) {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      void window.kh.openUrl(link.dataset.open ?? "");
    });
  }
  for (const btn of document.querySelectorAll<HTMLButtonElement>("[data-action]")) {
    btn.addEventListener("click", () => void onAction(btn));
  }
}

async function onAction(btn: HTMLButtonElement): Promise<void> {
  const app = btn.dataset.app ?? "";
  const view = lastApps.find((a) => a.name === app);
  if (!view) return;

  switch (btn.dataset.action) {
    case "scale-up":
    case "scale-down": {
      const delta = btn.dataset.action === "scale-up" ? 1 : -1;
      btn.disabled = true;
      const res = await window.kh.scaleApp(app, Math.max(0, Math.min(100, view.desired + delta)));
      if (!res.ok) showError(res.error);
      await tick();
      return;
    }
    case "delete": {
      const armedAt = deleteArmedAt.get(app) ?? 0;
      if (Date.now() - armedAt >= DELETE_ARM_MS) {
        deleteArmedAt.set(app, Date.now());
        btn.textContent = "Sure? click again";
        return;
      }
      deleteArmedAt.delete(app);
      btn.disabled = true;
      const res = await window.kh.deleteApp(app);
      if (!res.ok) showError(res.error);
      await tick();
      return;
    }
    case "logs":
      openLogs(app);
      return;
    case "edit":
      openEdit(view);
      return;
    case "share":
      openShare(view);
      return;
  }
}

async function refreshStatus(): Promise<boolean> {
  const res = await window.kh.dockerStatus();
  const pill = $("docker-pill");
  const down = $("docker-down");
  if (!res.ok) {
    showError(res.error);
    return false;
  }
  if (!res.data.reachable) {
    pill.className = "pill bad";
    pill.textContent = "Docker: not running";
    $("engine-line").textContent = "";
    down.style.display = "block";
    $("apps").innerHTML = "";
    $("empty").style.display = "none";
    return false;
  }
  pill.className = "pill ok";
  pill.textContent = "Docker: running";
  $("engine-line").textContent = `engine ${res.data.engine} · ${res.data.os}/${res.data.arch}`;
  down.style.display = "none";
  return true;
}

async function tick(): Promise<void> {
  try {
    if (!(await refreshStatus())) return;
    const res = await window.kh.listApps();
    if (!res.ok) return showError(res.error);
    renderApps(res.data.apps);
  } catch (err) {
    showError(String(err));
  }
}

// ---------- New app wizard ----------

const dialog = $("new-app") as unknown as HTMLDialogElement;

function addEnvRow(key = "", value = ""): void {
  const row = document.createElement("div");
  row.className = "env-row";
  row.innerHTML = `
    <input type="text" class="env-key" placeholder="NAME" spellcheck="false">
    <input type="text" class="env-val" placeholder="value" spellcheck="false">
    <button type="button" title="remove this setting">×</button>`;
  (row.querySelector(".env-key") as HTMLInputElement).value = key;
  (row.querySelector(".env-val") as HTMLInputElement).value = value;
  (row.querySelector("button") as HTMLButtonElement).addEventListener("click", () => row.remove());
  $("env-rows").appendChild(row);
}

function showFormError(msg: string): void {
  const box = $("form-error");
  box.textContent = msg;
  box.style.display = "block";
}

/**
 * Edit mode: the form only *overrides* what it can show; anything the app was
 * deployed with that the form doesn't cover (extra ports, bind mounts, custom
 * commands or probes) is carried over untouched from the deployed spec, so a
 * GUI edit can never silently strip a CLI-made configuration.
 */
let editing: { name: string; base: SpecView; dataVolName: string } | null = null;

function openNewApp(): void {
  editing = null;
  $("dialog-title").textContent = "New app";
  ($("f-name") as HTMLInputElement).disabled = false;
  $("new-app-submit").textContent = "Deploy";
  ($("form-error") as HTMLElement).style.display = "none";
  ($("f-name") as HTMLInputElement).value = "";
  ($("f-image") as HTMLInputElement).value = "";
  ($("f-replicas") as HTMLInputElement).value = "1";
  ($("f-web") as HTMLInputElement).checked = true;
  ($("f-hport") as HTMLInputElement).value = "8080";
  ($("f-cport") as HTMLInputElement).value = "80";
  ($("f-data") as HTMLInputElement).checked = false;
  ($("f-mount") as HTMLInputElement).value = "/data";
  ($("f-health") as HTMLInputElement).checked = false;
  $("env-rows").innerHTML = "";
  syncSubfields();
  dialog.showModal();
}

function openEdit(view: AppView): void {
  const base = (view.spec ?? { image: view.image, replicas: view.desired }) as SpecView;
  const dataVol = (base.volumes ?? []).find((v) => v.name !== undefined);
  editing = { name: view.name, base, dataVolName: dataVol?.name ?? "data" };

  $("dialog-title").textContent = `Edit ${view.name}`;
  $("new-app-submit").textContent = "Apply changes";
  ($("form-error") as HTMLElement).style.display = "none";
  const nameInput = $("f-name") as HTMLInputElement;
  nameInput.value = view.name;
  nameInput.disabled = true;
  ($("f-image") as HTMLInputElement).value = base.image;
  ($("f-replicas") as HTMLInputElement).value = String(base.replicas ?? view.desired);
  const firstPort = base.ports?.[0];
  ($("f-web") as HTMLInputElement).checked = firstPort !== undefined;
  ($("f-hport") as HTMLInputElement).value = String(firstPort?.host ?? 8080);
  ($("f-cport") as HTMLInputElement).value = String(firstPort?.container ?? 80);
  ($("f-data") as HTMLInputElement).checked = dataVol !== undefined;
  ($("f-mount") as HTMLInputElement).value = dataVol?.mount ?? "/data";
  ($("f-health") as HTMLInputElement).checked = base.healthcheck !== undefined;
  $("env-rows").innerHTML = "";
  for (const [key, value] of Object.entries(base.env ?? {})) addEnvRow(key, value);
  syncSubfields();
  dialog.showModal();
}

function syncSubfields(): void {
  $("web-fields").style.display = ($("f-web") as HTMLInputElement).checked ? "block" : "none";
  $("data-fields").style.display = ($("f-data") as HTMLInputElement).checked ? "block" : "none";
}

/** Translate the form into a kh manifest; the main process re-validates with zod. */
function manifestFromForm(): unknown {
  const name = editing?.name ?? ($("f-name") as HTMLInputElement).value.trim();
  const image = ($("f-image") as HTMLInputElement).value.trim();
  const replicas = Number(($("f-replicas") as HTMLInputElement).value);
  const web = ($("f-web") as HTMLInputElement).checked;
  const cport = Number(($("f-cport") as HTMLInputElement).value);
  const hport = Number(($("f-hport") as HTMLInputElement).value);
  const keepData = ($("f-data") as HTMLInputElement).checked;
  const health = ($("f-health") as HTMLInputElement).checked;

  const env: Record<string, string> = {};
  for (const row of document.querySelectorAll<HTMLElement>(".env-row")) {
    const key = (row.querySelector(".env-key") as HTMLInputElement).value.trim();
    const value = (row.querySelector(".env-val") as HTMLInputElement).value;
    if (key) env[key] = value;
  }

  // Start from the deployed spec when editing so unrepresented fields survive.
  const base: SpecView | undefined = editing ? structuredClone(editing.base) : undefined;
  const spec: Record<string, unknown> = { ...(base ?? {}), image, replicas, env };

  const restPorts = (base?.ports ?? []).slice(1);
  if (web) spec.ports = [{ container: cport, host: hport }, ...restPorts];
  else spec.ports = [];

  const dataVolName = editing?.dataVolName ?? "data";
  const otherVolumes = (base?.volumes ?? []).filter((v) => v.name !== dataVolName);
  spec.volumes = keepData
    ? [...otherVolumes, { name: dataVolName, mount: ($("f-mount") as HTMLInputElement).value.trim() }]
    : otherVolumes;

  if (health) {
    // Keep an existing custom probe; only synthesize one when there is none.
    spec.healthcheck = base?.healthcheck ?? {
      exec: ["wget", "-qO-", `http://127.0.0.1:${web ? cport : 80}/`],
      intervalSeconds: 5,
      startPeriodSeconds: 5,
    };
  } else {
    delete spec.healthcheck;
  }

  return { apiVersion: "kh/v1", kind: "App", metadata: { name }, spec };
}

async function submitNewApp(): Promise<void> {
  const submit = $("new-app-submit") as HTMLButtonElement;
  submit.disabled = true;
  submit.textContent = "Deploying… (first time may download the app)";
  try {
    const res = await window.kh.applyApp(manifestFromForm());
    if (!res.ok) {
      showFormError(res.error);
      return;
    }
    dialog.close();
    await tick();
  } finally {
    submit.disabled = false;
    submit.textContent = "Deploy";
  }
}

async function deploySample(): Promise<void> {
  const btn = $("btn-sample") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Deploying sample…";
  try {
    const res = await window.kh.deploySample();
    if (!res.ok) return showError(res.error);
    await tick();
  } finally {
    btn.disabled = false;
    btn.textContent = "Run sample app";
  }
}

// ---------- Logs viewer ----------

const logsDialog = $("logs-dialog") as unknown as HTMLDialogElement;
let logsApp = "";
let logsTimer: ReturnType<typeof setInterval> | undefined;

async function loadLogs(): Promise<void> {
  const res = await window.kh.fetchLogs(logsApp, 300);
  if (!res.ok) return showError(res.error);
  const pre = $("logs-pre");
  pre.innerHTML = res.data
    .map(
      (l) =>
        `<span style="color:var(--dim)">[${esc(l.replica)}]</span> <span${
          l.source === "stderr" ? ' style="color:var(--red)"' : ""
        }>${esc(l.line)}</span>`
    )
    .join("\n");
  pre.scrollTop = pre.scrollHeight;
}

function openLogs(app: string): void {
  logsApp = app;
  $("logs-title").textContent = `Logs — ${app}`;
  $("logs-pre").textContent = "loading…";
  logsDialog.showModal();
  void loadLogs();
  clearInterval(logsTimer);
  logsTimer = setInterval(() => {
    if (($("logs-follow") as HTMLInputElement).checked) void loadLogs();
  }, 3000);
}

$("logs-close").addEventListener("click", () => {
  clearInterval(logsTimer);
  logsDialog.close();
});

// ---------- Share (load balancer) ----------

const shareDialog = $("share-dialog") as unknown as HTMLDialogElement;
let shareApp = "";

function openShare(view: AppView): void {
  shareApp = view.name;
  $("share-app").textContent = view.name;
  ($("share-error") as HTMLElement).style.display = "none";
  shareDialog.showModal();
}

async function submitShare(): Promise<void> {
  const btn = $("share-submit") as HTMLButtonElement;
  btn.disabled = true;
  try {
    const port = Number(($("share-port") as HTMLInputElement).value);
    const res = await window.kh.exposeApp(shareApp, port);
    if (!res.ok) {
      const box = $("share-error");
      box.textContent = res.error;
      box.style.display = "block";
      return;
    }
    shareDialog.close();
    await tick();
  } finally {
    btn.disabled = false;
  }
}

$("share-cancel").addEventListener("click", () => shareDialog.close());
$("share-submit").addEventListener("click", () => void submitShare());

$("btn-new").addEventListener("click", openNewApp);
$("btn-sample").addEventListener("click", () => void deploySample());
$("new-app-cancel").addEventListener("click", () => dialog.close());
$("new-app-submit").addEventListener("click", () => void submitNewApp());
$("btn-add-env").addEventListener("click", () => addEnvRow());
$("f-web").addEventListener("change", syncSubfields);
$("f-data").addEventListener("change", syncSubfields);
$("retry-docker").addEventListener("click", () => void tick());

void tick();
setInterval(() => void tick(), 2500);

export {};
