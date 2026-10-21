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
  const target = list.find((t) => t.type === "page");
  if (!target) {
    console.log("NO TARGET");
    process.exit(1);
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.on("message", (raw) => {
    const msg = JSON.parse(raw.toString());
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params) => {
    id += 1;
    const myId = id;
    return new Promise((resolve) => {
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params: params || {} }));
      setTimeout(() => pending.delete(myId), 15000);
    });
  };
  await new Promise((r) => ws.on("open", r));

  for (let round = 0; round < 6; round++) {
    const r = await send("Runtime.evaluate", {
      expression:
        "(()=>{const t=(document.body&&document.body.innerText||'').slice(0,800);const btns=[...document.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,20);const hasApp=!!window.app;return JSON.stringify({url:location.href,hasApp,text:t,btns})})()",
      returnByValue: true,
    });
    const val = r && r.result && r.result.result ? r.result.result.value : JSON.stringify(r).slice(0, 300);
    console.log("ROUND", round, val);
    const parsed = (() => {
      try {
        return JSON.parse(val);
      } catch (e) {
        return null;
      }
    })();
    if (parsed) {
      if (parsed.hasApp) {
        console.log("APP READY at", parsed.url);
        break;
      }
      if (/Trust this vault/i.test(parsed.text) || parsed.btns.some((b) => /trust/i.test(b))) {
        const c = await send("Runtime.evaluate", {
          expression:
            "(()=>{const b=[...document.querySelectorAll('button')].find(x=>/Trust this vault/i.test(x.textContent));if(b){b.click();return 'clicked'}return 'not-found'})()",
          returnByValue: true,
        });
        console.log("TRUST CLICK:", c && c.result && c.result.result ? c.result.result.value : JSON.stringify(c));
        await sleep(8000);
        continue;
      }
      if (/open (folder|vault|new)/i.test(parsed.text) && parsed.url.includes("starter")) {
        // Starter page waiting for a vault pick; click the folder we seeded via obsidian.json may be needed.
        const c = await send("Runtime.evaluate", {
          expression:
            "(()=>{const els=[...document.querySelectorAll('.vault-item, [data-tracker-item], button, .clickable-ribbon')].map(e=>e.textContent.trim()).filter(Boolean);return JSON.stringify(els.slice(0,15))})()",
          returnByValue: true,
        });
        console.log("STARTER ITEMS:", c && c.result && c.result.result ? c.result.result.value : JSON.stringify(c));
      }
    }
    await sleep(6000);
  }
  ws.close();
  process.exit(0);
})().catch((e) => {
  console.error("PROBE ERROR", e);
  process.exit(1);
});