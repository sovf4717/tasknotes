const http = require("http");

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9224" + path, { timeout: 3000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve(d ? [] : []);
        }
      });
    }).on("error", reject);
  });
}

class Cdp {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 0;
    this.pending = new Map();
    this.consoleEvents = [];
    this.exceptions = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      const WebSocket = require("ws");
      this.ws = new WebSocket(this.wsUrl);
      this.ws.on("open", () => {
        this.ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
        this.ws.send(JSON.stringify({ id: 2, method: "Console.enable" }));
        this.ws.send(JSON.stringify({ id: 3, method: "Log.enable" }));
        this.ws.on("message", (raw) => {
          const msg = JSON.parse(raw.toString());
          if (msg.id && this.pending.has(msg.id)) {
            const p = this.pending.get(msg.id);
            this.pending.delete(msg.id);
            p(msg);
          } else if (msg.method === "Runtime.consoleAPICalled") {
            this.consoleEvents.push(msg);
          } else if (msg.method === "Runtime.exceptionThrown") {
            this.exceptions.push(msg);
          } else if (msg.method === "Log.entryAdded") {
            const e = msg.params.entry;
            this.consoleEvents.push({ source: "log", level: e.level, text: e.text });
          }
        });
        this.ws.on("error", reject);
        resolve();
      });
      this.ws.on("error", reject);
    });
  }
  send(method, params) {
    this.id += 1;
    const id = this.id;
    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.ws.send(JSON.stringify({ id, method, params: params || {} }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ error: "timeout" });
        }
      }, 20000);
    });
  }
  async evaluate(expr, awaitPromise) {
    const r = await this.send("Runtime.evaluate", {
      expression: expr,
      returnByValue: true,
      awaitPromise: Boolean(awaitPromise),
    });
    return r.result ? r.result.result : r;
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

(async () => {
  // Wait for the main app page; starter.html disappears once the vault page opens.
  let target = null;
  for (let i = 0; i < 45; i++) {
    const list = await getJson("/json/list");
    target =
      list.find((t) => t.type === "page" && /obsidian\\.md/.test(t.url || "") && !/starter\\.html/.test(t.url)) ||
      list.find((t) => t.type === "page" && !/about:blank|starter\\.html/.test(t.url || ""));
    if (target && /obsidian\\.md/.test(target.url || "") && !/starter\\.html/.test(target.url)) break;
    await sleep(2000);
  }
  if (!target) {
    console.log("NO PAGE TARGET");
    process.exit(1);
  }
  console.log("TARGET:", target.url);
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.connect();

  // Wait for the app to be ready (window.app)
  let vaultPath = "";
  for (let i = 0; i < 30; i++) {
    const r = await cdp.evaluate(
      "window.app && window.app.vault && window.app.vault.adapter ? window.app.vault.adapter.basePath : null"
    );
    vaultPath = r && r.value ? String(r.value) : "";
    if (vaultPath) break;
    await sleep(2000);
  }
  console.log("VAULT:", vaultPath);
  const norm = (p) => p.replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "");
  const expected = norm("E:\\tasknotes\\.cecli\\temp\\repro-vault");
  if (!vaultPath || norm(vaultPath) !== expected) {
    console.log("VAULT MISMATCH - refusing to proceed");
    process.exit(2);
  }

  // Handle the trust-vault dialog if present
  for (let i = 0; i < 20; i++) {
    const trusted = await cdp.evaluate(
      "document.body.innerText.includes('Trust this vault') ? 'dialog' : document.body.innerText.includes('File Explorer') || document.body.querySelector('.workspace') ? 'ready' : 'loading'"
    );
    if (trusted.value === "dialog") {
      const clicked = await cdp.evaluate(
        "(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>/Trust this vault/i.test(x.textContent));if(b){b.click();return true}return false})()"
      );
      console.log("Clicked trust dialog:", clicked.value);
      await sleep(5000);
    } else if (trusted.value === "ready") break;
    await sleep(2000);
  }

  await cdp.evaluate("window.__tasknotesErrors = []");
  // Open the base file directly
  const opened = await cdp.evaluate(
"(()=>{if(!window.app||!window.app.workspace)return 'no-app';window.app.workspace.openLinkText('TaskNotes/Views/agenda-default.base','','');return 'sent'})()"
  );
  console.log("openLinkText:", opened.value);
  await sleep(12000);

  const state = await cdp.evaluate(
    "(()=>{const r={};const el=document.querySelector('.tn-bases-error')||[...document.querySelectorAll('.error-container, .mod-error')].find(x=>/loading|error/i.test(x.textContent));r.errorBox = el ? el.textContent : null;const bases=document.querySelectorAll('.bases-view, .tasknotes-container');r.basesEls=bases.length;return JSON.stringify(r)})()",
    false
  );
  console.log("STATE:", state.value || JSON.stringify(state));

  const relevant = cdp.consoleEvents
    .filter((e) => {
      const txt = JSON.stringify(e);
      return /TaskNotes|bases|agenda|error|uncaught|TypeError|error loading/i.test(txt);
    })
    .slice(0, 40)
    .map((e) => {
      if (e.params && e.params.args) {
        return (e.level || "log") + " | " + e.params.args.map((a) => a.value !== undefined ? a.value : a.description || a.type).join(" ").slice(0, 400);
      }
      return (e.level || "log") + " | " + String(e.text || "").slice(0, 400);
    });
  console.log("=== CONSOLE (filtered) ===");
  console.log(relevant.join("\n") || "(none)");
  console.log("=== EXCEPTIONS ===");
  for (const ex of cdp.exceptions.slice(0, 10)) {
    const d = ex.params.exceptionDetails;
    console.log((d.exception && d.exception.description ? d.exception.description : d.text || "").slice(0, 800));
    if (d.stackTrace) console.log("  STACK:", d.stackTrace.callFrames.slice(0, 8).map((f) => f.functionName + " @ " + f.url.split("/").pop() + ":" + f.lineNumber).join("; "));
  }
  // Also read the last render error box content directly
  const errText = await cdp.evaluate(
    "(()=>{const els=[...document.querySelectorAll('div')].filter(x=>/Error loading calendar/i.test(x.textContent||'')&&x.children.length===0);return els.length?els[0].textContent:'NO_ERROR_BOX'})()"
  );
  console.log("ERROR BOX:", errText.value || JSON.stringify(errText));
  cdp.ws.close();
  process.exit(0);
})().catch((e) => {
  console.error("SCRIPT ERROR", e);
  process.exit(1);
});