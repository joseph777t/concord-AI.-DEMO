/* Concord Mission Control — app.js (fichier 3/3 : logique, 100% local, sans serveur) */
(function () {
"use strict";

/* ---------- Données ---------- */
var CATALOG = [
  { id: "claude", name: "Claude Code", short: "CC", color: "#f59e0b", harness: "Monitor + hooks", delivery: "receipt", latency: "~300ms", doc: "docs/claude-code.md", desc: "Référence. Livraison instantanée, garde anti-collision PreToolUse." },
  { id: "codex", name: "Codex", short: "CX", color: "#22d3ee", harness: "Monitor", delivery: "receipt", latency: "~450ms", doc: "docs/codex.md", desc: "Prompt direct même en plein tour. Idéal pour négocier les claims." },
  { id: "cursor", name: "Cursor", short: "CU", color: "#8b5cf6", harness: "Session hook", delivery: "receipt", latency: "~600ms", doc: "docs/cursor.md", desc: "Règles .cursor/rules + hook de session global." },
  { id: "gemini", name: "Gemini CLI", short: "GE", color: "#3b82f6", harness: "Settings hook", delivery: "receipt", latency: "~500ms", doc: "docs/gemini-cli.md", desc: "Enregistrement .gemini/settings.json, prompts durables + live." },
  { id: "grok", name: "Grok Build", short: "GR", color: "#e5e7eb", harness: "Config adapter", delivery: "receipt", latency: "~700ms", doc: "docs/grok-build.md", desc: "Via .grok/config.toml, présence temps réel." },
  { id: "goose", name: "Goose", short: "GO", color: "#10b981", harness: "Extension relay", delivery: "receipt", latency: "~550ms", doc: "docs/goose.md", desc: "Extension concord-relay dans config.yaml." },
  { id: "antigravity", name: "Antigravity", short: "AG", color: "#ec4899", harness: "Hooks + rules", delivery: "receipt", latency: "~480ms", doc: "docs/antigravity.md", desc: ".agents/mcp_config + hooks + concord.md." },
  { id: "copilot", name: "Copilot CLI", short: "CP", color: "#a3e635", harness: "Hook global", delivery: "hook-only", latency: "pull ~5s", doc: "docs/github-copilot-cli.md", desc: "Message durable à récupérer — indiqué explicitement." },
  { id: "opencode", name: "OpenCode", short: "OC", color: "#f472b6", harness: "MCP natif", delivery: "receipt", latency: "~400ms", doc: "docs/opencode.md", desc: "Client MCP générique, zéro config manuelle." }
];

var TOOLS = [
  { name: "start_work", purpose: "Enregistre la présence, claim ou accepte UNE tâche, signale les overlaps avant édition.", when: "Toujours en premier, avant de toucher un fichier.", params: [["agent_id", 1, "Maintient la présence en vie par le travail lui-même."], ["task_title / files", 1, "Titre + fichiers/modules claimés."], ["task_id", 0, "Pour accepter une tâche assignée existante."]], example: '{ "agent_id": "claude-1",\n  "task_title": "Landing page",\n  "files": ["src/app/page.tsx"] }', pitfall: "Ne jamais éditer avant le retour d'overlap de start_work." },
  { name: "inspect_work", purpose: "Lit l'état workspace / tâche, inbox/outbox d'un agent, ou un fil prompt/reply durable.", when: "Pour savoir qui est là (heartbeat, activité, statut) et détecter les stale claims.", params: [["workspace_id", 0, "Auto-résolu sinon (CONCORD_REPO_ROOT → CLAUDE_PROJECT_DIR → cwd)."], ["agent_id", 0, "Filtre inbox/outbox d'un agent."], ["thread_id", 0, "Lit un fil prompt/reply complet."]], example: '{ "workspace_id": "ws_a91f",\n  "agent_id": "codex-2" }', pitfall: "L'écriture ne change jamais le statut reporté — 3 signaux séparés." },
  { name: "update_work", purpose: "Enregistre du contexte OU prompt/reply immédiatement un autre agent.", when: "Prompt live : operation prompt + to_agent_id + idempotency_key. Reply : reply_to_message_id.", params: [["operation", 1, "prompt | reply | note"], ["to_agent_id", 0, "Cible du prompt direct."], ["idempotency_key", 0, "Obligatoire pour prompt (anti-doublon)."], ["reply_to_message_id", 0, "Obligatoire pour reply."]], example: '{ "operation": "prompt",\n  "to_agent_id": "codex-2",\n  "content": "Tu prends l\u2019API ?",\n  "idempotency_key": "k-8f3a" }', pitfall: "Échec immédiat si l'agent est injoignable — jamais de reroutage silencieux." },
  { name: "transfer_work", purpose: "Assigne, accepte, décline, libère, réassigne, offre un handoff, rouvre un travail.", when: "Tout changement de responsabilité. Assigné reste assigned jusqu'au accept.", params: [["action", 1, "assign | accept | decline | release | reassign | offer-handoff"], ["expected_version", 1, "Version monotone — premier arrivé gagne."], ["to_agent_id", 0, "Destinataire assign / handoff."]], example: '{ "task_id": "t_104",\n  "action": "offer-handoff",\n  "to_agent_id": "codex-2",\n  "expected_version": 3 }', pitfall: "Handoff : la responsabilité reste chez l'émetteur jusqu'au accept." },
  { name: "finish_work", purpose: "Enregistre les preuves et marque review-ready / complete / closed.", when: "En fin de tâche, avec scope, tests, risques, provenance.", params: [["evidence", 1, "Preuves d'exécution."], ["status", 0, "review-ready | complete | closed"], ["expected_version", 0, "Requis si transition de cycle de vie."]], example: '{ "task_id": "t_104",\n  "evidence": "tests 12/12",\n  "status": "review-ready" }', pitfall: "Sans evidence, pas de review packet généré." }
];

var DEMO = [
  { from: "Claude Code", color: "#f59e0b", to: "Concord", text: "Claim src/app/page.tsx", kind: "claim", explain: "Claude déclare son intention AVANT d'éditer via start_work. Version 1 enregistrée." },
  { from: "Codex", color: "#22d3ee", to: "Concord", text: "Claim src/app/page.tsx", kind: "claim", explain: "Codex tente le même fichier. Concord compare avec les claims actifs." },
  { from: "Concord", color: "#34d399", to: "Codex", text: "Overlap : Claude Code possède déjà ce fichier", kind: "overlap", explain: "Détection pré-édition — pas après. Exit 1 sur concord check, aucune collision." },
  { from: "Codex", color: "#22d3ee", to: "Claude", text: "Je prends src/app/api à la place. Ça te va ?", kind: "prompt", explain: "Prompt live via update_work + idempotency_key. Livré en ~450 ms par l'adapter." },
  { from: "Claude", color: "#f59e0b", to: "Codex", text: "Oui. Je garde la page et j'utilise ton contrat API.", kind: "reply", explain: "Reply avec reply_to_message_id. Contrat scellé, plus de relai humain." },
  { from: "Codex", color: "#22d3ee", to: "Concord", text: "finish_work → review-ready (tests 12/12, contrat OpenAPI)", kind: "review", explain: "Preuves + statut review-ready. REVIEW_PACKET.md généré." },
  { from: "Claude", color: "#f59e0b", to: "Reviewer", text: "transfer_work offer-handoff t_104 → reviewer indépendant", kind: "transfer", explain: "Responsabilité conservée jusqu'au accept. Audit complet, version monotone." }
];

var FILES = [
  { name: "concord.db", kind: "SQLite — source de vérité", content: "-- SQLite local-first — un seul store par dépôt\n-- Résolution : CONCORD_REPO_ROOT → CLAUDE_PROJECT_DIR → cwd\nTABLE agents(id, heartbeat_at, last_activity_at, reported_status);\nTABLE tasks(id, version INTEGER, status, owner_id, files JSON);\nTABLE messages(id, to_agent, idempotency_key UNIQUE, reply_to);\nTABLE audit(task_id, version, transition, actor, at);" },
  { name: "HANDOFF.md", kind: "Handoff lisible humain", content: "# Handoff t_104 — Whack-a-mole\n\n**De :** codex-2 → **Vers :** reviewer-1 (offre, attente accept)\n**Scope :** src/app/api + contrat OpenAPI\n**Tests :** 12/12 verts\n**Risques :** latence adapter Copilot (pull 5s)\n**Provenance :** Claude page + Codex API, thread msg_31 → msg_34" },
  { name: "REVIEW_PACKET.md", kind: "Preuves review-ready", content: "# Review packet t_104\n\n- Scope : jeu whack-a-mole jouable\n- Tests : vitest 12/12, e2e Playwright OK\n- Risques : aucun fichier hors claim\n- Provenance : start v1 (claude) → overlap → contrat API → finish v4" },
  { name: "events.jsonl", kind: "Events append-only", content: '{"t":"10:41:02","ev":"start_work","agent":"claude-1","task":"t_104 v1"}\n{"t":"10:41:19","ev":"overlap","file":"src/app/page.tsx","winner":"claude-1"}\n{"t":"10:41:31","ev":"prompt","from":"codex-2","to":"claude-1","key":"k-8f3a"}\n{"t":"10:42:10","ev":"finish_work","task":"t_104 v4","status":"review-ready"}' },
  { name: "WORK_STATE.json", kind: "Export généré", content: '{\n  "workspace_id": "ws_a91f",\n  "root": "/repo/whack-a-mole",\n  "agents_present": 5,\n  "active_tasks": 3,\n  "stale_claims": 1,\n  "review_ready": 1\n}' },
  { name: ".gitignore", kind: "Reste local", content: "*\n# Tout ignoré par défaut — setup préserve vos règles.\n# Ajoutez des négations pour versionner des artefacts en PR.\n# !HANDOFF.md" }
];

var CLI_HELP = [["concord setup", "État local, instructions, clients MCP"], ["concord status", "Roster, travail actif, overlaps, stale"], ["concord dashboard", "TUI temps réel (Tab, j/k, /, ?, q)"], ["concord who", "Qui est présent et sur quoi"], ["concord tasks", "Liste toutes les tâches"], ["concord handoff <id>", "Imprime le dernier handoff"], ["concord review-packet <id>", "Imprime le review packet"], ["concord export markdown", "Régénère les artefacts .concord/"], ["concord check <files>", "Overlap fichiers (exit 1 si conflit)"], ["concord watch", "Affiche l'état à chaque changement"], ["concord doctor", "Checks workspace + adoption outils"], ["concord adapters status", "Matrice de livraison par harness"]];

/* ---------- État ---------- */
function seedAgents() {
  return [
    { id: "claude-1", name: "Claude Code", color: "#f59e0b", status: "working", hb: 4, last: "à l'instant", delivery: "receipt", task: "t_104", spark: [3, 5, 4, 6, 5, 7, 6, 8, 7, 9, 8, 10] },
    { id: "codex-2", name: "Codex", color: "#22d3ee", status: "working", hb: 6, last: "il y a 12s", delivery: "receipt", task: "t_104", spark: [4, 4, 6, 5, 7, 6, 8, 7, 9, 8, 9, 11] },
    { id: "cursor-3", name: "Cursor", color: "#8b5cf6", status: "idle", hb: 11, last: "il y a 1m", delivery: "receipt", task: null, spark: [2, 3, 2, 4, 3, 4, 5, 4, 5, 6, 5, 6] },
    { id: "gemini-4", name: "Gemini CLI", color: "#3b82f6", status: "working", hb: 8, last: "il y a 30s", delivery: "receipt", task: "t_107", spark: [3, 4, 5, 4, 6, 5, 6, 7, 6, 7, 8, 8] },
    { id: "copilot-5", name: "Copilot CLI", color: "#a3e635", status: "stale", hb: 94, last: "il y a 9m", delivery: "hook-only", task: "t_101", spark: [5, 4, 3, 3, 2, 2, 1, 1, 1, 0, 0, 0] }
  ];
}
function seedTasks() {
  return [
    { id: "t_104", title: "Whack-a-mole jouable", files: ["src/app/page.tsx", "src/app/api/route.ts"], owner: "claude-1", status: "in-progress", version: 4, updated: "il y a 2m", tests: "12/12" },
    { id: "t_107", title: "Contrat OpenAPI + auth", files: ["src/app/api/route.ts", "src/lib/auth.ts"], owner: "gemini-4", status: "in-progress", version: 2, updated: "il y a 5m", tests: null },
    { id: "t_101", title: "Migration SQLite → WAL", files: ["src/db/store.ts"], owner: "copilot-5", status: "assigned", version: 1, updated: "il y a 9m", tests: null, stale: true },
    { id: "t_099", title: "Review packet template", files: ["templates/review.md"], owner: "cursor-3", status: "review", version: 3, updated: "il y a 20m", tests: "8/8" },
    { id: "t_095", title: "Hook PreToolUse overlap", files: [".claude/hooks/check.sh"], owner: "claude-1", status: "done", version: 5, updated: "hier", tests: "15/15" }
  ];
}
function seedMsgs() {
  return [
    { id: "msg_31", from: "codex-2", to: "claude-1", text: "Je prends src/app/api à la place. Ça te va ?", at: "10:41:31", key: "k-8f3a", replyTo: null, live: true },
    { id: "msg_32", from: "claude-1", to: "codex-2", text: "Oui. Je garde la page et j'utilise ton contrat API.", at: "10:41:44", key: "k-91c2", replyTo: "msg_31", live: true },
    { id: "msg_33", from: "gemini-4", to: "claude-1", text: "Auth prête côté API, je te laisse merger la page d'abord.", at: "10:43:02", key: "k-44bd", replyTo: null, live: true },
    { id: "msg_34", from: "claude-1", to: "copilot-5", text: "Ton claim WAL est stale (9m sans heartbeat) — tu releases ?", at: "10:44:10", key: "k-77aa", replyTo: null, live: false }
  ];
}
function seedEvents() {
  return [
    { at: "10:41:02", kind: "start_work", text: "claude-1 claim src/app/page.tsx → v1" },
    { at: "10:41:19", kind: "overlap", text: "codex-2 bloqué sur page.tsx (owner: claude-1)" },
    { at: "10:41:31", kind: "prompt", text: "codex-2 → claude-1 (k-8f3a) livré 450ms" },
    { at: "10:41:44", kind: "reply", text: "claude-1 → codex-2 contrat scellé" },
    { at: "10:43:02", kind: "prompt", text: "gemini-4 → claude-1 auth prête" },
    { at: "10:44:10", kind: "stale", text: "t_101 stale : copilot-5 sans heartbeat 9m" },
    { at: "10:45:00", kind: "finish", text: "t_099 → review-ready (8/8)" }
  ];
}

var S = { agents: seedAgents(), tasks: seedTasks(), messages: seedMsgs(), events: seedEvents() };
var ui = { tab: "overview", selAgent: "claude", tool: "start_work", file: 0, chatFrom: "codex-2", chatTo: "claude-1", replyTo: null, chatKey: ikey(), os: "mac", picked: ["claude", "codex", "cursor"], mode: "global", demo: { playing: true, idx: 0, char: 0, speed: 1 } };
var cliHist = [], cliHi = -1;

/* ---------- Helpers ---------- */
function $(id) { return document.getElementById(id); }
function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function uid(p) { return p + "_" + Math.random().toString(36).slice(2, 7); }
function ikey() { return "k-" + Math.random().toString(36).slice(2, 6); }
function nowT() { var d = new Date(); function p(n) { return (n < 10 ? "0" : "") + n; } return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()); }
function agentById(id) { for (var i = 0; i < S.agents.length; i++) if (S.agents[i].id === id) return S.agents[i]; return null; }
function agentName(id) { var a = agentById(id); return a ? a.name : id; }
function catalogById(id) { for (var i = 0; i < CATALOG.length; i++) if (CATALOG[i].id === id) return CATALOG[i]; return null; }
function copyText(t, okMsg) {
  function done() { toast("Copié", okMsg || "Contenu copié dans le presse-papiers.", "#34d399"); }
  if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(done, function () { fallback(); }); }
  else fallback();
  function fallback() { var ta = document.createElement("textarea"); ta.value = t; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) { toast("Copie manuelle", "Sélectionnez le texte et faites Ctrl+C.", "#fbbf24"); } ta.remove(); }
}
function download(name, content, type) {
  var blob = new Blob([content], { type: type || "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a"); a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
}
function toast(title, desc, color) {
  var box = $("toasts"); var d = document.createElement("div"); d.className = "toast";
  d.innerHTML = '<i style="background:' + (color || "#34d399") + '"></i><div><b>' + esc(title) + '</b><small>' + esc(desc) + "</small></div>";
  box.appendChild(d);
  setTimeout(function () { d.style.opacity = "0"; d.style.transition = "opacity .3s"; setTimeout(function () { d.remove(); }, 320); }, 4200);
}
function pushEvent(kind, text) { S.events.unshift({ at: nowT(), kind: kind, text: text }); S.events = S.events.slice(0, 40); if (ui.tab === "overview") renderOverview(); }
function checkOverlap(files, excludeId) {
  var out = [];
  S.tasks.forEach(function (t) {
    if (t.status === "done" || t.id === excludeId) return;
    files.forEach(function (f) {
      var n = f.trim().toLowerCase(); if (!n) return;
      for (var i = 0; i < t.files.length; i++) { var tf = t.files[i].toLowerCase(); if (tf === n || tf.indexOf(n) !== -1 || n.indexOf(tf) !== -1) { out.push({ task: t, file: f.trim() }); break; } }
    });
  });
  return out;
}
function sendPrompt(from, to, text, replyTo) {
  var fa = agentById(from), ta = agentById(to);
  if (!fa || !ta) return;
  if (ta.status === "stale") { toast("Échec de livraison", to + " injoignable — pas de reroutage silencieux.", "#f87171"); pushEvent("prompt-fail", from + " → " + to + " ÉCHEC (stale)"); return; }
  var m = { id: uid("msg"), from: from, to: to, text: text, at: nowT(), key: ikey(), replyTo: replyTo || null, live: ta.delivery === "receipt" };
  S.messages.push(m); ta.hb = 2; ta.last = "à l'instant";
  pushEvent(replyTo ? "reply" : "prompt", from + " → " + to + " (" + m.key + ")" + (m.live ? " livré" : " file durable"));
  toast(m.live ? "Prompt livré" : "File durable", from + " → " + to + " · " + m.key, m.live ? "#38bdf8" : "#fbbf24");
  renderChat(); renderOverview();
}

/* ---------- Hero : mesh + inspecteur ---------- */
function renderChips() {
  $("agentChips").innerHTML = CATALOG.map(function (a) {
    return '<button class="chip' + (ui.selAgent === a.id ? " on" : "") + '" data-agent="' + a.id + '"><i style="background:' + a.color + '"></i>' + a.name + "</button>";
  }).join("");
  var btns = $("agentChips").querySelectorAll("button");
  for (var i = 0; i < btns.length; i++) btns[i].onclick = function () { selectAgent(this.getAttribute("data-agent")); };
}
function selectAgent(id) { var c = catalogById(id); if (!c) return; ui.selAgent = id; renderChips(); renderInspector(); }
function renderInspector() {
  var c = catalogById(ui.selAgent);
  $("inspAvatar").textContent = c.short; $("inspName").textContent = c.name;
  $("inspHarness").textContent = c.harness; $("inspDesc").textContent = c.desc;
  $("inspDelivery").textContent = c.delivery === "receipt" ? "Temps réel" : "File durable";
  $("inspLatency").textContent = c.latency; $("inspDoc").textContent = c.doc;
}
function initMesh() {
  var cv = $("mesh"), ctx = cv.getContext("2d"), t = 0, raf;
  function size() { var r = cv.getBoundingClientRect(); var dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = r.width * dpr; cv.height = 400 * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
  size(); window.addEventListener("resize", size);
  function pt(i, w, h) {
    if (i === 0) return { x: w / 2, y: h / 2 };
    var k = i - 1, a = (k / (CATALOG.length - 1)) * Math.PI * 2 - Math.PI / 2 + t * 0.04;
    return { x: w / 2 + Math.cos(a) * w * 0.37, y: h / 2 + Math.sin(a) * h * 0.35 };
  }
  function draw() {
    t += 0.016;
    var r = cv.getBoundingClientRect(), w = r.width, h = 400;
    ctx.clearRect(0, 0, w, h);
    var pts = CATALOG.map(function (_, i) { return pt(i, w, h); });
    for (var i = 1; i < CATALOG.length; i++) {
      var a = pts[0], b = pts[i], on = ui.selAgent === CATALOG[i].id;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = on ? "rgba(52,211,153,.45)" : "rgba(255,255,255,.07)"; ctx.lineWidth = 1; ctx.stroke();
      var p = (t * 0.28 + i * 0.13) % 1;
      ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p, on ? 2.5 : 1.8, 0, 7);
      ctx.fillStyle = on ? "#34d399" : "rgba(255,255,255,.35)"; ctx.fill();
    }
    pts.forEach(function (p2, j) {
      var ag = CATALOG[j], sel = ui.selAgent === ag.id, R = j === 0 ? 22 : 15;
      ctx.beginPath(); ctx.arc(p2.x, p2.y, R, 0, 7);
      ctx.fillStyle = j === 0 ? "#fff" : "#151a22"; ctx.fill();
      ctx.strokeStyle = j === 0 ? "rgba(255,255,255,.9)" : (sel ? ag.color : "rgba(255,255,255,.16)"); ctx.lineWidth = 1.2; ctx.stroke();
      if (j !== 0) { ctx.beginPath(); ctx.arc(p2.x, p2.y - R - 5, 2.5, 0, 7); ctx.fillStyle = ag.color; ctx.fill(); }
      ctx.fillStyle = j === 0 ? "#09090b" : "#e4e4e7"; ctx.font = "600 " + (j === 0 ? 10 : 8.5) + "px sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(j === 0 ? "C" : ag.short, p2.x, p2.y + 0.5);
      ctx.fillStyle = sel ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.42)"; ctx.font = "500 10px sans-serif";
      ctx.fillText(ag.name.split(" ")[0], p2.x, p2.y + R + 13);
    });
    raf = requestAnimationFrame(draw);
  }
  draw();
  cv.onclick = function (e) {
    var r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    var best = null, bd = 30, N = CATALOG.length;
    CATALOG.forEach(function (ag, i) {
      var x, y;
      if (i === 0) { x = r.width / 2; y = 200; }
      else { var k = i - 1, a = (k / (N - 1)) * Math.PI * 2 - Math.PI / 2; x = r.width / 2 + Math.cos(a) * r.width * 0.37; y = 200 + Math.sin(a) * 400 * 0.35; }
      var d = Math.sqrt((mx - x) * (mx - x) + (my - y) * (my - y));
      if (d < bd) { bd = d; best = ag.id; }
    });
    if (best) selectAgent(best);
  };
}

