// End-to-end smoke test on the real surface: a linked computer-use plugin in a running t3mode
// sandbox, mcp.cjs under T3 Code's exe, and a scratch WinForms window this script owns.
//
//   node scripts/smoke.cjs --exe "<T3 Code.exe>" --home <sandbox home> --cdp 9444 [--runs 5] [--closed]
//
// Input goes only to the scratch window: every input batch first checks that the window is in
// front and that the point it clicks is on it, and skips input otherwise. With --closed it only
// checks the refusal while T3 Code isn't running.
"use strict";
const { spawn, execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const xa = require("@crowecawcaw/xa11y");

const args = Object.fromEntries(
  process.argv.slice(2).reduce((pairs, arg, i, all) => {
    if (arg.startsWith("--")) pairs.push([arg.slice(2), all[i + 1]?.startsWith("--") ? true : (all[i + 1] ?? true)]);
    return pairs;
  }, []),
);
const exe = args.exe;
const home = args.home;
const cdpPort = Number(args.cdp ?? 9444);
const runs = Number(args.runs ?? 5);
const mcpScript = path.join(__dirname, "..", "dist", "mcp.cjs");
if (!exe || !home) throw new Error("usage: node scripts/smoke.cjs --exe <T3 Code.exe> --home <home> [--cdp 9444]");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "cu-smoke-"));
const outFile = path.join(work, "form-out.txt");
const TITLE = "t3mode-cu-smoke";
let failures = 0;
const check = (ok, what) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`);
  if (!ok) failures += 1;
};

function startMcp() {
  const child = spawn(exe, [mcpScript], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", T3MODE_HOME: home },
    stdio: ["pipe", "pipe", "inherit"],
  });
  let buffer = "";
  let id = 0;
  const waiters = new Map();
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    for (let i; (i = buffer.indexOf("\n")) >= 0; ) {
      const message = JSON.parse(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
      waiters.get(message.id)?.(message);
    }
  });
  const rpc = (method, params) =>
    new Promise((resolve) => {
      const n = ++id;
      waiters.set(n, resolve);
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
    });
  const call = async (name, args) => {
    const started = performance.now();
    const { result } = await rpc("tools/call", { name, arguments: args });
    const text = result.content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
    return { ms: performance.now() - started, isError: result.isError === true, text, image: result.content.find((c) => c.type === "image") };
  };
  return {
    child,
    call,
    async init() {
      await rpc("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "cu-smoke", version: "1" } });
      child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n");
    },
  };
}

async function cdp(expression) {
  const targets = await (await fetch(`http://127.0.0.1:${cdpPort}/json`)).json();
  const page = targets.find((t) => t.type === "page" && !t.url.startsWith("devtools"));
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve));
  const reply = new Promise((resolve) => ws.addEventListener("message", (m) => resolve(JSON.parse(m.data))));
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression, returnByValue: true } }));
  const result = await reply;
  ws.close();
  return result.result?.result?.value;
}

const pill = () =>
  cdp(`(() => { const p = document.querySelector("[data-computer-use-pill]"); return p && { hidden: p.hidden, text: p.textContent, button: p.querySelector("button")?.textContent }; })()`);
const pressPillButton = (label) =>
  cdp(`(() => { const b = document.querySelector("[data-computer-use-pill] button"); if (!b || b.hidden || b.textContent !== ${JSON.stringify(label)}) return false; b.click(); return true; })()`);

function startForm() {
  const script = path.join(work, "form.ps1");
  fs.writeFileSync(
    script,
    `Add-Type -AssemblyName System.Windows.Forms
$f = New-Object Windows.Forms.Form
$f.Text = '${TITLE}'; $f.Width = 460; $f.Height = 220; $f.TopMost = $true; $f.StartPosition = 'CenterScreen'
$tb = New-Object Windows.Forms.TextBox; $tb.AccessibleName = 'Smoke field'; $tb.Left = 20; $tb.Top = 20; $tb.Width = 400; $tb.MaxLength = 2000
$b = New-Object Windows.Forms.Button; $b.Text = 'Save smoke'; $b.Left = 20; $b.Top = 70; $b.Width = 160; $b.Height = 40
$b.Add_Click({ Add-Content -Path '${outFile}' -Value ("clicked:" + $tb.Text) })
$f.Controls.Add($tb); $f.Controls.Add($b)
$t = New-Object Windows.Forms.Timer; $t.Interval = 120000; $t.Add_Tick({ $f.Close() }); $t.Start()
[void]$f.ShowDialog()
`,
  );
  return spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script], { stdio: "ignore" });
}

