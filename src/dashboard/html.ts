/**
 * The dashboard page: one self-contained HTML string (inline CSS + JS, no
 * external assets, no framework). It polls /api/apps and /api/info every 2 s.
 */
export function dashboardHtml(): string {
  return /* html */ `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>kube-helper</title>
<style>
  :root {
    --bg: #0b0f14; --panel: #121820; --line: #1f2937; --text: #d7dde5;
    --dim: #7b8794; --green: #34d399; --yellow: #fbbf24; --red: #f87171;
    --accent: #38bdf8;
  }
  * { box-sizing: border-box; margin: 0; }
  body { background: var(--bg); color: var(--text); font: 14px/1.5 ui-monospace, "Cascadia Mono", Consolas, monospace; padding: 24px; }
  header { display: flex; align-items: baseline; gap: 16px; margin-bottom: 20px; flex-wrap: wrap; }
  h1 { font-size: 20px; letter-spacing: .5px; }
  h1 span { color: var(--accent); }
  #engine, #updated { color: var(--dim); font-size: 12px; }
  #error { display: none; background: #7f1d1d; color: #fecaca; padding: 8px 12px; border-radius: 6px; margin-bottom: 16px; }
  .app { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 14px 16px; margin-bottom: 14px; }
  .app-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  .app-name { font-size: 16px; font-weight: 700; }
  .badge { padding: 1px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; }
  .badge.ok { background: rgba(52,211,153,.15); color: var(--green); }
  .badge.bad { background: rgba(248,113,113,.15); color: var(--red); }
  .meta { color: var(--dim); font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th { text-align: left; color: var(--dim); font-weight: 400; font-size: 12px; padding: 4px 10px 4px 0; border-bottom: 1px solid var(--line); }
  td { padding: 5px 10px 5px 0; border-bottom: 1px solid var(--line); font-size: 13px; }
  tr:last-child td { border-bottom: none; }
  .s-ready { color: var(--green); } .s-warn { color: var(--yellow); } .s-down { color: var(--red); }
  #empty { color: var(--dim); padding: 40px 0; text-align: center; }
</style>
</head>
<body>
<header>
  <h1><span>kh</span> kube-helper</h1>
  <div id="engine">connecting…</div>
  <div id="updated"></div>
</header>
<div id="error"></div>
<main id="apps"></main>
<div id="empty" style="display:none">No kh apps on this machine. Deploy one with: kh apply -f app.yaml</div>
<script>
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));

function stateClass(r) {
  if (r.ready) return "s-ready";
  if (r.state === "running") return "s-warn";
  return "s-down";
}

function render(data) {
  const root = document.getElementById("apps");
  document.getElementById("empty").style.display = data.apps.length ? "none" : "block";
  root.innerHTML = data.apps.map((a) => \`
    <section class="app">
      <div class="app-head">
        <span class="app-name">\${esc(a.name)}</span>
        <span class="badge \${a.ready >= a.desired && a.desired > 0 ? "ok" : "bad"}">\${a.ready}/\${a.desired} ready</span>
        <span class="meta">\${esc(a.image)}</span>
        <span class="meta">\${a.ports.map(esc).join(", ")}</span>
      </div>
      \${a.replicas.length ? \`
      <table>
        <tr><th>replica</th><th>state</th><th>status</th><th>ports</th></tr>
        \${a.replicas.map((r) => \`
          <tr>
            <td>\${esc(r.name)}</td>
            <td class="\${stateClass(r)}">\${esc(r.state)}\${r.health ? " (" + esc(r.health) + ")" : ""}</td>
            <td>\${esc(r.status)}</td>
            <td>\${r.ports.map(esc).join(", ") || "—"}</td>
          </tr>\`).join("")}
      </table>\` : '<div class="meta" style="margin-top:8px">scaled to 0 replicas</div>'}
    </section>\`).join("");
}

async function tick() {
  const errBox = document.getElementById("error");
  try {
    const apps = await (await fetch("/api/apps")).json();
    render(apps);
    errBox.style.display = "none";
    document.getElementById("updated").textContent = "updated " + new Date().toLocaleTimeString();
  } catch (e) {
    errBox.textContent = "lost contact with kh dashboard: " + e;
    errBox.style.display = "block";
  }
}

async function loadInfo() {
  try {
    const i = await (await fetch("/api/info")).json();
    document.getElementById("engine").textContent =
      \`engine \${i.engine} (api \${i.api}) · \${i.os}/\${i.arch} · \${i.containersRunning}/\${i.containers} containers · \${i.images} images\`;
  } catch { /* header stays as-is; tick() reports errors */ }
}

loadInfo();
tick();
setInterval(tick, 2000);
setInterval(loadInfo, 10000);
</script>
</body>
</html>`;
}