/* ---------- Démo ---------- */
function renderDemo() {
  var d = ui.demo, box = $("demoLines"), html = "";
  for (var i = 0; i < Math.min(d.idx, DEMO.length); i++) {
    var s = DEMO[i];
    html += '<div class="dline"><i style="background:' + s.color + '"></i><div><span class="who">' + s.from + '</span><span class="to"> → ' + s.to + " </span>" + esc(s.text) + "</div></div>";
  }
  if (d.idx < DEMO.length) {
    var c = DEMO[d.idx];
    html += '<div class="dline live"><i style="background:' + c.color + '"></i><div style="flex:1"><span class="who">' + c.from + '</span><span class="to"> → ' + c.to + ' </span><span class="caret">' + esc(c.text.slice(0, d.char)) + "</span></div></div>";
    $("demoTitle").textContent = c.from + " → " + c.to;
    $("demoExplain").textContent = c.explain;
    $("demoStepN").textContent = (d.idx + 1) + "/" + DEMO.length;
    $("demoCount").textContent = (d.idx + 1) + "/" + DEMO.length;
  } else {
    html += '<div class="dline done-ok">Overlap résolu sans conflit — jeu livré, review packet prêt. <button class="linklike" id="demoAgain">Rejouer</button></div>';
    $("demoTitle").textContent = "Séquence terminée";
    $("demoExplain").textContent = "Reproduisez-la dans Mission Control : créez une tâche sur le même fichier, envoyez un prompt, effectuez le handoff.";
    $("demoStepN").textContent = DEMO.length + "/" + DEMO.length;
    $("demoCount").textContent = DEMO.length + "/" + DEMO.length;
    var ag = $("demoAgain"); if (ag) ag.onclick = demoReset;
  }
  box.innerHTML = html; box.scrollTop = 99999;
  $("demoProgress").style.width = (Math.min(d.idx, DEMO.length) / DEMO.length * 100) + "%";
  $("demoPlay").textContent = d.playing && d.idx < DEMO.length ? "❚❚" : "▶";
}
function demoTick() {
  var d = ui.demo;
  if (!d.playing || d.idx >= DEMO.length) return;
  if (d.char < DEMO[d.idx].text.length) { d.char++; }
  else { d.idx++; d.char = 0; }
  renderDemo();
  setTimeout(demoTick, d.char === 0 ? 1500 / d.speed : 36 / d.speed);
}
function demoReset() { ui.demo.idx = 0; ui.demo.char = 0; ui.demo.playing = true; renderDemo(); setTimeout(demoTick, 400); }
function initDemo() {
  renderDemo(); setTimeout(demoTick, 600);
  $("demoPlay").onclick = function () { var d = ui.demo; if (d.idx >= DEMO.length) { demoReset(); return; } d.playing = !d.playing; renderDemo(); if (d.playing) demoTick(); };
  $("demoStep").onclick = function () { var d = ui.demo; if (d.idx >= DEMO.length) { demoReset(); return; } d.idx = Math.min(d.idx + 1, DEMO.length); d.char = 0; renderDemo(); };
  $("demoReset").onclick = demoReset;
  var seg = $("speedSeg").querySelectorAll("button");
  for (var i = 0; i < seg.length; i++) seg[i].onclick = function () { ui.demo.speed = parseFloat(this.getAttribute("data-s")); var b = $("speedSeg").querySelectorAll("button"); for (var j = 0; j < b.length; j++) b[j].classList.remove("on"); this.classList.add("on"); };
  $("copyScript").onclick = function () { copyText(DEMO.map(function (s) { return s.from + " → " + s.to + "   " + s.text; }).join("\n"), "Script de la démo copié."); };
}

