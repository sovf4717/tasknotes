const http = require("http");
function get(path) {
  return new Promise((resolve) => {
    http.get("http://127.0.0.1:9222" + path, { timeout: 2000 }, (r) => {
      let d = "";
      r.on("data", (c) => (d += c));
      r.on("end", () => resolve(d));
    }).on("error", (e) => resolve("ERR " + e.message));
  });
}
(async () => {
  console.log("=== /json/version");
  console.log((await get("/json/version")).slice(0, 500));
  console.log("=== /json");
  console.log((await get("/json")).slice(0, 1500));
})();