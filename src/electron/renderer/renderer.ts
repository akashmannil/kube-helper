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
interface KhBridge {
  dockerStatus(): Promise<IpcResult<{ reachable: boolean; hint?: string; engine?: string; os?: string; arch?: string }>>;
  listApps(): Promise<IpcResult<{ apps: AppView[] }>>;
  applyApp(manifest: unknown): Promise<IpcResult<unknown>>;
  deploySample(): Promise<IpcResult<{ port: number }>>;
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

function renderApps(apps: AppView[]): void {
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

function openNewApp(): void {
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

function syncSubfields(): void {
  $("web-fields").style.display = ($("f-web") as HTMLInputElement).checked ? "block" : "none";
  $("data-fields").style.display = ($("f-data") as HTMLInputElement).checked ? "block" : "none";
}

/** Translate the form into a kh manifest; the main process re-validates with zod. */
function manifestFromForm(): unknown {
  const name = ($("f-name") as HTMLInputElement).value.trim();
  const image = ($("f-image") as HTMLInputElement).value.trim();
  const replicas = Number(($("f-replicas") as HTMLInputElement).value);
  const web = ($("f-web") as HTMLInputElement).checked;
  const cport = Number(($("f-cport") as HTMLInputElement).value);
  const hport = Number(($("f-hport") as HTMLInputElement).value);

  const env: Record<string, string> = {};
  for (const row of document.querySelectorAll<HTMLElement>(".env-row")) {
    const key = (row.querySelector(".env-key") as HTMLInputElement).value.trim();
    const value = (row.querySelector(".env-val") as HTMLInputElement).value;
    if (key) env[key] = value;
  }

  const spec: Record<string, unknown> = { image, replicas, env };
  if (web) spec.ports = [{ container: cport, host: hport }];
  if (($("f-data") as HTMLInputElement).checked) {
    spec.volumes = [{ name: "data", mount: ($("f-mount") as HTMLInputElement).value.trim() }];
  }
  if (($("f-health") as HTMLInputElement).checked) {
    spec.healthcheck = {
      exec: ["wget", "-qO-", `http://127.0.0.1:${web ? cport : 80}/`],
      intervalSeconds: 5,
      startPeriodSeconds: 5,
    };
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