/* ---------- Onglets ---------- */
var ORDER = ["overview", "agents", "tasks", "chat", "guard", "cli", "files"];
function setTab(id) {
  ui.tab = id;
  var btns = $("tabs").querySelectorAll("button");
  for (var i = 0; i < btns.length; i++) btns[i].classList.toggle("on", btns[i].getAttribute("data-tab") === id);
  var panes = document.querySelectorAll(".pane");
  for (var j = 0; j < panes.length; j++) panes[j].classList.toggle("on", panes[j].id === "pane-" + id);
  if (id === "overview") renderOverview();
  if (id === "agents") renderAgents();
  if (id === "tasks") renderTasks();
  if (id === "chat") renderChat();
  if (id === "guard") renderGuardExclude();
}
function initTabs() {
  var btns = $("tabs").querySelectorAll("button");
  for (var i = 0; i < btns.length; i++) btns[i].onclick = function () { setTab(this.getAttribute("data-tab")); };
  document.addEventListener("click", function (e) { var g = e.target.closest ? e.target.closest("[data-goto]") : null; if (g) setTab(g.getAttribute("data-goto")); });
  document.addEventListener("keydown", function (e) {
    var tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (e.key >= "1" && e.key <= "7") setTab(ORDER[+e.key - 1]);
    if (e.key === "?") $("helpModal").classList.remove("hidden");
    if (e.key === "n" || e.key === "N") openTaskModal();
  });
  $("helpBtn").onclick = function () { $("helpModal").classList.remove("hidden"); };
  $("closeHelp").onclick = function () { $("helpModal").classList.add("hidden"); };
  $("helpModal").onclick = function (e) { if (e.target === this) this.classList.add("hidden"); };
  $("resetBtn").onclick = function () { S = { agents: seedAgents(), tasks: seedTasks(), messages: seedMsgs(), events: seedEvents() }; toast("Démo réinitialisée", "Données d'exemple restaurées.", "#34d399"); refreshCounts(); setTab(ui.tab); renderChat(); };
}

