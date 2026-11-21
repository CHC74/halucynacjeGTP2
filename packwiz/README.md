# `packwiz/` — Manifest paczki HalucynacjeGTP2 (NeoForge 1.21.1)

Ten katalog zawiera pełną, powtarzalną definicję modpacka **HalucynacjeGTP2** zarządzaną przez **`packwiz`** (bez wrzucania plików `.jar` do Gita).

- **Minecraft:** `1.21.1`
- **Modloader:** `NeoForge` (wersja w [pack.toml](pack.toml))
- **Create:** `6.0.10` (+ `Steam 'n' Rails Neoforge 0.3.0-beta.2` kompatybilny z Create `6.0.10`)
- **Ekonomia:** jedna waluta `Lightman's Currency` + `Shoppers` (RFC #5)
- **Zasady:** zero magii, zero *Ex Deorum*/*Ex Nihilo*, brak *Valkyrien Skies*/*Clockwork* (pełna stabilność na Apple Silicon Mac M2)

---

## Eksport paczki klienckiej (`.mrpack` pod Prism Launcher / Modrinth App)

```bash
mkdir -p dist
packwiz --pack-file packwiz/pack.toml refresh --build
packwiz --pack-file packwiz/pack.toml mr export -o dist/halucynacjeGTP2.mrpack
```

> **Wskazówka:** GitHub Actions (`.github/workflows/ci.yml`) buduje plik `dist/halucynacjeGTP2.mrpack` automatycznie przy każdym PR i pushu na `main` jako artefakt gotowy do pobrania.

---

## Eksport i walidacja paczki serwerowej pod Exaroton

Skrypt `scripts/export_server_pack.mjs` automatycznie odfiltrowuje mody czysto klienckie (`side = "client"`, m.in. *Sodium*, *EntityCulling*, *Xaero's Minimap & World Map*, *Mouse Tweaks*, *Controlling*, *Searchables*, *Configured*) oraz pilnuje budżetu modów (`<= 115`).

```bash
# Szybka walidacja (bez pobierania .jar — używana w CI):
node scripts/export_server_pack.mjs --dry-run

# Pełne pobranie modów serwerowych z Modrinth + spakowanie config/ i kubejs/ do ZIP:
node scripts/export_server_pack.mjs
```

### Uwaga dot. modów z CurseForge (`mode = "metadata:curseforge"`)
Kilka modów serwerowych (pakiet FTB: *FTB Library*, *FTB Teams*, *FTB Quests*, *FTB Chunks*, *FTB Essentials*, *FTB Ultimine*, *FTB XMod Compat*, *Building Gadgets 2*, *AllTheLeaks*) korzysta z dystrybucji CurseForge:
- W paczce klienckiej `.mrpack` **Prism Launcher** i **Modrinth App** pobierają je automatycznie.
- Dla serwera **Exaroton** lista plików z CurseForge zapisywana jest w `EXAROTON_MANIFEST.json` wewnątrz archiwum serwerowego (można je też pobrać automatycznie jednym poleceniem przez `packwiz-installer-bootstrap.jar -g -s server <URL_do_pack.toml>`).
