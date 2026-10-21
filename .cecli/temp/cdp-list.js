const http = require("http");
http.get("http://127.0.0.1:9222/json/list", { timeout: 2000 }, (r) => {
  let d = "";
  r.on("data", (c) => (d += c));
  r.on("end", () => {
    try {
      const a = JSON.parse(d);
      for (const t of a) {
        if (t.type === "page") console.log("PAGE:", t.title, "|", t.url.slice(0, 200));
      }
    } catch (e) {
      console.log(d.slice(0, 2000));
    }
  });
}).on("error", (e) => console.log("ERR", e.message));