/* ---------- Aperçu ---------- */
function renderOverview() {
  var active = S.tasks.filter(function (t) { return t.status !== "done"; });
  var stale = S.tasks.filter(function (t) { return t.stale; });
  var review = S.tasks.filter(function (t) { return t.status === "review"; });
  var online = S.agents.filter(function (a) { return a.status !== "stale"; }).length;
  $("ovStats").innerHTML =
    stat(online, "Agents en ligne") + stat(active.length, "Tâches actives") + stat(stale.length, "Stale claims") + stat(S.messages.length, "Messages");
  function stat(v, l) { return '<div class="stat"><b>' + v + "</b><span>" + l + "</span></div>"; }
  var al = "";
  if (stale.length) al += '<button class="alert red" data-goto="tasks"><span>⚠</span><span><b>' + stale.length + " stale claim" + (stale.length > 1 ? "s" : "") + " — action requise</b><small>" + stale.map(function (t) { return t.id + " · " + t.owner + " · " + t.updated; }).join(" — ") + "</small></span><span class='arrow'>›</span></button>";
  if (review.length) al += '<button class="alert violet" data-goto="tasks"><span>✓</span><span><b>' + review.length + " tâche" + (review.length > 1 ? "s" : "") + " prête" + (review.length > 1 ? "s" : "") + " pour revue</b><small>Scope, tests, risques, provenance joints.</small></span><span class='arrow'>›</span></button>";
  $("ovAlerts").innerHTML = al;
  $("ovActivity").innerHTML = S.events.map(function (e) {
    return '<div class="arow"><span class="t">' + e.at + '</span><span class="k">' + esc(e.kind) + '</span><span class="x">' + esc(e.text) + "</span></div>";
  }).join("");
  $("ovPresence").innerHTML = S.agents.slice(0, 5).map(function (a) {
    var c = a.status === "stale" ? "#f87171" : (a.status === "idle" ? "#52525b" : "#34d399");
    return '<div class="prow"><i style="background:' + c + '"></i><span>' + esc(a.name) + ' <span class="id">' + a.id + '</span></span><span class="hb">' + a.hb + "s</span></div>";
  }).join("");
}

