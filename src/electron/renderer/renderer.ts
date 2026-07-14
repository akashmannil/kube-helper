/**
 * The desktop UI. Runs sandboxed: everything it knows about Docker arrives
 * through the `window.kh` bridge (see ../preload.ts). Two modes:
 *   - "easy" (default): plain language, advanced options hidden.
 *   - "dev": real Docker/Kubernetes terms and every option exposed.
 * Static markup carries both wordings (.easy-only/.dev-only, toggled by CSS on
 * body[data-mode]); this file switches the mode and re-renders dynamic cards.
 */

type Mode = "easy" | "dev";
let mode: Mode = localStorage.getItem("kh-mode") === "dev" ? "dev" : "easy";
const isDev = (): boolean => mode === "dev";

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

/** Health line, worded for the current mode. */
function readyLabel(a: AppView): string {
  if (isDev()) return `${a.ready}/${a.desired} ready`;
  if (a.desired === 0) return "paused (0 copies)";
  return `${a.ready} of ${a.desired} ${a.desired === 1 ? "copy" : "copies"} running`;
}

/** Word for one replica, per mode. */
const unit = (plural: boolean): string => (isDev() ? (plural ? "replicas" : "replica") : plural ? "copies" : "copy");

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
          <button data-action="scale-down" data-app="${esc(a.name)}" title="Run one fewer ${unit(false)}" ${a.desired <= 0 ? "disabled" : ""}>−</button>
          <button data-action="scale-up" data-app="${esc(a.name)}" title="Run one more ${unit(false)} — added with no downtime" ${a.desired >= 100 ? "disabled" : ""}>+</button>
          <button data-action="logs" data-app="${esc(a.name)}" title="See what the app prints — first place to look when something misbehaves">Logs</button>
          <button data-action="edit" data-app="${esc(a.name)}" title="Change the ${isDev() ? "spec" : "package, settings or ports"} — rolling update, one ${unit(false)} at a time">Edit</button>
          <button data-action="manifest" data-app="${esc(a.name)}" class="dev-only" title="View the kh/v1 manifest and the CLI to deploy it">Manifest</button>
          <button data-action="share" data-app="${esc(a.name)}" title="One stable address that load-balances across all ${unit(true)}">Share…</button>
          <button data-action="delete" data-app="${esc(a.name)}" class="danger">${
            Date.now() - (deleteArmedAt.get(a.name) ?? 0) < DELETE_ARM_MS ? "Sure? click again" : "Delete"
          }</button>
        </span>
      </div>
      ${
        a.replicas.length
          ? `<table>
        <tr>
          <th title="Each ${unit(false)} runs separately; if one crashes the others keep serving">${isDev() ? "replica" : "copy"}</th>
          <th>state</th><th>${isDev() ? "status" : "details"}</th><th>${isDev() ? "ports" : "reachable at"}</th>
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
          : `<p class="hint" style="margin-top:8px">${isDev() ? "Scaled to 0 replicas." : "Paused — no copies are running right now."}</p>`
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
    case "manifest":
      openManifest(view.name, {
        apiVersion: "kh/v1",
        kind: "App",
        metadata: { name: view.name },
        spec: view.spec ?? { image: view.image, replicas: view.desired },
      });
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
let editing: { name: string; base: SpecView } | null = null;

const val = (id: string): string => ($(id) as HTMLInputElement | HTMLSelectElement).value;
const setVal = (id: string, v: string): void => {
  ($(id) as HTMLInputElement | HTMLSelectElement).value = v;
};
const checked = (id: string): boolean => ($(id) as HTMLInputElement).checked;
const setChecked = (id: string, v: boolean): void => {
  ($(id) as HTMLInputElement).checked = v;
};

/** Split a shell-style command string into argv, respecting single/double quotes. */
function parseArgv(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

function openNewApp(): void {
  editing = null;
  $("dialog-title").textContent = "New app";
  ($("f-name") as HTMLInputElement).disabled = false;
  $("new-app-submit").textContent = "Deploy";
  ($("form-error") as HTMLElement).style.display = "none";
  setVal("f-name", "");
  setVal("f-image", "");
  setVal("f-replicas", "1");
  setVal("f-command", "");
  setChecked("f-web", true);
  setVal("f-hport", "8080");
  setVal("f-cport", "80");
  setVal("f-proto", "tcp");
  setChecked("f-data", false);
  setVal("f-voltype", "managed");
  setVal("f-volhost", "");
  setVal("f-mount", "/data");
  setChecked("f-volro", false);
  setChecked("f-health", false);
  setVal("f-hcmode", "auto");
  setVal("f-hcshell", "");
  setVal("f-hcinterval", "5");
  setVal("f-hcstart", "5");
  setVal("f-hcretries", "3");
  setVal("f-restart", "always");
  $("env-rows").innerHTML = "";
  syncSubfields();
  dialog.showModal();
}

function openEdit(view: AppView): void {
  const base = (view.spec ?? { image: view.image, replicas: view.desired }) as SpecView;
  editing = { name: view.name, base };

  $("dialog-title").textContent = `Edit ${view.name}`;
  $("new-app-submit").textContent = "Apply changes";
  ($("form-error") as HTMLElement).style.display = "none";
  const nameInput = $("f-name") as HTMLInputElement;
  nameInput.value = view.name;
  nameInput.disabled = true;
  setVal("f-image", base.image);
  setVal("f-replicas", String(base.replicas ?? view.desired));
  setVal("f-command", (base.command ?? []).join(" "));

  const firstPort = base.ports?.[0];
  setChecked("f-web", firstPort !== undefined);
  setVal("f-hport", String(firstPort?.host ?? 8080));
  setVal("f-cport", String(firstPort?.container ?? 80));
  setVal("f-proto", firstPort?.protocol ?? "tcp");

  const vol = base.volumes?.[0];
  setChecked("f-data", vol !== undefined);
  setVal("f-voltype", vol?.host !== undefined ? "bind" : "managed");
  setVal("f-volhost", vol?.host ?? "");
  setVal("f-mount", vol?.mount ?? "/data");
  setChecked("f-volro", vol?.readOnly ?? false);

  const hc = base.healthcheck as { shell?: string; intervalSeconds?: number; startPeriodSeconds?: number; retries?: number } | undefined;
  setChecked("f-health", hc !== undefined);
  setVal("f-hcmode", hc?.shell !== undefined ? "shell" : "auto");
  setVal("f-hcshell", hc?.shell ?? "");
  setVal("f-hcinterval", String(hc?.intervalSeconds ?? 5));
  setVal("f-hcstart", String(hc?.startPeriodSeconds ?? 5));
  setVal("f-hcretries", String(hc?.retries ?? 3));
  setVal("f-restart", base.restart ?? "always");

  $("env-rows").innerHTML = "";
  for (const [key, value] of Object.entries(base.env ?? {})) addEnvRow(key, value);
  syncSubfields();
  dialog.showModal();
}

function syncSubfields(): void {
  $("web-fields").style.display = checked("f-web") ? "block" : "none";
  $("data-fields").style.display = checked("f-data") ? "block" : "none";
  $("health-fields").style.display = checked("f-health") ? "block" : "none";
  $("bind-host-field").style.display = val("f-voltype") === "bind" ? "block" : "none";
  $("hc-shell-field").style.display = val("f-hcmode") === "shell" ? "block" : "none";
}

/**
 * Translate the form into a kh manifest; the main process re-validates with
 * the same zod schema as `kh validate`. Advanced fields are read only in
 * Developer mode — in Easy mode they keep the deployed spec's values (on edit)
 * or the schema defaults (on new), so Easy mode hides options without wiping
 * anything a Developer-mode or CLI user configured.
 */
function manifestFromForm(): unknown {
  const dev = isDev();
  const name = editing?.name ?? val("f-name").trim();
  const image = val("f-image").trim();
  const replicas = Number(val("f-replicas"));
  const web = checked("f-web");
  const cport = Number(val("f-cport"));
  const hport = Number(val("f-hport"));
  const keepData = checked("f-data");
  const health = checked("f-health");

  const env: Record<string, string> = {};
  for (const row of document.querySelectorAll<HTMLElement>(".env-row")) {
    const key = (row.querySelector(".env-key") as HTMLInputElement).value.trim();
    const value = (row.querySelector(".env-val") as HTMLInputElement).value;
    if (key) env[key] = value;
  }

  // Start from the deployed spec when editing so unrepresented fields survive.
  const base: SpecView | undefined = editing ? structuredClone(editing.base) : undefined;
  const spec: Record<string, unknown> = { ...(base ?? {}), image, replicas, env };

  if (dev) {
    const argv = parseArgv(val("f-command").trim());
    if (argv.length) spec.command = argv;
    else delete spec.command;
  }

  const proto = dev ? val("f-proto") : base?.ports?.[0]?.protocol ?? "tcp";
  const restPorts = (base?.ports ?? []).slice(1);
  spec.ports = web ? [{ container: cport, host: hport, protocol: proto }, ...restPorts] : [];

  const restVolumes = (base?.volumes ?? []).slice(1);
  if (keepData) {
    const mount = val("f-mount").trim();
    const type = dev ? val("f-voltype") : base?.volumes?.[0]?.host !== undefined ? "bind" : "managed";
    const readOnly = dev ? checked("f-volro") : base?.volumes?.[0]?.readOnly ?? false;
    const first =
      type === "bind"
        ? { host: val("f-volhost").trim(), mount, readOnly }
        : { name: base?.volumes?.[0]?.name ?? "data", mount, readOnly };
    spec.volumes = [first, ...restVolumes];
  } else {
    spec.volumes = restVolumes;
  }

  if (health) {
    if (dev) {
      const common = {
        intervalSeconds: Number(val("f-hcinterval")),
        startPeriodSeconds: Number(val("f-hcstart")),
        retries: Number(val("f-hcretries")),
      };
      spec.healthcheck =
        val("f-hcmode") === "shell"
          ? { shell: val("f-hcshell"), ...common }
          : { exec: ["wget", "-qO-", `http://127.0.0.1:${web ? cport : 80}/`], ...common };
    } else {
      // Keep an existing custom probe; only synthesize one when there is none.
      spec.healthcheck = base?.healthcheck ?? {
        exec: ["wget", "-qO-", `http://127.0.0.1:${web ? cport : 80}/`],
        intervalSeconds: 5,
        startPeriodSeconds: 5,
      };
    }
  } else {
    delete spec.healthcheck;
  }

  if (dev) spec.restart = val("f-restart");

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

