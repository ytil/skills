// Tiny receiver for browser-captured video frames (see references/download-fallbacks.md).
// The page POSTs a canvas dataURL to http://localhost:8765/?name=<basename>; the frame is
// written to <outdir>/<basename>.jpg. Keeps base64 payloads out of the agent context.
//
// Usage: node shot-server.mjs <outdir>   (run in background; stop by killing port 8765)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";

const OUT = process.argv[2] || "./browser-shots";
fs.mkdirSync(OUT, { recursive: true });

http.createServer((req, res) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "*");
    if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
    }
    if (req.method !== "POST") {
        res.writeHead(405);
        res.end();
        return;
    }
    const name = (
        new URL(req.url, "http://x").searchParams.get("name") || "shot"
    ).replace(/[^\w.-]/g, "_");
    let body = "";
    req.on("data", (ch) => {
        body += ch;
    });
    req.on("end", () => {
        const b64 = body.replace(/^data:image\/\w+;base64,/, "");
        const file = path.join(OUT, name + ".jpg");
        fs.writeFileSync(file, Buffer.from(b64, "base64"));
        console.log("saved", file, fs.statSync(file).size);
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("ok " + file);
    });
}).listen(8765, () => console.log("shot-server listening on 8765 ->", OUT));
