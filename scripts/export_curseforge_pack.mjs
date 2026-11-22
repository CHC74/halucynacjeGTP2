#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Eksporter natywnej paczki klienckiej dla CurseForge App (NeoForge 1.21.1)
 *
 * Czyta `packwiz/pack.toml` oraz wszystkie manifesty `packwiz/mods/*.pw.toml`,
 * wybiera mody klienckie (`side = "both"` oraz `side = "client"`, wykluczając `side = "server"`)
 * i buduje kompletne archiwum zgodne ze standardem CurseForge App (`Create Custom Profile -> Import`):
 *   - `manifest.json`      (NeoForge `21.1.267` / MC `1.21.1` + natywne wpisy `files[]` dla modów CurseForge)
 *   - `modlist.html`       (czytelny wykaz wszystkich 65 modów z linkami do źródeł)
 *   - `overrides/mods/`           (pobrane i zweryfikowane hashami pliki `.jar` dla modów spoza CurseForge / Modrinth)
 *   - `overrides/config/`         (w tym 3 binarne wyspy `.nbt`, SkyblockBuilder, FTB Quests/Chunks/Essentials, ekonomia)
 *   - `overrides/defaultconfigs/` (konfiguracje per-świat NeoForge kopiowane do `world/serverconfig/`, np. Sophisticated Storage)
 *   - `overrides/kubejs/`         (skrypty progresji, Żetony Etapów, polskie tłumaczenia i tekstury)
 *
 * Użycie:
 *   node scripts/export_curseforge_pack.mjs --dry-run   # szybka walidacja w CI (bez pobierania .jar)
 *   node scripts/export_curseforge_pack.mjs             # pełny eksport `dist/halucynacjeGTP2-curseforge.zip`
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const PACKWIZ_DIR = path.resolve('packwiz');
const PACK_TOML_PATH = path.join(PACKWIZ_DIR, 'pack.toml');
const MODS_DIR = path.join(PACKWIZ_DIR, 'mods');
const DIST_DIR = path.resolve('dist');
const STAGE_DIR = path.join(DIST_DIR, 'curseforge-client');
const ZIP_OUT = path.join(DIST_DIR, 'halucynacjeGTP2-curseforge.zip');

const DRY_RUN = process.argv.includes('--dry-run');
const MAX_MOD_BUDGET = 115;
const CONCURRENCY = 6;
const MAX_RETRIES = 3;
const EXPECTED_MC_VERSION = '1.21.1';
const EXPECTED_NEOFORGE_LOADER = 'neoforge-21.1.267';
const DISPLAY_NAME = 'HalucynacjeGTP2 — Create Skyblock Tycoon';

const REQUIRED_OVERRIDE_FOLDERS = ['config', 'kubejs'];
const OPTIONAL_OVERRIDE_FOLDERS = ['defaultconfigs'];
const OVERRIDE_FOLDERS = [
  ...REQUIRED_OVERRIDE_FOLDERS,
  ...OPTIONAL_OVERRIDE_FOLDERS.filter((f) => fs.existsSync(path.resolve(f)))
];
const IGNORED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

const REQUIRED_OVERRIDE_ENTRIES = [
  'overrides/kubejs/startup_scripts/stage_tokens.js',
  'overrides/kubejs/assets/kubejs/lang/pl_pl.json',
  'overrides/kubejs/assets/kubejs/textures/item/stage_1_token.png',
  'overrides/kubejs/assets/kubejs/textures/item/stage_5_token.png',
  'overrides/config/carryon-common.toml',
  'overrides/config/ftbchunks-world.snbt',
  'overrides/config/ftbessentials.snbt',
  'overrides/config/ftbquests/quests/data.snbt',
  'overrides/config/jade/jade.json',
  'overrides/config/halucynacje_economy/prices.json',
  'overrides/config/lightmanscurrency/PersistentTraders.json',
  'overrides/config/lightmanscurrency-server.txt',
  'overrides/config/lightmanscurrency-common.txt',
  'overrides/config/shoppers-common.toml',
  'overrides/config/sophisticatedstorage-common.toml',
  'overrides/config/sophisticatedstorage-server.toml',
  'overrides/config/skyblockbuilder/dimensions.json5',
  'overrides/config/skyblockbuilder/templates.json5',
  'overrides/config/skyblockbuilder/starter_inventory.json5',
  'overrides/config/skyblockbuilder/templates/islands/starter_island.nbt',
  'overrides/config/skyblockbuilder/templates/spreads/market_island.nbt',
  'overrides/config/skyblockbuilder/templates/spreads/industrial_island.nbt'
];