// ---------- Manifest preview (developer mode) ----------

const manifestDialog = $("manifest-dialog") as unknown as HTMLDialogElement;

/** Minimal YAML for a plain object/array/scalar tree — enough for kh manifests. */
function toYaml(value: unknown, indent = 0): string {
  const pad = "  ".repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return " []\n";
    return (
      "\n" +
      value
        .map((item) => {
          if (item !== null && typeof item === "object") {
            // "- " then the object's fields, first inline with the dash.
            const body = toYaml(item, indent + 1).replace(/^\s*\n/, "");
            const lines = body.split("\n").filter((l) => l.length);
            return `${pad}- ${lines[0]?.trim() ?? ""}\n${lines.slice(1).map((l) => `${pad}  ${l.trim()}`).join("\n")}`.replace(/\n$/, "");
          }
          return `${pad}- ${scalar(item)}`;
        })
        .join("\n") +
      "\n"
    );
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return " {}\n";
    return (
      (indent ? "\n" : "") +
      entries
        .map(([k, v]) => {
          if (v !== null && typeof v === "object") return `${pad}${k}:${toYaml(v, indent + 1).replace(/\n$/, "")}`;
          return `${pad}${k}: ${scalar(v)}`;
        })
        .join("\n") +
      "\n"
    );
  }
  return `${scalar(value)}\n`;
}
function scalar(v: unknown): string {
  if (typeof v === "string" && (v === "" || /[:#{}\[\],&*?|<>=!%@`"']/.test(v) || /^\s|\s$/.test(v))) {
    return JSON.stringify(v);
  }
  return String(v);
}

function openManifest(name: string, manifest: unknown): void {
  $("manifest-title").textContent = `Manifest — ${name}`;
  $("manifest-pre").textContent = toYaml(manifest).trimEnd();
  manifestDialog.showModal();
}

$("manifest-close").addEventListener("click", () => manifestDialog.close());
$("manifest-copy").addEventListener("click", () => {
  void navigator.clipboard.writeText($("manifest-pre").textContent ?? "");
  const btn = $("manifest-copy");
  btn.textContent = "Copied";
  setTimeout(() => (btn.textContent = "Copy"), 1500);
});
$("btn-preview").addEventListener("click", () => {
  try {
    openManifest(editing?.name ?? (val("f-name").trim() || "app"), manifestFromForm());
  } catch (err) {
    showFormError(String(err));
  }
});

// ---------- Easy / Developer mode ----------

function applyMode(): void {
  document.body.dataset.mode = mode;
  for (const btn of document.querySelectorAll<HTMLButtonElement>("#mode-toggle button")) {
    btn.classList.toggle("active", btn.dataset.mode === mode);
  }
  // Re-render cards so their dynamic wording follows the mode immediately.
  renderApps(lastApps);
}

for (const btn of document.querySelectorAll<HTMLButtonElement>("#mode-toggle button")) {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode === "dev" ? "dev" : "easy";
    localStorage.setItem("kh-mode", mode);
    applyMode();
  });
}

$("btn-new").addEventListener("click", openNewApp);
$("btn-sample").addEventListener("click", () => void deploySample());
$("new-app-cancel").addEventListener("click", () => dialog.close());
$("new-app-submit").addEventListener("click", () => void submitNewApp());
$("btn-add-env").addEventListener("click", () => addEnvRow());
$("f-web").addEventListener("change", syncSubfields);
$("f-data").addEventListener("change", syncSubfields);
$("f-voltype").addEventListener("change", syncSubfields);
$("f-hcmode").addEventListener("change", syncSubfields);
$("f-health").addEventListener("change", syncSubfields);
$("retry-docker").addEventListener("click", () => void tick());

applyMode();
void tick();
setInterval(() => void tick(), 2500);

export {};
