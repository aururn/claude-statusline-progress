// Claude Code statusline: model | folder | task progress
// Reads task tool calls (TaskCreate / TaskUpdate / TodoWrite) from the transcript.
// Usage: node statusline-progress.js [--style=pips|aurora|pill|line] [--demo]
const fs = require("fs");
const path = require("path");
const os = require("os");

const CACHE_DIR = path.join(os.homedir(), ".claude", "statusline-cache");
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split("=")[1] : def;
};
const STYLE = arg("style", "pips");

// ---------- color helpers (24-bit) ----------
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const fg = (h) => `\x1b[38;2;${hex(h).join(";")}m`;
const bg = (h) => `\x1b[48;2;${hex(h).join(";")}m`;
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const mix = (a, b, t) => {
  const [x, y] = [hex(a), hex(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
};
const gradient = (stops, t) => {
  const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
  return mix(stops[seg], stops[seg + 1], t * (stops.length - 1) - seg);
};

const C = {
  coral: "#D97757",
  amber: "#E8B04B",
  mint: "#7CC99A",
  text: "#E6E1DA",
  dim: "#8C857D",
  faint: "#3A3632",
  track: "#2B2825",
  ink: "#1C1A18",
  slate: "#4A4540",
};

// ---------- transcript parsing ----------
function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, "utf8"));
  } catch {
    return {};
  }
}

function loadCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((c) => c.text || "").join("\n");
  return "";
}

function applyLine(state, line) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    return;
  }
  const content = entry?.message?.content;
  if (!Array.isArray(content)) return;
  const stamp = entry.timestamp ? Date.parse(entry.timestamp) : null;
  for (const block of content) {
    if (block.type === "tool_use") {
      const input = block.input || {};
      if (block.name === "TodoWrite" && Array.isArray(input.todos)) {
        state.tasks = {};
        state.order = [];
        input.todos.forEach((t, i) => {
          const id = String(i + 1);
          state.tasks[id] = { subject: t.content, activeForm: t.activeForm, status: t.status };
          state.order.push(id);
        });
        if (!state.startedAt) state.startedAt = stamp;
      } else if (block.name === "TaskCreate") {
        state.pending[block.id] = input;
      } else if (block.name === "TaskUpdate" && input.taskId != null) {
        const id = String(input.taskId);
        const t = state.tasks[id];
        if (!t) continue;
        if (input.status === "deleted") {
          delete state.tasks[id];
          state.order = state.order.filter((x) => x !== id);
          continue;
        }
        if (input.status) t.status = input.status;
        if (stamp) state.lastAt = stamp;
        if (input.subject) t.subject = input.subject;
        if (input.activeForm) t.activeForm = input.activeForm;
      }
    } else if (block.type === "tool_result" && state.pending[block.tool_use_id]) {
      const input = state.pending[block.tool_use_id];
      delete state.pending[block.tool_use_id];
      if (block.is_error) continue;
      const m = resultText(block.content).match(/#(\d+)/);
      const id = m ? m[1] : String(state.nextId);
      state.nextId = Math.max(state.nextId, Number(id) + 1);
      state.tasks[id] = { subject: input.subject, activeForm: input.activeForm, status: "pending" };
      state.order.push(id);
      if (!state.startedAt) state.startedAt = stamp;
    }
  }
}

function readTasks(sessionId, transcriptPath) {
  const empty = { tasks: [], startedAt: null };
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return empty;
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const cacheFile = path.join(CACHE_DIR, `${sessionId || "default"}.json`);
  const size = fs.statSync(transcriptPath).size;
  let state = loadCache(cacheFile);
  if (!state || state.path !== transcriptPath || state.offset > size) {
    state = { path: transcriptPath, offset: 0, tasks: {}, order: [], pending: {}, nextId: 1, startedAt: null };
  }
  if (size > state.offset) {
    const fd = fs.openSync(transcriptPath, "r");
    const buf = Buffer.alloc(size - state.offset);
    fs.readSync(fd, buf, 0, buf.length, state.offset);
    fs.closeSync(fd);
    // Only consume complete lines; keep the partial last line for next time.
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl >= 0) {
      buf.subarray(0, lastNl).toString("utf8").split("\n").forEach((l) => l && applyLine(state, l));
      state.offset += lastNl + 1;
      fs.writeFileSync(cacheFile, JSON.stringify(state));
    }
  }
  return { tasks: state.order.map((id) => state.tasks[id]).filter(Boolean), startedAt: state.startedAt, lastAt: state.lastAt };
}

