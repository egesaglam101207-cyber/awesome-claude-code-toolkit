#!/usr/bin/env node
// Şase Bulma Programı — yerel sunucu + CORS proxy'si.
//
// Neden gerekli: uygulama tamamen tarayıcı tarafında çalışır ve parça
// kataloğu API'sini doğrudan çağırır. API tarayıcı çağrılarına CORS izni
// vermiyorsa bu istek engellenir. Bu betik uygulamayı localhost'tan servis
// eder ve /api/ altındaki istekleri sunucu tarafından API'ye iletir —
// böylece istek tarayıcı açısından aynı kaynaklı (same-origin) olur ve
// CORS sorunu ortadan kalkar.
//
// API anahtarı bu dosyada TUTULMAZ: tarayıcıdaki localStorage'dan gelen
// x-rapidapi-key başlığı olduğu gibi iletilir.
//
// Kullanım:
//   node tools/serve.mjs            # http://localhost:8080
//   PORT=3000 node tools/serve.mjs

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PORT = Number(process.env.PORT) || 8080;
const API_HOST = "auto-parts-catalog.p.rapidapi.com";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
};

async function handleApi(req, res, url) {
  const endpoint = url.pathname.replace(/^\/api\//, "");
  const key = req.headers["x-rapidapi-key"];

  if (!key) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "x-rapidapi-key başlığı yok." }));
    return;
  }

  const target = `https://${API_HOST}/${endpoint}${url.search}`;

  try {
    const upstream = await fetch(target, {
      headers: { "x-rapidapi-key": key, "x-rapidapi-host": API_HOST },
    });
    const body = await upstream.text();
    res.writeHead(upstream.status, {
      "content-type": upstream.headers.get("content-type") || "application/json",
      "access-control-allow-origin": "*",
    });
    res.end(body);
    console.log(`[api] ${upstream.status} ${endpoint}`);
  } catch (e) {
    res.writeHead(502, { "content-type": "application/json", "access-control-allow-origin": "*" });
    res.end(JSON.stringify({ error: "API'ye ulaşılamadı: " + e.message }));
    console.error(`[api] HATA ${endpoint}: ${e.message}`);
  }
}

async function handleStatic(req, res, url) {
  const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  // Dizin dışına çıkmayı engelle
  const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
  const file = join(ROOT, safe);

  if (!file.startsWith(ROOT)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const data = await readFile(file);
    res.writeHead(200, { "content-type": MIME[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Bulunamadı: " + safe);
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-rapidapi-key, x-rapidapi-host, content-type",
    });
    res.end();
    return;
  }

  if (url.pathname.startsWith("/api/")) await handleApi(req, res, url);
  else await handleStatic(req, res, url);
}).listen(PORT, () => {
  console.log(`Şase Bulma Programı çalışıyor:  http://localhost:${PORT}`);
  console.log(`API istekleri /api/ üzerinden ${API_HOST} adresine iletiliyor.`);
  console.log("API anahtarınızı sayfadaki 🔑 panelinden girin (bu betikte saklanmaz).");
});