/* ---------- Agents ---------- */
function sparkHTML(a) {
  var max = Math.max.apply(null, a.spark.concat([1]));
  return '<span class="spark">' + a.spark.map(function (v, i) {
    var h = Math.max(12, v / max * 100), col = i === a.spark.length - 1 ? (a.status === "stale" ? "#f87171" : "#34d399") : "rgba(255,255,255,.14)";
    return '<span style="height:' + h + "%;background:" + col + '"></span>';
  }).join("") + "</span>";
}
function renderAgents() {
  var q = $("agentSearch").value.toLowerCase();
  var list = S.agents.filter(function (a) { return a.name.toLowerCase().indexOf(q) !== -1 || a.id.indexOf(q) !== -1; });
  $("agentGrid").innerHTML = list.map(function (a) {
    var dot = a.status === "stale" ? "#f87171" : (a.status === "idle" ? "#52525b" : "#34d399");
    return '<div class="acard' + (a.status === "stale" ? " stale" : "") + '">' +
      '<div class="ahead"><span class="avatar">' + esc(a.name.slice(0, 2).toUpperCase()) + '</span><span class="who"><b>' + esc(a.name) + "</b><span>" + a.id + '</span></span><span class="astatus" style="background:' + dot + '"></span></div>' +
      '<div class="afoot">' + sparkHTML(a) + '<div class="ameta">♥ <b>' + a.hb + "s</b><br>" + esc(a.last) + (a.task ? "<br>" + a.task : "") + "</div></div>" +
      '<div class="adelivery">' + (a.delivery === "receipt" ? "⚡ Livraison temps réel" : "📥 File durable (hook-only)") + "</div>" +
      '<div class="abtns"><button data-ping="' + a.id + '">Ping</button><button data-toggle="' + a.id + '">' + (a.status === "idle" ? "Réveiller" : "Veille") + '</button><button data-del="' + a.id + '">✕</button></div></div>';
  }).join("") || '<div class="kempty">Aucun agent.</div>';
  var g = $("agentGrid");
  g.querySelectorAll("[data-ping]").forEach(function (b) { b.onclick = function () { sendPrompt("claude-1", b.getAttribute("data-ping"), "Ping — tu me reçois ?"); renderAgents(); }; });
  g.querySelectorAll("[data-toggle]").forEach(function (b) { b.onclick = function () { var a = agentById(b.getAttribute("data-toggle")); a.status = a.status === "idle" ? "working" : "idle"; a.hb = 3; pushEvent("status", a.id + " → " + a.status); renderAgents(); }; });
  g.querySelectorAll("[data-del]").forEach(function (b) { b.onclick = function () { var id = b.getAttribute("data-del"); S.agents = S.agents.filter(function (x) { return x.id !== id; }); pushEvent("leave", id + " quitte"); refreshCounts(); renderAgents(); }; });
}
function initAgents() {
  $("agentSearch").oninput = renderAgents;
  $("addAgentBtn").onclick = addAgent;
  $("newAgentName").onkeydown = function (e) { if (e.key === "Enter") addAgent(); };
  function addAgent() {
    var name = $("newAgentName").value.trim(); if (!name) return;
    var id = name.toLowerCase().replace(/\s+/g, "-") + "-" + (10 + Math.floor(Math.random() * 80));
    S.agents.push({ id: id, name: name, color: "#a1a1aa", status: "idle", hb: 3, last: "à l'instant", delivery: "receipt", task: null, spark: [3, 4, 5, 4, 5, 6, 5, 6, 7, 6, 7, 8] });
    pushEvent("start_work", id + " rejoint le workspace");
    toast("Agent ajouté", id + " présent avec heartbeat live.", "#34d399");
    $("newAgentName").value = ""; refreshCounts(); renderAgents();
  }
}