const formLog = () => (fs.existsSync(outFile) ? fs.readFileSync(outFile, "utf8").trim().split(/\r?\n/) : []);

/** The pid of the top-level window under a desktop point, per-monitor DPI aware. */
function windowPidAt(x, y) {
  const ps = `Add-Type @'
using System; using System.Runtime.InteropServices;
public class H { [DllImport("user32.dll")] public static extern bool SetProcessDpiAwarenessContext(IntPtr v);
 [StructLayout(LayoutKind.Sequential)] public struct P { public int X, Y; }
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(P p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); }
'@
[void][H]::SetProcessDpiAwarenessContext([IntPtr](-4)); $p = New-Object H+P; $p.X = ${Math.round(x)}; $p.Y = ${Math.round(y)}
$h = [H]::WindowFromPoint($p); $id = 0; [void][H]::GetWindowThreadProcessId($h, [ref]$id); $id`;
  return Number(execFileSync("powershell.exe", ["-NoProfile", "-Command", ps], { encoding: "utf8" }).trim());
}

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function closedRefusal() {
  const mcp = startMcp();
  await mcp.init();
  const result = await mcp.call("act", { steps: [{ do: "key", keys: "a" }] });
  check(result.isError && /needs T3 Code open/.test(result.text), `act refused with T3 Code closed (${result.ms.toFixed(0)} ms): ${result.text.slice(0, 80)}…`);
  mcp.child.kill();
}

