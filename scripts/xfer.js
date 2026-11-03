// TEMPORARY migration helper: pull a volume dump from the source service into /data/profiles.
import { writeFileSync, readdirSync, statSync, readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";

const url = process.env.XFER_URL || "https://camofox-browser-production-0784.up.railway.app/dump.tgz";
const dest = process.env.XFER_DEST || "/data/profiles";

const r = await fetch(url);
console.log("XFER status", r.status);
if (!r.ok) { console.log("XFER failed"); process.exit(2); }
const b = Buffer.from(await r.arrayBuffer());
writeFileSync("/tmp/dump.tgz", b);
console.log("XFER got", b.length);
execSync(`cd ${dest} && tar xzf /tmp/dump.tgz`);

function walk(dir, base = dir, out = {}) {
  for (const n of readdirSync(dir)) {
    const p = dir + "/" + n;
    if (statSync(p).isDirectory()) walk(p, base, out);
    else out[p.slice(base.length + 1)] = createHash("sha256").update(readFileSync(p)).digest("hex");
  }
  return out;
}
const sums = walk(dest);
console.log("XFER SUMS " + JSON.stringify(sums));

const port = Number(process.env.PORT || 9377);
createServer((q, s) => {
  if (q.url === "/sha") { s.writeHead(200, { "content-type": "application/json" }); s.end(JSON.stringify(sums)); }
  else { s.writeHead(200, { "content-type": "text/plain" }); s.end("ok"); }
}).listen(port, "0.0.0.0", () => console.log("XFER serving on", port));