/* ---------- Tâches ---------- */
var COLS = [["assigned", "Assignée", "#fbbf24"], ["in-progress", "En cours", "#38bdf8"], ["review", "En revue", "#a78bfa"], ["done", "Terminée", "#34d399"]];
function renderTasks() {
  var active = S.tasks.filter(function (t) { return t.status !== "done"; }).length;
  $("taskCountLine").innerHTML = "<b style='color:#fff'>" + active + "</b> actives · <span class='mono'>expected_version</span>";
  $("taskCountMini").textContent = active + " tâches actives";
  $("kanban").innerHTML = COLS.map(function (c) {
    var list = S.tasks.filter(function (t) { return t.status === c[0]; });
    var cards = list.map(function (t) {
      var btns = "";
      if (c[0] === "assigned") btns += '<button data-act="accept" data-id="' + t.id + '" class="primary">Accepter</button>';
      if (c[0] === "in-progress") btns += '<button data-act="toreview" data-id="' + t.id + '">Passer en revue</button>';
      if (c[0] === "review") btns += '<button data-act="close" data-id="' + t.id + '" class="primary">Clore</button>';
      if (t.stale) btns += '<button data-act="take" data-id="' + t.id + '">Reprendre</button>';
      return '<div class="kcard' + (t.stale ? " stale" : "") + '"><span class="kid">' + t.id + '</span> <span class="kv">v' + t.version + "</span>" + (t.stale ? ' <span class="badge red">stale</span>' : "") + "<h4>" + esc(t.title) + "</h4>" +
        '<div class="kfiles">' + t.files.map(function (f) { return "<span>" + esc(f) + "</span>"; }).join("") + "</div>" +
        '<div class="kmeta">' + esc(t.owner) + " · " + esc(t.updated) + (t.tests ? " · " + t.tests : "") + '</div><div class="kbtns">' + btns + "</div></div>";
    }).join("") || '<div class="kempty">Vide</div>';
    return '<div class="kcol"><div class="khead"><i style="background:' + c[2] + '"></i>' + c[1] + '<span class="n">' + list.length + "</span></div>" + cards + "</div>";
  }).join("");
  $("kanban").querySelectorAll("button[data-act]").forEach(function (b) {
    b.onclick = function () {
      var t = null; S.tasks.forEach(function (x) { if (x.id === b.getAttribute("data-id")) t = x; });
      if (!t) return;
      var act = b.getAttribute("data-act");
      if (act === "accept") { t.status = "in-progress"; t.stale = false; t.version++; t.updated = "à l'instant"; pushEvent("transfer", t.id + " accept par " + t.owner); }
      if (act === "toreview") { t.status = "review"; t.version++; t.updated = "à l'instant"; pushEvent("finish", t.id + " → review-ready"); toast("Review-ready", t.id + " : packet généré.", "#a78bfa"); }
      if (act === "close") { t.status = "done"; t.version++; t.updated = "à l'instant"; pushEvent("finish", t.id + " → closed"); }
      if (act === "take") { t.owner = "claude-1"; t.status = "in-progress"; t.stale = false; t.version++; t.updated = "à l'instant"; pushEvent("transfer", t.id + " repris (stale résolu)"); }
      renderTasks(); renderOverview();
    };
  });
}
function openTaskModal() {
  $("taskOwner").innerHTML = S.agents.filter(function (a) { return a.status !== "stale"; }).map(function (a) { return '<option value="' + a.id + '">' + esc(a.name) + " — " + a.id + "</option>"; }).join("");
  $("taskModal").classList.remove("hidden");
}
function initTasks() {
  $("openTaskModal").onclick = openTaskModal;
  $("closeTaskModal").onclick = function () { $("taskModal").classList.add("hidden"); };
  $("cancelTask").onclick = function () { $("taskModal").classList.add("hidden"); };
  $("taskModal").onclick = function (e) { if (e.target === this) this.classList.add("hidden"); };
  $("taskFiles").oninput = function () {
    var fs = $("taskFiles").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var box = $("taskOverlap");
    if (!fs.length) { box.classList.add("hidden"); return; }
    var c = checkOverlap(fs);
    box.classList.remove("hidden");
    if (c.length) { box.className = "overlap-preview bad top"; box.textContent = "Conflit : " + c.map(function (o) { return o.file + " → " + o.task.id; }).join(" · "); }
    else { box.className = "overlap-preview good top"; box.textContent = "Aucun conflit — claim disponible."; }
  };
  $("createTask").onclick = function () {
    var title = $("taskTitle").value.trim();
    var fs = $("taskFiles").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    if (!title || !fs.length) { toast("Champs manquants", "Titre + au moins un fichier claimé.", "#fbbf24"); return; }
    var owner = $("taskOwner").value, ag = agentById(owner);
    var t = { id: "t_" + (100 + Math.floor(Math.random() * 800)), title: title, files: fs, owner: owner, status: "assigned", version: 1, updated: "à l'instant", tests: null };
    S.tasks.unshift(t);
    var c = checkOverlap(fs);
    pushEvent("start_work", owner + " claim " + fs.join(", ") + " → " + t.id + " v1");
    toast(c.length ? "Overlap détecté avant édition" : "Tâche créée", c.length ? c.map(function (o) { return o.file + " → " + o.task.id; }).join(" · ") : t.id + " claimé sans conflit.", c.length ? "#fbbf24" : "#34d399");
    $("taskTitle").value = ""; $("taskFiles").value = ""; $("taskOverlap").classList.add("hidden");
    $("taskModal").classList.add("hidden"); renderTasks(); renderOverview();
  };
}

/* ---------- Chat ---------- */
function renderChat() {
  var alive = S.agents.filter(function (a) { return a.status !== "stale"; });
  $("chatFrom").innerHTML = alive.map(function (a) {
    return '<button data-id="' + a.id + '" class="' + (ui.chatFrom === a.id ? "on" : "") + '"><i style="background:' + a.color + '"></i>' + esc(a.name) + "</button>";
  }).join("");
  $("chatTo").innerHTML = S.agents.map(function (a) {
    var tag = a.status === "stale" ? "stale" : (a.delivery === "hook-only" ? "file" : "live");
    return '<button data-id="' + a.id + '" class="' + (ui.chatTo === a.id ? "on" : "") + '"><i style="background:' + (a.status === "stale" ? "#f87171" : a.color) + '"></i>' + esc(a.name) + '<span class="tag">' + tag + "</span></button>";
  }).join("");
  $("chatFrom").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ui.chatFrom = b.getAttribute("data-id"); renderChat(); }; });
  $("chatTo").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ui.chatTo = b.getAttribute("data-id"); renderChat(); }; });
  $("chatMessages").innerHTML = S.messages.map(function (m) {
    var mine = m.from === ui.chatFrom;
    return '<div class="msg ' + (mine ? "mine" : "theirs") + '"><div class="mhead"><b>' + esc(agentName(m.from)) + "</b><span>→ " + esc(agentName(m.to)) + "</span><span>" + m.at + "</span></div>" +
      (m.replyTo ? '<div class="mhead">↩ réponse à ' + m.replyTo + "</div>" : "") +
      '<div class="mtext">' + esc(m.text) + '</div><div class="mfoot"><span>' + m.key + "</span><span>· " + (m.live ? "livré" : "en file") + '</span><button data-reply="' + m.id + '">Répondre</button></div></div>';
  }).join("");
  $("chatMessages").scrollTop = 99999;
  $("chatMessages").querySelectorAll("[data-reply]").forEach(function (b) {
    b.onclick = function () {
      var m = null; S.messages.forEach(function (x) { if (x.id === b.getAttribute("data-reply")) m = x; });
      if (!m) return;
      ui.replyTo = m.id;
      if (agentById(m.from) && agentById(m.from).status !== "stale") { ui.chatTo = m.from; }
      $("replyToId").textContent = m.id; $("replyBar").classList.remove("hidden"); renderChat(); $("chatInput").focus();
    };
  });
  $("chatKeyLine").innerHTML = "idempotency_key <b>" + (ui.replyTo ? "reply_to " + ui.replyTo : ui.chatKey) + "</b>";
}
function initChat() {
  $("chatSend").onclick = doSend;
  $("chatInput").onkeydown = function (e) { if (e.key === "Enter") doSend(); };
  $("replyCancel").onclick = function () { ui.replyTo = null; $("replyBar").classList.add("hidden"); renderChat(); };
  function doSend() {
    var t = $("chatInput").value.trim();
    if (!t || ui.chatFrom === ui.chatTo) return;
    sendPrompt(ui.chatFrom, ui.chatTo, t, ui.replyTo);
    $("chatInput").value = ""; ui.replyTo = null; ui.chatKey = ikey();
    $("replyBar").classList.add("hidden"); renderChat();
  }
}

