const http = require("http"), fs = require("fs"), path = require("path"), cp = require("child_process");
const root = __dirname, port = 8000, page = "index.html";
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".json": "application/json", ".pdf": "application/pdf", ".mp4": "video/mp4", ".webm": "video/webm" };
const url = "http://localhost:" + port + "/";
http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split("?")[0]);
  if (p === "/") p = "/" + page;
  const f = path.join(root, p);
  if (!f.startsWith(root + path.sep)) { r.writeHead(403); return r.end(); }
  fs.stat(f, (e, st) => {
    if (e || !st.isFile()) { r.writeHead(404); return r.end("not found"); }
    const type = types[path.extname(f)] || "application/octet-stream";
    const m = /^bytes=(\d*)-(\d*)$/.exec(q.headers.range || "");
    let start = 0, end = st.size - 1, code = 200;
    if (m && (m[1] || m[2])) {
      if (m[1]) { start = +m[1]; if (m[2]) end = Math.min(+m[2], st.size - 1); }
      else { start = Math.max(0, st.size - +m[2]); }
      if (start > end || start >= st.size) { r.writeHead(416, { "Content-Range": "bytes */" + st.size }); return r.end(); }
      code = 206;
    }
    const h = { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 };
    if (code === 206) h["Content-Range"] = "bytes " + start + "-" + end + "/" + st.size;
    r.writeHead(code, h);
    const s = fs.createReadStream(f, { start, end });
    s.on("error", () => r.destroy());
    r.on("close", () => s.destroy());
    s.pipe(r);
  });
}).listen(port, "127.0.0.1", () => {
  console.log("Running: " + url + "  (close this window to stop)");
  cp.exec('start "" "' + url + '"');
}).on("error", () => {
  console.log("Port " + port + " is already in use. If the server is already running, just open " + url);
  cp.exec('start "" "' + url + '"');
});
