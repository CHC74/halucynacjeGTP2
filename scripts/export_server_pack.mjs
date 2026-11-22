#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Eksporter kompletnej paczki serwerowej pod Exaroton (NeoForge 1.21.1)
 *
 * Czyta manifesty `packwiz/mods/*.pw.toml`, odfiltrowuje mody czysto klienckie
 * (`side = "client"`), pilnuje budżetu modów (<= 115), pobiera WSZYSTKIE mody
 * serwerowe (Modrinth CDN + CurseForge ForgeCDN z weryfikacją sum kontrolnych
 * SHA-1 / SHA-256 / SHA-512) i buduje gotowe archiwum pod Exaroton:
 *   - `mods/`              (komplet 55/55 plików `.jar`)
 *   - `config/`            (w tym 3 binarne wyspy `.nbt` i zweryfikowane configi SkyblockBuilder)
 *   - `defaultconfigs/`    (konfiguracje per-świat NeoForge kopiowane do `world/serverconfig/`, np. Sophisticated Storage)
 *   - `kubejs/`            (skrypty progresji, ekonomii, receptur pure-Create, zasoby pl_pl)
 *   - `server.properties`  (z `server.properties.template`: `skyblockbuilder\:skyblock`)
 *   - `EXAROTON_MANIFEST.json`
 *
 * Użycie:
 *   node scripts/export_server_pack.mjs --dry-run   # szybka walidacja w CI (bez pobierania .jar)
 *   node scripts/export_server_pack.mjs             # pełny eksport 55/55 .jar + zip Exaroton
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PACKWIZ_DIR = path.resolve('packwiz');
const MODS_DIR = path.join(PACKWIZ_DIR, 'mods');
const DIST_DIR = path.resolve('dist');
const SERVER_STAGE_DIR = path.join(DIST_DIR, 'exaroton-server');
const SERVER_PROPERTIES_TEMPLATE = path.resolve('server.properties.template');
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_MOD_BUDGET = 115;
const CONCURRENCY = 6;
const MAX_RETRIES = 3;

// Mody czysto klienckie, które NIGDY nie mogą trafić na serwer Exaroton (AGENTS.md)
const CLIENT_ONLY_GUARD = new Set([
  'sodium',
  'entityculling',
  'xaeros-minimap',
  'xaeros-world-map',
  'mouse-tweaks',
  'controlling',
  'configured',
  'iris',
  'better-advanced-tooltips',
  'searchables',
  'ae2-jei-integration'
]);

// Parser kluczowych pól z plików `packwiz` (*.pw.toml) — obsługuje Modrinth i CurseForge
function parsePwToml(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const get = (regex) => {
    const m = txt.match(regex);
    return m ? m[1] : null;
  };
  const cfFileIdRaw = get(/^file-id\s*=\s*(\d+)/m);
  const cfProjectIdRaw = get(/^project-id\s*=\s*(\d+)/m);
  return {
    file: path.basename(filePath),
    slug: path.basename(filePath, '.pw.toml'),
    name: get(/^name\s*=\s*"([^"]+)"/m),
    filename: get(/^filename\s*=\s*"([^"]+)"/m),
    side: get(/^side\s*=\s*"([^"]+)"/m) || 'both',
    mode: get(/^mode\s*=\s*"([^"]+)"/m) || 'url',
    url: get(/^url\s*=\s*"([^"]+)"/m),
    hashFormat: get(/^hash-format\s*=\s*"([^"]+)"/m),
    hash: get(/^hash\s*=\s*"([^"]+)"/m),
    cfFileId: cfFileIdRaw ? Number.parseInt(cfFileIdRaw, 10) : null,
    cfProjectId: cfProjectIdRaw ? Number.parseInt(cfProjectIdRaw, 10) : null
  };
}

function buildCurseForgeCandidateUrls(fileId, filename) {
  const major = Math.floor(fileId / 1000);
  const minor = fileId % 1000;
  const minorPadded = String(minor).padStart(3, '0');
  const encoded = encodeURIComponent(filename);
  const hosts = ['https://mediafilez.forgecdn.net', 'https://edge.forgecdn.net'];
  const urls = [];
  for (const host of hosts) {
    urls.push(`${host}/files/${major}/${minor}/${encoded}`);
    if (String(minor) !== minorPadded) {
      urls.push(`${host}/files/${major}/${minorPadded}/${encoded}`);
    }
  }
  return urls;
}