/* ---------- Guard ---------- */
function renderGuardExclude() {
  var sel = $("guardExclude"), cur = sel.value;
  sel.innerHTML = '<option value="">Aucune</option>' + S.tasks.map(function (t) { return '<option value="' + t.id + '">' + t.id + " — " + esc(t.title) + "</option>"; }).join("");
  sel.value = cur;
}
function initGuard() {
  $("guardFiles").oninput = function () { $("guardEcho").textContent = $("guardFiles").value || "<files>"; };
  $("guardRun").onclick = function () {
    var fs = $("guardFiles").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    var ex = $("guardExclude").value || undefined;
    var res = checkOverlap(fs, ex), box = $("guardResult");
    if (!res.length) {
      box.innerHTML = '<div><span class="exit ok">exit 0</span> <span class="badge green">libre</span><p class="small dim top">Aucune tâche active ne claim ces fichiers. Exécutez <span class="mono">start_work</span> avant d\'éditer.</p></div>';
    } else {
      box.innerHTML = '<div><span class="exit ko">exit 1</span> <span class="badge red">conflit — bloqué</span></div>' +
        res.map(function (r) { return '<div class="conflict"><span class="mono">' + esc(r.file) + "</span> — " + r.task.id + " · " + esc(r.task.owner) + " · v" + r.task.version + '<div class="dim small">' + esc(r.task.title) + "</div></div>"; }).join("");
      toast("Conflit — exit 1", "Commit bloqué.", "#f87171");
    }
  };
  $("copyHook").onclick = function () { copyText("concord check " + ($("guardFiles").value || "<files>") + " || exit 2", "Hook PreToolUse copié."); };
}

/* ---------- CLI ---------- */
function cliPrint(cmd, out) {
  var box = $("cliOut"), d = document.createElement("div");
  if (cmd) { var h = document.createElement("div"); h.innerHTML = '<span style="color:#52525b">❯ </span><span style="color:#fff">' + esc(cmd) + "</span>"; box.appendChild(h); }
  var p = document.createElement("pre"); p.style.cssText = "white-space:pre-wrap;color:#8b93a3;margin:0 0 8px"; p.textContent = out; box.appendChild(p);
  box.scrollTop = 99999;
}
function cliRun(raw) {
  var cmd = raw.trim(); if (!cmd) return;
  var c = cmd.toLowerCase(), out;
  if (c === "help") out = CLI_HELP.map(function (x) { return (x[0] + "                      ").slice(0, 26) + x[1]; }).join("\n");
  else if (c === "status") out = "workspace ws_a91f\nagents " + S.agents.length + " (" + S.agents.filter(function (a) { return a.status !== "stale"; }).length + " live) · actives " + S.tasks.filter(function (t) { return t.status !== "done"; }).length + " · stale " + S.tasks.filter(function (t) { return t.stale; }).length;
  else if (c === "who") out = S.agents.map(function (a) { return (a.status === "stale" ? "○" : "●") + " " + a.id + " — " + a.status + " · ♥" + a.hb + "s" + (a.task ? " · " + a.task : ""); }).join("\n");
  else if (c === "tasks") out = S.tasks.map(function (t) { return t.id + " v" + t.version + " [" + t.status + "] " + t.title + " — " + t.owner; }).join("\n");
  else if (c.indexOf("check") === 0) { var fs = cmd.slice(5).replace(/--task\s+\S+/, "").trim().split(/\s+/).filter(Boolean); out = fs.length ? (checkOverlap(fs).length ? "overlap détecté — exit 1" : "aucun overlap — exit 0") : "usage: concord check <files...> [--task <id>]"; }
  else if (c.indexOf("adapters") !== -1) out = S.agents.map(function (a) { return a.name + " : " + (a.delivery === "receipt" ? "temps réel" : "file durable") + " · " + (a.status === "stale" ? "injoignable" : "joignable"); }).join("\n");
  else if (c === "doctor") out = "workspace ok · .gitignore ok · 1 stale claim (t_101) · adoption : start 100% · prompt 86%";
  else if (c === "watch") out = S.events.slice(0, 4).map(function (e) { return "[" + e.at + "] " + e.kind + " : " + e.text; }).join("\n");
  else if (c.indexOf("handoff") === 0) out = "Handoff t_104 — codex-2 → reviewer-1 (offre, attente accept)\nScope : api + contrat · Tests 12/12";
  else if (c.indexOf("review-packet") === 0) out = "Review t_104 — scope ok · tests 12/12 · risques : aucun hors claim";
  else if (c.indexOf("export") === 0) out = "HANDOFF.md · REVIEW_PACKET.md · WORK_STATE.json · events.jsonl — régénérés";
  else if (c === "dashboard") out = "Vous y êtes — ce Mission Control est le dashboard TUI en version web.";
  else if (c === "clear") { $("cliOut").innerHTML = ""; return; }
  else out = "inconnu : " + cmd + " — help, status, who, tasks, check, adapters status, doctor…";
  cliPrint(cmd, out);
  cliHist.unshift(cmd); cliHist = cliHist.slice(0, 30);
}
function initCli() {
  cliPrint("", "Émulateur concord — tapez help. 14 commandes, sans effet sur le système.");
  $("cliInput").addEventListener("keydown", function (e) {
    if (e.key === "Enter") { cliRun(this.value); this.value = ""; cliHi = -1; }
    if (e.key === "ArrowUp") { e.preventDefault(); cliHi = Math.min(cliHi + 1, cliHist.length - 1); if (cliHist[cliHi]) this.value = cliHist[cliHi]; }
    if (e.key === "ArrowDown") { e.preventDefault(); cliHi--; this.value = cliHi >= 0 ? cliHist[cliHi] : ""; }
    if (e.key === "Tab") { e.preventDefault(); var all = CLI_HELP.map(function (x) { return x[0]; }).concat(["clear", "help"]); for (var i = 0; i < all.length; i++) if (all[i].indexOf(this.value) === 0) { this.value = all[i]; break; } }
  });
  document.querySelectorAll("[data-cmd]").forEach(function (b) { b.onclick = function () { cliRun(b.getAttribute("data-cmd")); }; });
}

