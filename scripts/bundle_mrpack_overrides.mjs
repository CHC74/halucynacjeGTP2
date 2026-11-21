#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Dołączanie overrides/ (config/ + kubejs/) do klienckiego .mrpack
 *
 * `packwiz mr export` uruchomiony z katalogu `packwiz/` pakuje wyłącznie `modrinth.index.json`
 * (manifest modów). Ten skrypt wstrzykuje katalogi `config/` oraz `kubejs/` z głównego
 * repozytorium do `overrides/config/` i `overrides/kubejs/` wewnątrz pliku `.mrpack`,
 * a następnie weryfikuje poprawność wynikowego archiwum ZIP.
 *
 * Dzięki temu klient (Prism Launcher / Modrinth App na PC i Mac M2) po samym imporcie `.mrpack`
 * od razu rejestruje `kubejs:stage_1..5_token`, ma polskie tłumaczenia, tekstury, konfiguracje
 * oraz questy — bez błędów niezgodności rejestru NeoForge przy łączeniu z serwerem Exaroton.
 *
 * Użycie:
 *   node scripts/bundle_mrpack_overrides.mjs [ścieżka_do_mrpack]
 *   (domyślnie: dist/halucynacjeGTP2.mrpack)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mrpackPath = path.resolve(process.argv[2] || 'dist/halucynacjeGTP2.mrpack');
const OVERRIDE_FOLDERS = ['config', 'kubejs'];
const IGNORED_BASENAMES = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep']);

const REQUIRED_ENTRIES = [
  'modrinth.index.json',
  'overrides/kubejs/startup_scripts/stage_tokens.js',
  'overrides/kubejs/assets/kubejs/lang/pl_pl.json',
  'overrides/kubejs/assets/kubejs/textures/item/stage_1_token.png',
  'overrides/kubejs/assets/kubejs/textures/item/stage_5_token.png',
  'overrides/config/carryon-common.toml',
  'overrides/config/ftbquests/quests/data.snbt',
  'overrides/config/halucynacje_economy/prices.json'
];

if (!fs.existsSync(mrpackPath)) {
  console.error(`❌ Nie znaleziono pliku .mrpack: ${mrpackPath}`);
  process.exit(1);
}

for (const folder of OVERRIDE_FOLDERS) {
  if (!fs.existsSync(path.resolve(folder))) {
    console.error(`❌ Brak wymaganego katalogu źródłowego: ${folder}/`);
    process.exit(1);
  }
}

function collectFiles(rootDir, baseDir = rootDir) {
  const results = [];
  for (const entry of fs.readdirSync(rootDir, { withFileTypes: true })) {
    if (IGNORED_BASENAMES.has(entry.name)) continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relPosix = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push({ fullPath, relPosix });
    }
  }
  return results.sort((a, b) => a.relPosix.localeCompare(b.relPosix));
}

const filesToInject = [];
for (const folder of OVERRIDE_FOLDERS) {
  const folderAbs = path.resolve(folder);
  for (const file of collectFiles(folderAbs, folderAbs)) {
    filesToInject.push({
      src: file.fullPath,
      arcname: `overrides/${folder}/${file.relPosix}`
    });
  }
}

const pyScript = `
import json, os, sys, zipfile

mrpack_path = sys.argv[1]
payload = json.loads(sys.argv[2])
files_to_inject = payload["files"]
required_entries = payload["required"]
override_prefixes = tuple(f"overrides/{folder}/" for folder in payload["folders"])

tmp_path = mrpack_path + ".tmp"
try:
    with zipfile.ZipFile(mrpack_path, "r") as zin:
        names = zin.namelist()
        if "modrinth.index.json" not in names:
            raise SystemExit("Brak modrinth.index.json w wejściowym .mrpack!")
        index_data = json.loads(zin.read("modrinth.index.json").decode("utf-8"))
        if not isinstance(index_data.get("files"), list):
            raise SystemExit("Nieprawidłowe pole 'files' w modrinth.index.json!")

        with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as zout:
            for item in zin.infolist():
                if item.filename.startswith(override_prefixes):
                    continue
                zout.writestr(item, zin.read(item.filename))

            for entry in files_to_inject:
                zout.write(entry["src"], arcname=entry["arcname"])

    os.replace(tmp_path, mrpack_path)

    # Pełna weryfikacja wynikowego .mrpack
    with zipfile.ZipFile(mrpack_path, "r") as zcheck:
        bad = zcheck.testzip()
        if bad is not None:
            raise SystemExit(f"Uszkodzony wpis ZIP: {bad}")

        all_names = zcheck.namelist()
        if len(all_names) != len(set(all_names)):
            raise SystemExit("Wykryto zduplikowane wpisy w archiwum .mrpack!")

        name_set = set(all_names)
        missing = [req for req in required_entries if req not in name_set]
        if missing:
            raise SystemExit("Brak wymaganych plików w .mrpack: " + ", ".join(missing))

        for req in required_entries:
            info = zcheck.getinfo(req)
            if info.file_size == 0:
                raise SystemExit(f"Wymagany plik w .mrpack jest pusty: {req}")

        verified_index = json.loads(zcheck.read("modrinth.index.json").decode("utf-8"))
        deps = verified_index.get("dependencies", {})
        print(json.dumps({
            "mod_entries": len(verified_index.get("files", [])),
            "injected_files": len(files_to_inject),
            "total_zip_entries": len(all_names),
            "minecraft": deps.get("minecraft"),
            "neoforge": deps.get("neoforge"),
            "verified_required": len(required_entries)
        }))
finally:
    if os.path.exists(tmp_path):
        os.remove(tmp_path)
`;

try {
  const stdout = execFileSync(
    'python3',
    [
      '-c',
      pyScript,
      mrpackPath,
      JSON.stringify({
        folders: OVERRIDE_FOLDERS,
        files: filesToInject,
        required: REQUIRED_ENTRIES
      })
    ],
    { encoding: 'utf8' }
  ).trim();

  const summary = JSON.parse(stdout);
  console.log(
    `✅ Dołączono overrides/ do ${path.relative(process.cwd(), mrpackPath)}: ${summary.injected_files} plików z config/ i kubejs/ (łącznie ${summary.total_zip_entries} wpisów ZIP, ${summary.mod_entries} wpisów modów w modrinth.index.json).`
  );
  console.log(
    `✅ Zweryfikowano ${summary.verified_required} kluczowych plików (MC ${summary.minecraft || '?'}, NeoForge ${summary.neoforge || '?'}, stage_tokens.js, pl_pl.json, tekstury, carryon-common.toml, FTB Quests, prices.json).`
  );
} catch (err) {
  console.error('❌ Błąd podczas dołączania overrides/ lub weryfikacji .mrpack:');
  if (err.stderr) console.error(err.stderr.toString().trim());
  else console.error(err.message);
  process.exit(1);
}