function getArgValue(flag) {
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && idx + 1 < process.argv.length) {
    return process.argv[idx + 1];
  }
  return null;
}

function parsePackToml(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const getTop = (key) => {
    const m = txt.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'));
    return m ? m[1] : null;
  };
  const versionsSectionMatch = txt.match(/\[versions\]([\s\S]*?)(?:\n\[|$)/);
  const versionsBlock = versionsSectionMatch ? versionsSectionMatch[1] : '';
  const getVer = (key) => {
    const m = versionsBlock.match(new RegExp(`^${key}\\s*=\\s*"([^"]+)"`, 'm'));
    return m ? m[1] : null;
  };
  return {
    name: getTop('name'),
    author: getTop('author'),
    version: getTop('version'),
    minecraft: getVer('minecraft'),
    neoforge: getVer('neoforge')
  };
}

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
    name: get(/^name\s*=\s*"([^"]+)"/m) || path.basename(filePath, '.pw.toml'),
    filename: get(/^filename\s*=\s*"([^"]+)"/m),
    side: get(/^side\s*=\s*"([^"]+)"/m) || 'both',
    mode: get(/^mode\s*=\s*"([^"]+)"/m) || 'url',
    url: get(/^url\s*=\s*"([^"]+)"/m),
    hashFormat: get(/^hash-format\s*=\s*"([^"]+)"/m),
    hash: get(/^hash\s*=\s*"([^"]+)"/m),
    cfFileId: cfFileIdRaw ? Number.parseInt(cfFileIdRaw, 10) : null,
    cfProjectId: cfProjectIdRaw ? Number.parseInt(cfProjectIdRaw, 10) : null,
    modrinthId: get(/^mod-id\s*=\s*"([^"]+)"/m)
  };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function verifyBufferHash(buf, mod) {
  if (!mod.hash || !mod.hashFormat) {
    throw new Error(`Brak sumy kontrolnej (hash/hash-format) w manifeście ${mod.file}`);
  }
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
        headers: { 'User-Agent': 'halucynacjeGTP2-curseforge-exporter/1.0' }
      });
      if (res.ok) {
        return Buffer.from(await res.arrayBuffer());
      }
      lastError = new Error(`HTTP ${res.status} ${res.statusText} (${url})`);
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

