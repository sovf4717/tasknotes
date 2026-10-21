const http = require("http");
const WebSocket = require("ws");

function getJson(path) {
  return new Promise((resolve, reject) => {
    http.get("http://127.0.0.1:9224" + path, { timeout: 3000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => {
        try {
          resolve(JSON.parse(d));
        } catch (e) {
          resolve([]);
        }
      });
    }).on("error", reject);
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  const list = await getJson("/json/list");
  const target =
    list.find((t) => t.type === "page" && /obsidian\.md\/index/.test(t.url || "")) ||
    list.find((t) => t.type === "page" && !/about:blank|starter/.test(t.url || ""));
  if (!target) {
    console.log("NO TARGET");
    process.exit(1);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const errors = [];
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method === "Runtime.exceptionThrown") {
      errors.push(msg.params.exceptionDetails);
    }
  });
  const send = (method, params) => {
    id += 1;
    const myId = id;
    return new Promise((resolve) => {
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
      setTimeout(() => pending.delete(myId), 20000);
    });
  };
  await new Promise((r) => ws.on("open", r));
  send("Runtime.enable");

  const evalExpr = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, returnByValue: true });
    if (r && r.result && r.result.result) return r.result.result.value;
    return r;
  };

  // Wait for app
  for (let i = 0; i < 30; i++) {
    const hasApp = await evalExpr("!!window.app");
    if (hasApp) break;
    await sleep(2000);
  }

  // Helper: open a diary file, then report visible dates of its embedded agenda calendar
  const openDiary = async (file, expectedDate) => {
    await evalExpr("window.app.workspace.openLinkText('" + file + "','',''); 'ok'");
    // wait for the embed to create the calendar
    let visible = null;
    for (let i = 0; i < 40; i++) {
      await sleep(2500);
      visible = await evalExpr(
        "(()=>{const files=window.app.vault.getMarkdownFiles().filter(f=>f.path.endsWith('" +
          file +
          "'));const leaf=window.app.workspace.getLeavesOfType('markdown').find(l=>l.view&&l.view.file&&l.view.file.path==='" +
          file +
          "');if(!leaf)return 'no-leaf';const root=leaf.view.contentEl||leaf.view.containerEl;if(!root)return 'no-root';const cal=root.querySelector('.advanced-calendar-view .fc .fc-list, .advanced-calendar-view .fc');if(!cal)return 'no-cal';const days=[...cal.querySelectorAll('[data-date]')].map(d=>d.getAttribute('data-date')).filter(Boolean);const uniq=[...new Set(days)];return JSON.stringify({days:uniq.slice(0,10),title:(cal.querySelector('.fc-toolbar-title')||{}).textContent||''})})()"
      );
      if (visible && visible !== "no-leaf" && visible !== "no-root" && visible !== "no-cal") break;
    }
    console.log("== " + file + " (expect " + expectedDate + ")");
    console.log("   visible: " + visible);
    let ok = false;
    try {
      const days = JSON.parse(visible).days;
      ok = days.includes(expectedDate);
    } catch (e) {}
    console.log("   EXPECTED DATE VISIBLE: " + (ok ? "YES" : "NO"));
    return ok;
  };

  const r1 = await openDiary("sovf/日记/2026/10/2026-10-20.md", "2026-10-20");
  const r2 = await openDiary("sovf/日记/2026/10/2026-10-19.md", "2026-10-19");

  // Back to 10-20 to verify the second diary didn't drag the first
  const r3 = await openDiary("sovf/日记/2026/10/2026-10-20.md", "2026-10-20");

  console.log("== embedded results: " + JSON.stringify({ d20: r1, d19: r2, d20Again: r3 }));
  console.log("== uncaught exceptions: " + errors.length);
  for (const d of errors.slice(0, 5)) {
    console.log("   " + ((d.exception && d.exception.description) || d.text || "").slice(0, 400));
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error("SCRIPT ERROR", e);
  process.exit(1);
});