// ---------- rendering ----------
function elapsed(ms) {
  if (!ms || ms < 0) return "";
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`;
}

function summary(tasks) {
  const done = tasks.filter((t) => t.status === "completed").length;
  const current = tasks.find((t) => t.status === "in_progress");
  return {
    done,
    total: tasks.length,
    ratio: done / tasks.length,
    pct: Math.round((done / tasks.length) * 100),
    label: current ? current.activeForm || current.subject : done === tasks.length ? "完了" : "",
    finished: done === tasks.length,
  };
}

const PARTIALS = ["", "▏", "▎", "▍", "▌", "▋", "▊", "▉"];

// Smooth gradient bar with 1/8-cell precision.
function aurora(s) {
  const width = 16;
  const cells = s.ratio * width;
  const full = Math.floor(cells);
  const part = Math.floor((cells - full) * 8);
  let bar = "";
  for (let i = 0; i < width; i++) {
    const color = gradient([C.coral, C.amber, C.mint], i / (width - 1));
    if (i < full) bar += fg(color) + "█";
    else if (i === full && part > 0) bar += fg(color) + bg(C.track) + PARTIALS[part] + RESET;
    else bar += fg(C.track) + "█";
  }
  const pctColor = s.finished ? C.mint : C.text;
  return `${bar}${RESET} ${BOLD}${fg(pctColor)}${String(s.pct).padStart(3)}%${RESET} ${fg(C.dim)}${s.done}/${s.total}${RESET}`;
}

// Filled pill with the count printed inside the bar.
function pill(s) {
  const width = 18;
  const text = ` ${s.done}/${s.total} · ${s.pct}% `;
  const start = Math.floor((width - text.length) / 2);
  const filled = Math.round(s.ratio * width);
  const fillColor = s.finished ? C.mint : C.coral;
  let out = "";
  for (let i = 0; i < width; i++) {
    const ch = i >= start && i < start + text.length ? text[i - start] : " ";
    out += i < filled ? bg(fillColor) + fg(C.ink) + BOLD + ch + RESET : bg(C.track) + fg(C.dim) + ch + RESET;
  }
  return out;
}

// One pip per task; falls back to aurora when there are too many tasks.
function pips(s, tasks) {
  if (tasks.length > 14) return aurora(s);
  const marks = tasks.map((t) => {
    if (t.status === "completed") return fg(C.mint) + "●";
    if (t.status === "in_progress") return fg(C.amber) + "◉";
    return fg(C.faint) + "○";
  });
  return marks.join(" ") + RESET + ` ${fg(C.dim)}${s.done}/${s.total}${RESET}`;
}

// Thin line.
function line(s) {
  const width = 20;
  const filled = Math.round(s.ratio * width);
  const color = s.finished ? C.mint : C.coral;
  const head = filled < width && filled > 0 ? fg(color) + "╸" : "";
  const rest = filled < width ? fg(C.faint) + "━".repeat(width - filled - (head ? 1 : 0)) : "";
  return `${fg(color)}${"━".repeat(filled)}${head}${rest}${RESET} ${fg(C.text)}${s.pct}%${RESET}`;
}

const STYLES = { aurora, pill, pips, line };

function render(input, style = STYLE, now = Date.now()) {
  const sep = ` ${fg(C.faint)}│${RESET} `;
  const parts = [];
  const model = input.model?.display_name;
  if (model) parts.push(`${fg(C.coral)}✻${RESET} ${fg(C.text)}${model}${RESET}`);
  const dir = input.workspace?.current_dir || input.cwd;
  if (dir) parts.push(`${fg(C.dim)}${path.basename(dir)}${RESET}`);

  const { tasks, startedAt, lastAt } = input._demo || readTasks(input.session_id, input.transcript_path);
  if (tasks.length > 0) {
    const s = summary(tasks);
    let text = (STYLES[style] || aurora)(s, tasks);
    if (s.label) text += ` ${s.finished ? fg(C.mint) + "✓ " : fg(C.amber)}${s.label}${RESET}`;
    // Freeze the clock once every task is done.
    const took = elapsed((s.finished && lastAt ? lastAt : now) - startedAt);
    if (took) text += ` ${fg(C.dim)}${took}${RESET}`;
    parts.push(text);
  }
  return parts.join(sep);
}

function demo() {
  const mk = (states, active) =>
    states.split("").map((c, i) => ({
      subject: `task${i}`,
      activeForm: active,
      status: c === "x" ? "completed" : c === ">" ? "in_progress" : "pending",
    }));
  const base = { model: { display_name: "Opus 5.5" }, workspace: { current_dir: "/home/user/my-app" } };
  const now = Date.now();
  const cases = [
    { tasks: mk(">....", "既存コードを調査中"), startedAt: now - 60 * 1000 },
    { tasks: mk("xxx>..", "テストを修正中"), startedAt: now - 23 * 60 * 1000 },
    { tasks: mk("xxxxxx", ""), startedAt: now - 71 * 60 * 1000 },
  ];
  for (const style of Object.keys(STYLES)) {
    console.log(`# ${style}`);
    for (const c of cases) console.log(render({ ...base, _demo: c }, style, now));
  }
}

try {
  if (process.argv.includes("--demo")) demo();
  else process.stdout.write(render(readStdin()));
} catch {
  // Never break the statusline.
}