function copyFilteredDir(srcDir, dstDir) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (IGNORED_BASENAMES.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyFilteredDir(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function buildModlistHtml(allClientMods) {
  const sorted = [...allClientMods].sort((a, b) => a.name.localeCompare(b.name, 'en'));
  const items = sorted.map((m) => {
    let href = null;
    let badge = '';
    if (m.mode === 'metadata:curseforge' && m.cfProjectId) {
      href = `https://www.curseforge.com/projects/${m.cfProjectId}`;
      badge = 'CurseForge';
    } else if (m.modrinthId) {
      href = `https://modrinth.com/mod/${m.modrinthId}`;
      badge = 'Modrinth (overrides/mods)';
    } else if (m.url) {
      href = m.url;
      badge = 'Direct (overrides/mods)';
    }
    const label = escapeHtml(m.name);
    const sideNote = m.side === 'client' ? ' [client-only]' : '';
    const link = href
      ? `<a href="${escapeHtml(href)}">${label}</a>`
      : label;
    return `  <li>${link} — <code>${escapeHtml(m.filename)}</code> (${escapeHtml(badge)}${escapeHtml(sideNote)})</li>`;
  });

  return [
    '<!DOCTYPE html>',
    '<html lang="pl">',
    '<head>',
    '  <meta charset="UTF-8">',
    `  <title>${escapeHtml(DISPLAY_NAME)} — Lista modów (${sorted.length})</title>`,
    '</head>',
    '<body>',
    `  <h1>${escapeHtml(DISPLAY_NAME)} (${sorted.length} modów)</h1>`,
    '  <ul>',
    ...items,
    '  </ul>',
    '</body>',
    '</html>',
    ''
  ].join('\n');
}

// --- 1. Odczyt pack.toml i manifestów *.pw.toml ---
if (!fs.existsSync(PACK_TOML_PATH)) {
  console.error(`❌ Brak pliku ${PACK_TOML_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(MODS_DIR)) {
  console.error('❌ Brak katalogu `packwiz/mods/`.');
  process.exit(1);
}

const packMeta = parsePackToml(PACK_TOML_PATH);
const packVersion = getArgValue('--version') || process.env.PACK_VERSION || packMeta.version || '1.0.0';
const modLoaderId = packMeta.neoforge ? `neoforge-${packMeta.neoforge}` : '';

const pwFiles = fs
  .readdirSync(MODS_DIR)
  .filter((f) => f.endsWith('.pw.toml'))
  .sort();

const allMods = pwFiles.map((f) => parsePwToml(path.join(MODS_DIR, f)));
const serverOnlyMods = allMods.filter((m) => m.side === 'server');
const clientMods = allMods.filter((m) => m.side === 'both' || m.side === 'client');

const cfNativeMods = [];
const directMods = [];
const errors = [];

if (allMods.length === 0) {
  errors.push('Brak jakichkolwiek plików `.pw.toml` w `packwiz/mods/`.');
}
if (allMods.length > MAX_MOD_BUDGET) {
  errors.push(`Przekroczono budżet modów Exaroton: ${allMods.length} > ${MAX_MOD_BUDGET}.`);
}
if (packMeta.minecraft !== EXPECTED_MC_VERSION) {
  errors.push(
    `Nieoczekiwana wersja Minecraft w packwiz/pack.toml: "${packMeta.minecraft}" (oczekiwano "${EXPECTED_MC_VERSION}").`
  );
}
if (modLoaderId !== EXPECTED_NEOFORGE_LOADER) {
  errors.push(
    `Nieoczekiwany modLoader NeoForge w packwiz/pack.toml: "${modLoaderId}" (oczekiwano "${EXPECTED_NEOFORGE_LOADER}").`
  );
}
if (!packMeta.author) {
  errors.push('Brak pola `author` w `packwiz/pack.toml`.');
}

for (const folder of REQUIRED_OVERRIDE_FOLDERS) {
  if (!fs.existsSync(path.resolve(folder))) {
    errors.push(`Brak wymaganego katalogu źródłowego: ${folder}/`);
  }
}

const seenFilenames = new Map();
const seenCfProjectIds = new Map();

for (const m of clientMods) {
  if (!m.filename || !m.filename.endsWith('.jar')) {
    errors.push(`Nieprawidłowe pole filename w ${m.file}: "${m.filename}"`);
  } else if (seenFilenames.has(m.filename)) {
    errors.push(
      `Duplikat pliku JAR "${m.filename}" w manifestach "${seenFilenames.get(m.filename)}" oraz "${m.file}"!`
    );
  } else {
    seenFilenames.set(m.filename, m.file);
  }

  if (m.mode === 'metadata:curseforge') {
    if (!Number.isInteger(m.cfProjectId) || m.cfProjectId <= 0) {
      errors.push(`Brak lub nieprawidłowy project-id CurseForge w ${m.file}`);
    }
    if (!Number.isInteger(m.cfFileId) || m.cfFileId <= 0) {
      errors.push(`Brak lub nieprawidłowy file-id CurseForge w ${m.file}`);
    }
    if (m.cfProjectId) {
      if (seenCfProjectIds.has(m.cfProjectId)) {
        errors.push(
          `Duplikat CurseForge projectID=${m.cfProjectId} w "${seenCfProjectIds.get(m.cfProjectId)}" oraz "${m.file}"!`
        );
      } else {
        seenCfProjectIds.set(m.cfProjectId, m.file);
      }
    }
    cfNativeMods.push(m);
  } else if (m.url) {
    if (!m.hash || !m.hashFormat) {
      errors.push(`Brak sumy kontrolnej (hash/hash-format) dla bezpośredniego moda ${m.file}`);
    }
    directMods.push(m);
  } else {
    errors.push(`Mod kliencki "${m.slug}" nie ma ani mode="metadata:curseforge", ani pola url!`);
  }
}

if (cfNativeMods.length + directMods.length !== clientMods.length) {
  errors.push(
    `Niezgodność podziału modów klienckich: ${cfNativeMods.length} CF + ${directMods.length} direct != ${clientMods.length} clientMods!`
  );
}

const manifest = {
  minecraft: {
    version: packMeta.minecraft,
    modLoaders: [
      {
        id: modLoaderId,
        primary: true
      }
    ]
  },
  manifestType: 'minecraftModpack',
  manifestVersion: 1,
  name: DISPLAY_NAME,
  version: packVersion,
  author: packMeta.author,
  files: cfNativeMods.map((m) => ({
    projectID: m.cfProjectId,
    fileID: m.cfFileId,
    required: true
  })),
  overrides: 'overrides'
};

if (manifest.files.length + directMods.length !== clientMods.length) {
  errors.push(
    `Niezgodność manifest.files (${manifest.files.length}) + directMods (${directMods.length}) != clientMods (${clientMods.length})!`
  );
}

if (errors.length > 0) {
  console.error('❌ Walidacja eksportu CurseForge App NIE POWIODŁA SIĘ:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

console.log(
  `✅ Bilans CurseForge App OK: ${clientMods.length}/${allMods.length} modów klienckich (wykluczono server-only: ${serverOnlyMods.length}) — ${manifest.files.length} natywnych wpisów CurseForge + ${directMods.length} bezpośrednich JAR-ów Modrinth w overrides/mods/.`
);
console.log(
  `   Platforma: Minecraft ${manifest.minecraft.version} | Loader: ${manifest.minecraft.modLoaders[0].id} | Wersja paczki: ${manifest.version}`
);

if (DRY_RUN) {
  console.log('✅ Tryb --dry-run zakończony pomyślnie (manifest.json + podział modów zweryfikowane bez pobierania JAR).');
  process.exit(0);
}

// --- 2. Pełny eksport: pobranie directMods do overrides/mods/ + skopiowanie config/ i kubejs/ ---
fs.rmSync(STAGE_DIR, { recursive: true, force: true });
fs.mkdirSync(path.join(STAGE_DIR, 'overrides', 'mods'), { recursive: true });
fs.mkdirSync(DIST_DIR, { recursive: true });

console.log(
  `⬇️  Pobieranie ${directMods.length}/${directMods.length} modów Modrinth do overrides/mods/ (współbieżność=${CONCURRENCY})...`
);

let downloadedCount = 0;
let downloadedBytes = 0;

await runPool(directMods, CONCURRENCY, async (mod) => {
  const buf = await fetchWithRetries(mod.url);
  verifyBufferHash(buf, mod);
  fs.writeFileSync(path.join(STAGE_DIR, 'overrides', 'mods', mod.filename), buf);
  downloadedCount++;
  downloadedBytes += buf.length;
});

if (downloadedCount !== directMods.length) {
  throw new Error(`Oczekiwano ${directMods.length} pobranych JAR-ów, pobrano ${downloadedCount}!`);
}

for (const folder of OVERRIDE_FOLDERS) {
  copyFilteredDir(path.resolve(folder), path.join(STAGE_DIR, 'overrides', folder));
}

fs.writeFileSync(path.join(STAGE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(STAGE_DIR, 'modlist.html'), buildModlistHtml(clientMods), 'utf8');

// --- 3. Pakowanie ZIP (ZIP_DEFLATED, ścieżki POSIX) + pełna weryfikacja CRC i zawartości ---
fs.rmSync(ZIP_OUT, { force: true });

const pyPackAndVerify = `
import json, os, sys, zipfile

stage_dir = sys.argv[1]
zip_out = sys.argv[2]
cfg = json.loads(sys.argv[3])

expected_cf_count = cfg["expected_cf_count"]
expected_direct_jars = cfg["expected_direct_jars"]
expected_total_client_mods = cfg["expected_total_client_mods"]
expected_mc = cfg["expected_mc"]
expected_loader = cfg["expected_loader"]
required_overrides = cfg["required_overrides"]

entries = []
for root, dirs, files in os.walk(stage_dir):
    dirs.sort()
    files.sort()
    for fname in files:
        full_path = os.path.join(root, fname)
        rel_posix = os.path.relpath(full_path, stage_dir).replace(os.sep, "/")
        entries.append((full_path, rel_posix))

entries.sort(key=lambda item: item[1])

with zipfile.ZipFile(zip_out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
    for full_path, arcname in entries:
        zout.write(full_path, arcname=arcname)

# Weryfikacja CRC, brak duplikatów, poprawność manifest.json, obecność overrides i wszystkich 50 JAR-ów
with zipfile.ZipFile(zip_out, "r") as zf:
    bad = zf.testzip()
    if bad is not None:
        raise SystemExit(f"Uszkodzony wpis CRC w CurseForge ZIP: {bad}")

    all_names = zf.namelist()
    if len(all_names) != len(set(all_names)):
        raise SystemExit("Wykryto zduplikowane wpisy w CurseForge ZIP!")

    for name in all_names:
        if "\\\\" in name or name.startswith("/") or name.startswith("./"):
            raise SystemExit(f"Nieprawidłowa ścieżka POSIX w ZIP: {name}")

    name_set = set(all_names)
    for req in ["manifest.json", "modlist.html"] + required_overrides:
        if req not in name_set:
            raise SystemExit(f"Brak wymaganego pliku w CurseForge ZIP: {req}")
        if zf.getinfo(req).file_size == 0:
            raise SystemExit(f"Wymagany plik w CurseForge ZIP jest pusty: {req}")

    manifest = json.loads(zf.read("manifest.json").decode("utf-8"))
    assert manifest.get("manifestType") == "minecraftModpack", "Nieprawidłowy manifestType"
    assert manifest.get("manifestVersion") == 1, "Nieprawidłowy manifestVersion"
    assert manifest.get("overrides") == "overrides", "Nieprawidłowe pole overrides"
    assert manifest.get("minecraft", {}).get("version") == expected_mc, "Nieprawidłowa wersja MC w manifest.json"
    loaders = manifest.get("minecraft", {}).get("modLoaders", [])
    assert len(loaders) == 1 and loaders[0].get("id") == expected_loader and loaders[0].get("primary") is True, "Nieprawidłowy modLoader w manifest.json"

    cf_files = manifest.get("files", [])
    assert len(cf_files) == expected_cf_count, f"Niezgodna liczba plików CF w manifest.json: {len(cf_files)} != {expected_cf_count}"
    seen_pids = set()
    for item in cf_files:
        assert isinstance(item.get("projectID"), int) and item["projectID"] > 0
        assert isinstance(item.get("fileID"), int) and item["fileID"] > 0
        assert item.get("required") is True
        assert item["projectID"] not in seen_pids, f"Duplikat projectID: {item['projectID']}"
        seen_pids.add(item["projectID"])

    embedded_jars = sorted(
        n for n in all_names
        if n.startswith("overrides/mods/") and n.endswith(".jar")
    )
    expected_jar_paths = sorted(f"overrides/mods/{fn}" for fn in expected_direct_jars)
    assert embedded_jars == expected_jar_paths, (
        f"Niezgodność listy JAR-ów w overrides/mods/: znaleziono {len(embedded_jars)}, oczekiwano {len(expected_jar_paths)}"
    )
    for jar_path in embedded_jars:
        assert zf.getinfo(jar_path).file_size > 0, f"Pusty JAR w overrides/mods/: {jar_path}"

    assert len(cf_files) + len(embedded_jars) == expected_total_client_mods, (
        f"Łączna liczba modów niezgodna: {len(cf_files)} + {len(embedded_jars)} != {expected_total_client_mods}"
    )

    print(json.dumps({
        "total_zip_entries": len(all_names),
        "cf_manifest_files": len(cf_files),
        "embedded_jars": len(embedded_jars),
        "total_client_mods": len(cf_files) + len(embedded_jars),
        "verified_required_overrides": len(required_overrides)
    }))
`;

const verifyStdout = execFileSync(
  'python3',
  [
    '-c',
    pyPackAndVerify,
    STAGE_DIR,
    ZIP_OUT,
    JSON.stringify({
      expected_cf_count: manifest.files.length,
      expected_direct_jars: directMods.map((m) => m.filename),
      expected_total_client_mods: clientMods.length,
      expected_mc: EXPECTED_MC_VERSION,
      expected_loader: EXPECTED_NEOFORGE_LOADER,
      required_overrides: REQUIRED_OVERRIDE_ENTRIES
    })
  ],
  { encoding: 'utf8' }
).trim();

const summary = JSON.parse(verifyStdout);
const zipSizeMb = (fs.statSync(ZIP_OUT).size / (1024 * 1024)).toFixed(2);
const dlSizeMb = (downloadedBytes / (1024 * 1024)).toFixed(2);

console.log(
  `📦 Wyeksportowano natywną paczkę CurseForge App: ${path.relative(process.cwd(), ZIP_OUT)} (${zipSizeMb} MB; pobrane JAR-y: ${dlSizeMb} MB)`
);
console.log(
  `✅ Zweryfikowano CRC i kompletność ZIP: ${summary.cf_manifest_files} natywnych wpisów CurseForge w manifest.json + ${summary.embedded_jars} zweryfikowanych JAR-ów w overrides/mods/ = ${summary.total_client_mods}/${clientMods.length} modów, ${summary.verified_required_overrides} krytycznych plików overrides/ (łącznie ${summary.total_zip_entries} wpisów ZIP).`
);
