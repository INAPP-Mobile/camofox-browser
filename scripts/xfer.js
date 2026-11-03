// TEMPORARY migration helper: pull a volume dump from the source service into /data/profiles.
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createServer } from "node:http";

const url = process.env.XFER_URL || "https://camofox-browser-production-0784.up.railway.app/dump.tgz";
const dest = process.env.XFER_DEST || "/data/profiles";

const r = await fetch(url);
console.log("XFER status", r.status);
if (!r.ok) { console.log("XFER failed"); process.exit(2); }
const b = Buffer.from(await r.arrayBuffer());
writeFileSync("/tmp/dump.tgz", b);
console.log("XFER got", b.length);
execSync(`cd ${dest} && tar xzf /tmp/dump.tgz`);
console.log("XFER extracted\n" + execSync(`ls -la ${dest}`).toString());

const port = Number(process.env.PORT || 9377);
createServer((_q, s) => { s.writeHead(200, { "content-type": "text/plain" }); s.end("ok"); })
  .listen(port, "0.0.0.0", () => console.log("XFER serving on", port));
