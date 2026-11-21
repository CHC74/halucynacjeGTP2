#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Eksporter paczki serwerowej pod Exaroton (NeoForge 1.21.1)
 *
 * Czyta manifesty `packwiz/mods/*.pw.toml`, odfiltrowuje mody czysto klienckie
 * (`side = "client"`), pilnuje budżetu modów (<= 115) i buduje gotowy katalog /
 * archiwum serwerowe (`mods/`, `config/`, `kubejs/`).
 *
 * Użycie:
 *   node scripts/export_server_pack.mjs --dry-run   # szybka walidacja w CI (bez pobierania .jar)
 *   node scripts/export_server_pack.mjs             # pełny eksport + pobranie .jar z Modrinth + zip
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PACKWIZ_DIR = path.resolve('packwiz');
const MODS_DIR = path.join(PACKWIZ_DIR, 'mods');
const DIST_DIR = path.resolve('dist');
const SERVER_STAGE_DIR = path.join(DIST_DIR, 'exaroton-server');
const DRY_RUN = process.argv.includes('--dry-run');
const MAX_MOD_BUDGET = 115;

// Mody czysto klienckie, które NIGDY nie mogą trafić na serwer Exaroton (AGENTS.md)
const CLIENT_ONLY_GUARD = new Set([
  'sodium',
  'entityculling',
  'xaeros-minimap',
  'xaeros-world-map',
  'mouse-tweaks',
  'controlling',
  'configured',
  'iris'
]);

// Minimalny parser kluczowych pól z plików `packwiz` (*.pw.toml)
function parsePwToml(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const get = (regex) => {
    const m = txt.match(regex);
    return m ? m[1] : null;
  };
  return {
    file: path.basename(filePath),
    slug: path.basename(filePath, '.pw.toml'),
    name: get(/^name\s*=\s*"([^"]+)"/m),
    filename: get(/^filename\s*=\s*"([^"]+)"/m),
    side: get(/^side\s*=\s*"([^"]+)"/m) || 'both',
    mode: get(/^mode\s*=\s*"([^"]+)"/m) || 'url',
    url: get(/^url\s*=\s*"([^"]+)"/m),
    hashFormat: get(/^hash-format\s*=\s*"([^"]+)"/m),
    hash: get(/^hash\s*=\s*"([^"]+)"/m)
  };
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

if (errors.length > 0) {
  console.error('❌ Walidacja paczki Exaroton NIE POWIODŁA SIĘ:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✅ Bilans packwiz OK: ${mods.length} modów łącznie (limit ${MAX_MOD_BUDGET}) — serwer Exaroton: ${serverMods.length}, tylko klient: ${clientOnly.length}.`
);
console.log(
  `   Wykluczone z serwera (client-only): ${clientOnly.map((m) => m.slug).join(', ') || '(brak)'}`
);

if (DRY_RUN) {
  const cfMetadata = serverMods.filter((m) => m.mode === 'metadata:curseforge');
  if (cfMetadata.length > 0) {
    console.log(
      `   Uwaga: ${cfMetadata.length} modów z CurseForge (metadata:curseforge) — do pobrania przez packwiz-installer-bootstrap.jar na Exaroton.`
    );
  }
  console.log('✅ Tryb --dry-run zakończony pomyślnie.');
  process.exit(0);
}

// Pełny eksport serwerowy (pobieranie modów z bezpośrednim URL + pakowanie config/ i kubejs/)
fs.rmSync(SERVER_STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(SERVER_STAGE_DIR, 'mods'), { recursive: true });

let downloaded = 0;
const manualCurseforge = [];

for (const mod of serverMods) {
  if (mod.url && mod.filename) {
    const res = await fetch(mod.url, {
      headers: { 'User-Agent': 'halucynacjeGTP2-exaroton-exporter/1.0' }
    });
    if (!res.ok) {
      throw new Error(`Nie udało się pobrać ${mod.filename} (${res.status} ${res.statusText})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (mod.hash && mod.hashFormat) {
      const algo = mod.hashFormat.toLowerCase();
      const digest = crypto.createHash(algo).update(buf).digest('hex');
      if (digest !== mod.hash.toLowerCase()) {
        throw new Error(`Niezgodny hash ${algo} dla ${mod.filename}!`);
      }
    }
    fs.writeFileSync(path.join(SERVER_STAGE_DIR, 'mods', mod.filename), buf);
    downloaded++;
  } else {
    manualCurseforge.push({ slug: mod.slug, name: mod.name, filename: mod.filename, mode: mod.mode });
  }
}

for (const folder of ['config', 'kubejs']) {
  if (fs.existsSync(folder)) {
    fs.cpSync(folder, path.join(SERVER_STAGE_DIR, folder), { recursive: true });
  }
}

fs.writeFileSync(
  path.join(SERVER_STAGE_DIR, 'EXAROTON_MANIFEST.json'),
  JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      total_pack_mods: mods.length,
      server_mods_total: serverMods.length,
      downloaded_direct_jars: downloaded,
      client_only_excluded: clientOnly.map((m) => m.slug),
      curseforge_installer_mods: manualCurseforge
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

console.log(`📦 Wyeksportowano paczkę serwerową Exaroton: ${zipOut} (${downloaded} .jar pobranych bezpośrednio, ${manualCurseforge.length} przez packwiz-installer).`);