/* ---------- Fichiers ---------- */
function renderFiles() {
  $("fileList").innerHTML = FILES.map(function (f, i) {
    return '<button class="fitem' + (ui.file === i ? " on" : "") + '" data-f="' + i + '"><div class="fn">' + f.name + '</div><div class="fk">' + f.kind + "</div></button>";
  }).join("");
  $("fileList").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ui.file = +b.getAttribute("data-f"); renderFiles(); }; });
  $("fileName").textContent = ".concord/" + FILES[ui.file].name;
  $("fileContent").textContent = FILES[ui.file].content;
}
function initFiles() {
  renderFiles();
  $("fileCopy").onclick = function () { copyText(FILES[ui.file].content, FILES[ui.file].name + " copié."); };
  $("fileDl").onclick = function () { download(FILES[ui.file].name, FILES[ui.file].content); toast("Téléchargé", FILES[ui.file].name, "#34d399"); };
}

/* ---------- Outils ---------- */
function renderTools() {
  $("toolList").innerHTML = TOOLS.map(function (t, i) {
    return '<button class="toolbtn' + (ui.tool === t.name ? " on" : "") + '" data-t="' + t.name + '"><div class="tn"><span>0' + (i + 1) + "</span>" + t.name + '</div><div class="td">' + esc(t.purpose) + "</div></button>";
  }).join("") + '<div class="card pad small top">Version monotone, audit append-only, accept explicite — garanties conservées.</div>';
  $("toolList").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ui.tool = b.getAttribute("data-t"); renderTools(); }; });
  var t = null; TOOLS.forEach(function (x) { if (x.name === ui.tool) t = x; });
  $("toolDetail").innerHTML =
    '<div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="mono" style="font-size:17px;color:#fff">' + t.name + '</span><span class="badge green">inchangé</span><button class="btn btn-sm" style="margin-left:auto" id="toolCopy">Copier</button></div>' +
    '<p class="top" style="font-size:14px;color:#d4d4d8">' + esc(t.purpose) + '</p><p class="dim small top">Usage — ' + esc(t.when) + "</p>" +
    '<div class="tparams">' + t.params.map(function (p) { return '<div class="pr"><span class="pn">' + esc(p[0]) + '</span><span class="' + (p[1] ? "req" : "opt") + '">' + (p[1] ? "requis" : "optionnel") + "</span><span class='dim'>" + esc(p[2]) + "</span></div>"; }).join("") + "</div>" +
    '<pre class="tcode mono">' + esc(t.example) + "</pre>" +
    '<div class="twarn">Point d\'attention — ' + esc(t.pitfall) + "</div>";
  $("toolCopy").onclick = function () { copyText(t.example, t.name + " copié."); };
}

/* ---------- Setup ---------- */
var MODES = [["repo", "Dépôt local", "Store SQLite par dépôt, dans .concord/."], ["global", "Global (recommandé)", "Fonctionne dans les dépôts non configurés. ~/.concord/global.db."], ["cloud", "Cloud", "Agents joignables entre machines. Plus d'état local."]];
function setupCmd() {
  if (ui.mode === "cloud") return "npm install -g @concord-ai/concord-mcp\nconcord cloud login\nconcord cloud link";
  var cd = ui.os === "win" ? "cd \\chemin\\vers\\votre\\repo" : "cd /chemin/vers/votre/repo";
  return "npm install -g @concord-ai/concord-mcp\n" + cd + "\nconcord setup" + (ui.mode === "global" ? " --global" : " --repo-files");
}
function renderSetup() {
  var osb = $("osSeg").querySelectorAll("button");
  for (var i = 0; i < osb.length; i++) osb[i].classList.toggle("on", osb[i].getAttribute("data-os") === ui.os);
  $("setupAgents").innerHTML = CATALOG.map(function (a) {
    var on = ui.picked.indexOf(a.id) !== -1;
    return '<button class="apick' + (on ? " on" : "") + '" data-a="' + a.id + '"><span class="box">' + (on ? "✓" : "") + '</span><i style="background:' + a.color + '"></i>' + a.name + "</button>";
  }).join("");
  $("setupAgents").querySelectorAll("button").forEach(function (b) {
    b.onclick = function () { var id = b.getAttribute("data-a"); var k = ui.picked.indexOf(id); if (k === -1) ui.picked.push(id); else ui.picked.splice(k, 1); renderSetup(); };
  });
  $("setupCount").textContent = ui.picked.length;
  $("modeCards").innerHTML = MODES.map(function (m) {
    return '<button class="modecard' + (ui.mode === m[0] ? " on" : "") + '" data-m="' + m[0] + '"><b>' + m[1] + "</b><small>" + m[2] + "</small></button>";
  }).join("");
  $("modeCards").querySelectorAll("button").forEach(function (b) { b.onclick = function () { ui.mode = b.getAttribute("data-m"); renderSetup(); }; });
  $("setupCmd").textContent = setupCmd();
  $("setupDelivery").innerHTML = ui.picked.length ? CATALOG.filter(function (a) { return ui.picked.indexOf(a.id) !== -1; }).map(function (a) {
    return '<div class="drow"><i style="background:' + a.color + '"></i>' + a.name + '<span class="mono">' + (a.delivery === "receipt" ? "temps réel · " + a.latency : "file durable") + "</span></div>";
  }).join("") : '<div class="dim small">Sélectionnez au moins un agent.</div>';
}
function initSetup() {
  var osb = $("osSeg").querySelectorAll("button");
  for (var i = 0; i < osb.length; i++) osb[i].onclick = function () { ui.os = this.getAttribute("data-os"); renderSetup(); };
  $("copySetup").onclick = function () { copyText(setupCmd(), "Commande d'installation copiée."); };
  renderSetup();
}

/* ---------- Divers ---------- */
function refreshCounts() {
  var online = S.agents.filter(function (a) { return a.status !== "stale"; }).length;
  $("onlineCount").textContent = online + " en ligne";
  var active = S.tasks.filter(function (t) { return t.status !== "done"; }).length;
  $("taskCountMini").textContent = active + " tâches actives";
}
function initMisc() {
  $("copyInstall").onclick = function () { copyText("npm install -g @concord-ai/concord-mcp", "Commande d'installation copiée."); };
  var priv = true;
  $("privacyBtn").onclick = function () {
    priv = !priv;
    $("privacyState").textContent = priv ? "activée" : "désactivée";
    $("privacyDesc").textContent = priv ? "Envois best-effort, jamais de code ni de contenu." : "CONCORD_TELEMETRY_DISABLED=1 — aucun envoi.";
    $("privacyToggle").textContent = priv ? "Désactiver" : "Activer";
  };
  setInterval(function () {
    S.agents.forEach(function (a) {
      if (a.status === "stale") return;
      a.spark.push(4 + Math.floor(Math.random() * 8)); a.spark.shift();
      a.hb = a.status === "idle" ? a.hb + 2 : 2 + (a.spark[a.spark.length - 1] % 8);
    });
    refreshCounts();
    if (ui.tab === "agents") renderAgents();
    if (ui.tab === "overview") renderOverview();
  }, 2500);
}

/* ---------- Init ---------- */
document.addEventListener("DOMContentLoaded", function () {
  window.__concordBooted = true;
  renderChips(); renderInspector(); initMesh(); initDemo();
  initTabs(); renderOverview(); initAgents(); renderAgents(); renderTasks();
  initTasks(); renderChat(); initChat(); renderGuardExclude(); initGuard();
  initCli(); initFiles(); renderTools(); initSetup(); initMisc(); refreshCounts();
});

})();