async function main() {
  if (args.closed) return closedRefusal();
  xa.setDefaultTimeout({ timeout: 0 });
  const mcp = startMcp();
  await mcp.init();
  const form = startForm();
  let app;
  let win;
  for (let i = 0; i < 40 && !win; i++) {
    await sleep(250);
    try {
      app = await xa.App.byPid(form.pid, { timeout: 0 });
      [win] = await app.windows();
    } catch {}
  }
  if (!win) throw new Error("the scratch form didn't appear");
  await sleep(1200);

  try {
    const first = await mcp.call("observe", {});
    const formRef = new RegExp(`(w\\d+) "${TITLE}"`).exec(first.text)?.[1];
    check(!!formRef, `observe lists the scratch window as ${formRef}`);
    check(/off limits/.test(first.text), "observe marks T3 Code off limits");

    const look = await mcp.call("observe", { win: formRef });
    const fieldRef = /(e\d+) text_field "Smoke field"/.exec(look.text)?.[1];
    const buttonRef = /(e\d+) button "Save smoke"/.exec(look.text)?.[1];
    const imageSize = /Image (i\d+): window w\d+, (\d+)x(\d+)/.exec(look.text);
    check(!!(fieldRef && buttonRef && look.image && imageSize), `observe ${formRef}: field ${fieldRef}, button ${buttonRef}, image ${imageSize?.[2]}x${imageSize?.[3]}`);

    const setBySelector = await mcp.call("act", {
      steps: [{ do: "set", target: { sel: "text_field", win: formRef }, value: "via selector" }],
      after: "outline",
    });
    check(!setBySelector.isError && /value="via selector"/.test(setBySelector.text), "act set by selector, value read back in the after-state");

    const pressByRef = await mcp.call("act", { steps: [{ do: "invoke", target: { ref: buttonRef }, action: "press" }], after: "outline" });
    await sleep(300);
    check(!pressByRef.isError && formLog().includes("clicked:via selector"), `act invoke press by ref: form logged ${JSON.stringify(formLog())}`);

    const fg = await xa.App.foreground({ timeout: 0 }).catch(() => null);
    const button = await app.locator('button[name="Save smoke"]').element();
    const b = button.bounds;
    const w = (await app.windows())[0].bounds;
    const center = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    const inFront = fg?.pid === form.pid && windowPidAt(center.x, center.y) === form.pid;
    if (!inFront) {
      console.log(`skip input: the scratch window isn't in front (foreground pid ${fg?.pid}, form ${form.pid})`);
      failures += 1;
    } else {
      const scale = Number(imageSize[2]) / w.width;
      const point = { x: Math.round((center.x - w.x) * scale), y: Math.round((center.y - w.y) * scale) };
      const before = formLog().length;
      const click = await mcp.call("act", { steps: [{ do: "click", target: point }], after: "none" });
      await sleep(400);
      check(!click.isError && formLog().length === before + 1, `act click by image point (${point.x}, ${point.y}): ${click.text.split("\n")[0]}`);

      const typed = await mcp.call("act", {
        steps: [
          { do: "set", target: { ref: fieldRef }, value: "" },
          { do: "type", target: { ref: fieldRef }, text: "hello smoke" },
        ],
        after: "outline",
      });
      check(!typed.isError && /value="hello smoke"/.test(typed.text), `act type into the field, read back: ${/value="[^"]*"/.exec(typed.text)?.[0]}`);

      const long = "abcdefghij".repeat(30);
      await mcp.call("act", { steps: [{ do: "set", target: { ref: fieldRef }, value: "" }], after: "none" });
      const pending = mcp.call("act", { steps: [{ do: "type", target: { ref: fieldRef }, text: long }], after: "outline" });
      let pressed = false;
      for (let i = 0; i < 40 && !pressed; i++) {
        await sleep(50);
        const state = await pill();
        if (state && !state.hidden && state.button === "Stop" && i >= 4) pressed = await pressPillButton("Stop");
      }
      const stopped = await pending;
      const value = (await app.locator("text_field").element()).value ?? "";
      check(pressed, "pressed Stop in the pill over CDP while typing");
      check(stopped.isError && /The user pressed Stop/.test(stopped.text), `typing batch reported: ${stopped.text.split("\n")[0]}`);
      check(value.length > 0 && value.length < long.length && long.startsWith(value), `typing halted mid-text: ${value.length} of ${long.length} characters in the field`);
      await sleep(500);
      check(((await app.locator("text_field").element()).value ?? "").length === value.length, "nothing typed after Stop");

      const refused = await mcp.call("act", { steps: [{ do: "invoke", target: { ref: buttonRef }, action: "press" }] });
      check(refused.isError && /press Resume/.test(refused.text), `next act refused: ${refused.text.slice(0, 70)}…`);
      const stoppedPill = await pill();
      check(stoppedPill?.button === "Resume" && /stopped/i.test(stoppedPill.text), `pill shows ${JSON.stringify(stoppedPill?.text)}`);
      check(await pressPillButton("Resume"), "pressed Resume over CDP");
      await sleep(300);
      const after = await mcp.call("act", { steps: [{ do: "invoke", target: { ref: buttonRef }, action: "press" }], after: "none" });
      check(!after.isError, "act works again after Resume");
    }

    const observeMs = [];
    const actMs = [];
    for (let i = 0; i < runs; i++) observeMs.push((await mcp.call("observe", { win: formRef })).ms);
    for (let i = 0; i < runs; i++) {
      actMs.push((await mcp.call("act", { steps: [{ do: "set", target: { ref: fieldRef }, value: `run ${i}` }], after: "full" })).ms);
    }
    await mcp.call("act", { steps: [{ do: "wait", timeout_ms: 1 }], after: "none", release: true });
    console.log(`observe ms over ${runs} runs: ${observeMs.map((m) => m.toFixed(0)).join(", ")} (median ${median(observeMs).toFixed(0)})`);
    console.log(`act (set + full after-state) ms over ${runs} runs: ${actMs.map((m) => m.toFixed(0)).join(", ")} (median ${median(actMs).toFixed(0)})`);
  } finally {
    form.kill();
    mcp.child.kill();
    fs.rmSync(work, { recursive: true, force: true });
  }
}

main().then(
  () => {
    console.log(failures ? `${failures} check(s) failed` : "all checks passed");
    process.exitCode = failures ? 1 : 0;
  },
  (error) => {
    console.error(error);
    process.exitCode = 1;
  },
);