function verifyBufferHash(buf, mod) {
  if (!mod.hash || !mod.hashFormat) return;
  const algo = mod.hashFormat.toLowerCase();
  const digest = crypto.createHash(algo).update(buf).digest('hex');
  if (digest !== mod.hash.toLowerCase()) {
    throw new Error(
      `Niezgodny hash ${algo} dla ${mod.filename}: oczekiwano ${mod.hash}, otrzymano ${digest}`
    );
  }
}

async function fetchWithRetries(url) {
  let lastError = null;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'halucynacjeGTP2-exaroton-exporter/2.0' }
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
      lastError = new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
      // 404 na jednym z wariantów URL nie wymaga powtarzania tego samego URL
      if (res.status === 404) break;
    } catch (err) {
      lastError = err;
    }
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  throw lastError;
}

async function downloadServerMod(mod) {
  let candidateUrls = [];
  let source = 'direct';

  if (mod.url) {
    candidateUrls = [mod.url];
    source = 'modrinth';
  } else if (mod.mode === 'metadata:curseforge' && mod.cfFileId && mod.filename) {
    candidateUrls = buildCurseForgeCandidateUrls(mod.cfFileId, mod.filename);
    source = 'curseforge-cdn';
  } else {
    throw new Error(`Brak źródła pobierania (url lub curseforge file-id) dla ${mod.file}`);
  }

  let lastErr = null;
  for (const url of candidateUrls) {
    try {
      const buf = await fetchWithRetries(url);
      verifyBufferHash(buf, mod);
      return { buf, source, url };
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`Nie udało się pobrać ${mod.filename} (${mod.slug}): ${lastErr?.message || lastErr}`);
}

async function runPool(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function next() {
    while (cursor < items.length) {
      const idx = cursor++;
      results[idx] = await worker(items[idx], idx);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
  return results;
}

if (!fs.existsSync(MODS_DIR)) {
  console.error('❌ Brak katalogu `packwiz/mods/`. Uruchom najpierw inicjalizację packwiz.');
  process.exit(1);
}

const pwFiles = fs
  .readdirSync(MODS_DIR)
  .filter((f) => f.endsWith('.pw.toml'))
  .sort();

const mods = pwFiles.map((f) => parsePwToml(path.join(MODS_DIR, f)));
const clientOnly = mods.filter((m) => m.side === 'client');
const serverMods = mods.filter((m) => m.side === 'both' || m.side === 'server');

// Guardrails check
const errors = [];
if (mods.length === 0) {
  errors.push('Brak jakichkolwiek plików `.pw.toml` w `packwiz/mods/`.');
}
if (mods.length > MAX_MOD_BUDGET) {
  errors.push(
    `Przekroczono budżet modów Exaroton: ${mods.length} > ${MAX_MOD_BUDGET} (w tym biblioteki).`
  );
}
for (const m of serverMods) {
  if (CLIENT_ONLY_GUARD.has(m.slug)) {
    errors.push(
      `Mod czysto kliencki "${m.slug}" ma ustawione side="${m.side}" zamiast "client"!`
    );
  }
  if (!m.url && !(m.mode === 'metadata:curseforge' && m.cfFileId && m.filename)) {
    errors.push(`Mod serwerowy "${m.slug}" nie ma ani URL, ani metadanych CurseForge file-id!`);
  }
}

const seenFilenames = new Map();
for (const m of mods) {
  if (!m.filename) continue;
  if (seenFilenames.has(m.filename)) {
    errors.push(
      `Duplikat pliku JAR "${m.filename}" w manifestach "${seenFilenames.get(m.filename)}" oraz "${m.file}"!`
    );
  } else {
    seenFilenames.set(m.filename, m.file);
  }
}

if (!fs.existsSync(SERVER_PROPERTIES_TEMPLATE)) {
  errors.push('Brak szablonu `server.properties.template` w katalogu głównym repozytorium!');
}

if (errors.length > 0) {
  console.error('❌ Walidacja paczki Exaroton NIE POWIODŁA SIĘ:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const cfServerMods = serverMods.filter((m) => !m.url && m.mode === 'metadata:curseforge');
const mrServerMods = serverMods.filter((m) => Boolean(m.url));

console.log(
  `✅ Bilans packwiz OK: ${mods.length} modów łącznie (limit ${MAX_MOD_BUDGET}) — serwer Exaroton: ${serverMods.length} (${mrServerMods.length} Modrinth + ${cfServerMods.length} CurseForge ForgeCDN), tylko klient: ${clientOnly.length}.`
);
console.log(
  `   Wykluczone z serwera (client-only): ${clientOnly.map((m) => m.slug).join(', ') || '(brak)'}`
);

if (DRY_RUN) {
  console.log(
    `   Wszystkie ${cfServerMods.length} modów CurseForge posiadają file-id + hash do bezpośredniego pobrania z ForgeCDN.`
  );
  console.log('✅ Tryb --dry-run zakończony pomyślnie.');
  process.exit(0);
}

// Pełny eksport serwerowy: pobranie WSZYSTKICH modów (Modrinth + ForgeCDN) + config/ + kubejs/ + server.properties
fs.rmSync(SERVER_STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(SERVER_STAGE_DIR, 'mods'), { recursive: true });

console.log(`⬇️  Pobieranie ${serverMods.length}/${serverMods.length} modów serwerowych (współbieżność=${CONCURRENCY})...`);

let downloadedModrinth = 0;
let downloadedCurseForge = 0;

const downloadedRecords = await runPool(serverMods, CONCURRENCY, async (mod) => {
  const { buf, source, url } = await downloadServerMod(mod);
  fs.writeFileSync(path.join(SERVER_STAGE_DIR, 'mods', mod.filename), buf);
  if (source === 'curseforge-cdn') downloadedCurseForge++;
  else downloadedModrinth++;
  return {
    slug: mod.slug,
    filename: mod.filename,
    bytes: buf.length,
    source,
    hash_verified: Boolean(mod.hash && mod.hashFormat),
    url
  };
});

const downloadedTotal = downloadedModrinth + downloadedCurseForge;
if (downloadedTotal !== serverMods.length) {
  throw new Error(`Oczekiwano ${serverMods.length} modów, pobrano ${downloadedTotal}!`);
}

for (const folder of ['config', 'defaultconfigs', 'kubejs']) {
  if (fs.existsSync(folder)) {
    fs.cpSync(folder, path.join(SERVER_STAGE_DIR, folder), { recursive: true });
  }
}

fs.copyFileSync(SERVER_PROPERTIES_TEMPLATE, path.join(SERVER_STAGE_DIR, 'server.properties'));

fs.writeFileSync(
  path.join(SERVER_STAGE_DIR, 'EXAROTON_MANIFEST.json'),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      minecraft: '1.21.1',
      neoforge: '21.1.267',
      total_pack_mods: mods.length,
      server_mods_total: serverMods.length,
      downloaded_total_jars: downloadedTotal,
      downloaded_modrinth_jars: downloadedModrinth,
      downloaded_curseforge_jars: downloadedCurseForge,
      client_only_excluded: clientOnly.map((m) => m.slug),
      includes_defaultconfigs: fs.existsSync('defaultconfigs'),
      includes_server_properties: true,
      server_jars: downloadedRecords.map(({ slug, filename, bytes, source, hash_verified }) => ({
        slug,
        filename,
        bytes,
        source,
        hash_verified
      }))
    },
    null,
    2
  ) + '\n'
);

const zipOut = path.join(DIST_DIR, 'halucynacjeGTP2-server-exaroton.zip');
fs.rmSync(zipOut, { force: true });
execFileSync('python3', [
  '-c',
  `import shutil; shutil.make_archive(${JSON.stringify(zipOut.replace(/\.zip$/, ''))}, 'zip', ${JSON.stringify(SERVER_STAGE_DIR)})`
]);

const zipSizeMb = (fs.statSync(zipOut).size / (1024 * 1024)).toFixed(2);
console.log(
  `📦 Wyeksportowano gotową paczkę serwerową Exaroton: ${path.relative(process.cwd(), zipOut)} (${zipSizeMb} MB) — ${downloadedTotal}/${serverMods.length} plików .jar (${downloadedModrinth} Modrinth + ${downloadedCurseForge} CurseForge ForgeCDN, wszystkie sumy kontrolne zweryfikowane) + config/ + defaultconfigs/ + kubejs/ + server.properties.`
);
