# Checklista Playtestu i Pierwszego Uruchomienia (Exaroton + PC + Apple Silicon Mac M2)

Ten dokument jest praktyczną, krok-po-kroku checklistą smoke-testu przed oficjalnym startem serwera **HalucynacjeGTP2** (`Minecraft 1.21.1`, `NeoForge 21.1.267`, `Create 6.0.10`, 65 modów). Zbiera w jednym miejscu procedurę wdrożenia klienta i serwera, test Apple Silicon Mac M2, eksport 3 struktur wysp `.nbt`, weryfikację pętli Tycoona oraz kompletną listę punktów `[VERIFY ON 1.21.1 BOOT]` ze wszystkich plików `config/` i `kubejs/`.

Powiązane poradniki:
- [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md) — flagi JVM, Flywheel i strojenie serwera Exaroton
- [docs/ISLAND_DESIGN.md](ISLAND_DESIGN.md) — dokładne wymiary i schematy 3 wysp *Skyblock Builder*
- [docs/QOL_AND_SERVER_CONFIGS.md](QOL_AND_SERVER_CONFIGS.md) — limity FTB Chunks/Essentials, Carry On blacklist i Sophisticated Storage
- [packwiz/README.md](../packwiz/README.md) — komendy eksportu `.mrpack` i paczki serwerowej

---

## 1. Instalacja klienta (Windows PC + Apple Silicon Mac M2)

### 1.1 Pobranie i import paczki `.mrpack`
- [ ] Pobierz najnowszy artefakt **`halucynacjeGTP2-client-mrpack`** (`dist/halucynacjeGTP2.mrpack`) z zakładki **GitHub Actions** (workflow `CI — HalucynacjeGTP2 Validation & Packwiz Export`) lub wygeneruj lokalnie:
  ```bash
  mkdir -p dist
  packwiz --pack-file packwiz/pack.toml refresh --build
  packwiz --pack-file packwiz/pack.toml mr export -o dist/halucynacjeGTP2.mrpack
  node scripts/bundle_mrpack_overrides.mjs dist/halucynacjeGTP2.mrpack
  ```
- [ ] Zaimportuj `halucynacjeGTP2.mrpack` w **Prism Launcher** (zalecany na Mac M2 i PC) lub **Modrinth App**.
- [ ] **Szybka weryfikacja po imporcie:** CI (`.github/workflows/ci.yml`) oraz skrypt `scripts/bundle_mrpack_overrides.mjs` automatycznie dołączają katalogi `overrides/config/` i `overrides/kubejs/` do `.mrpack` i weryfikują ich obecność przed publikacją artefaktu. Po imporcie upewnij się dla formalności, że w katalogu instancji (`minecraft/`) widnieją `kubejs/startup_scripts/stage_tokens.js` oraz `kubejs/assets/kubejs/lang/pl_pl.json` (gwarantuje to rejestrację `kubejs:stage_1_token`..`stage_5_token`, polskie nazwy i ikony).

### 1.2 Java 21 i pamięć RAM
- [ ] **Windows PC:** Java 21 (64-bit, np. Eclipse Temurin 21), alokacja **6 GB RAM** (`-Xms4G -Xmx6G`).
- [ ] **Apple Silicon Mac M2 (`arm64`):**
  - [ ] Zainstalowana **natywna Java 21 `aarch64` / `arm64`** (np. Azul Zulu 21 ARM64 lub Eclipse Temurin 21 ARM64) — **NIE używaj wersji x86_64 przez Rosettę 2**.
  - [ ] W Prism Launcher → *Edit Instance* → *Settings* → *Java* wybrana ścieżka do JDK `arm64` (test *Auto-detect* / `java -version` pokazuje `aarch64`).
  - [ ] Alokacja pamięci: **6 GB RAM** (`-Xms4G -Xmx6G`, nie przekraczać 8 GB na 16 GB unified memory).
- [ ] Klient uruchamia się do menu głównego bez błędów `MissingModException`, z widocznymi **65 modami** (plus biblioteki wewnętrzne NeoForge/Create).

---

## 2. Wdrożenie paczki serwerowej na Exaroton (6–8 GB RAM)

- [ ] Wygeneruj paczkę serwerową z poziomu repozytorium:
  ```bash
  node scripts/export_server_pack.mjs --dry-run   # szybka weryfikacja (55 modów serwerowych, 10 wykluczonych)
  node scripts/export_server_pack.mjs             # pobiera mody Modrinth + pakuje config/ i kubejs/ do ZIP
  ```
- [ ] Pobierz 13 modów z CurseForge wymienionych w `EXAROTON_MANIFEST.json` (pakiet FTB, `AllTheLeaks`, `Architectury API`, `Building Gadgets 2`, `GuideME`, `JEI`, `MezzConfig`) — najwygodniej przez `packwiz-installer-bootstrap.jar -g -s server <URL_do_pack.toml>` lub w panelu modów Exaroton (wersje zgodne z `packwiz/mods/*.pw.toml`).
- [ ] Na panelu **Exaroton**:
  - [ ] Wybierz silnik **NeoForge `21.1.267`** dla **Minecraft `1.21.1`** i **Java 21**.
  - [ ] Ustaw budżet pamięci na **6–8 GB RAM** (docelowo 7–8 GB przy rozbudowanych halach Create + AE2 + Mekanism).
  - [ ] Wgraj katalogi `mods/` (wyłącznie **55 modów serwerowych** — ZERO `sodium`, `entityculling`, `xaeros-*`, `mouse-tweaks`, `controlling`, `searchables`, `configured`, `ae2-jei-integration`, `better-advanced-tooltips`), `config/` oraz `kubejs/`.
  - [ ] Ustaw w `server.properties`: `view-distance=10`, `simulation-distance=8`, `allow-flight=true` (wymagane dla `Hypertubes` / jetpacków Mekanism / plecaków), `max-tick-time=120000`.
- [ ] Wykonaj pierwszy start serwera i sprawdź `logs/latest.log`:
  - [ ] Brak krytycznych błędów ładowania modów (`ERROR`, `ClassNotFoundException`, `MixinApplyError`).
  - [ ] Brak błędów składni/ładowania skryptów KubeJS (`stage_tokens.js`, `dimension_gating.js`, `skyblock_create_recipes.js`, `economy_anti_exploit.js`).
  - [ ] Potwierdzony wpis w logach: `[HalucynacjeGTP2] Wymuszono gamerule keepInventory = true.` oraz `[HalucynacjeGTP2] Zarejestrowano główny gating wymiarów (EntityTravelToDimensionEvent).`
  - [ ] Obaj gracze (Windows PC + Mac M2) dołączają bez błędu synchronizacji rejestru.

---

## 3. Test Apple Silicon Mac M2 (OpenGL 4.1) i Flywheel

Wykonywane bezpośrednio na **Mac M2** po wejściu na serwer:

- [ ] **Sodium:** stabilne FPS (cel `60+ FPS`), brak migotania chunków i brak czarnych tekstur.
- [ ] **Flywheel (Create 6.0.10) pod OpenGL 4.1:**
  - [ ] Postaw kilka obracających się kół wodnych, pasów transmisyjnych, młynów i pras mechanicznych.
  - [ ] Sprawdź aktualny backend komendą `/flywheel backend` (domyślnie `flywheel:instancing` lub `flywheel:batching`).
  - [ ] W razie artefaktów graficznych, mikrozacięć lub błędów GL w `latest.log` przełącz na `/flywheel backend flywheel:off` (szczegóły w [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md)).
- [ ] **Create: Steam 'n' Rails (`0.3.0-beta.2`) & logistyka Create 6:**
  - [ ] Połóż odcinek torów Create (proste + łuk), postaw `Train Station`, złóż prosty 1-wagonowy pociąg i przejedź kilka bloków.
  - [ ] Postaw `Chain Conveyor`, `Frogport`, `Packager` oraz krótki tunel `Hypertube` i przeleć przez niego — brak crasha klienta na Mac M2 i brak kicka za latanie z serwera Exaroton (`allow-flight=true`).

---

## 4. Eksport 3 binarnych struktur `.nbt` wysp (*Skyblock Builder*, Issue #2)

Szczegółowa specyfikacja blok-po-bloku znajduje się w [docs/ISLAND_DESIGN.md](ISLAND_DESIGN.md). Przed startem właściwego świata należy wyeksportować 3 pliki `.nbt` w świecie testowym (tryb Creative) przy pomocy Vanilla **Structure Block** (lub narzędzia *Skyblock Builder*) i wrzucić je do `config/skyblockbuilder/templates/`:

- [ ] **`starter_island.nbt`** (Wyspa Startowa / Fabryczna, ok. `18×18`, środek `(0, 64, 0)`, spawn `(0, 65, 0)`):
  - [ ] Bezpieczna płyta startowa, drzewo dębowe, źródło wody + wiadro/źródło lawy (lub ekstruder startowy), skrzynka startowa i miejsce na pierwszy generator bruku/młyn Create.
- [ ] **`market_island.nbt`** (Wyspa-Rynek w odległości `~150` bloków, ok. `28×28`, środek `(150, 64, 0)`):
  - [ ] Płaski, czytelny plac handlowy pod **3× ATM** (*Lightman's Currency*) + stanowiska pod NPC **Shoppers** + terminal hurtowy/Waystone.
  - [ ] Wydzielony peron stacji kolejowej Create skierowany w stronę Wyspy Startowej (gotowy pod tory i `Chain Conveyor` / `Hypertube`).
- [ ] **`industrial_island.nbt`** (Opcjonalna Wyspa Ekspansji Przemysłowej, środek `(0, 64, 150)`):
  - [ ] Płaska platforma pod przyszłe hale `Mekanism` / `AE2` / elektrownie w Etapie 3–4.
- [ ] **Weryfikacja na żywym serwerze po wrzuceniu `.nbt`:**
  - [ ] Nowy świat generuje się jako pustka Skyblock (bez waniliowego terenu Overworlda).
  - [ ] Gracz spawnuje się bezpiecznie na `(0, 65, 0)` i otrzymuje ekwipunek startowy z `config/skyblockbuilder/inventory.json5`.
  - [ ] Wyspa-Rynek jest widoczna/osiągalna w odległości `~150` bloków (płaski plac + działające 3 ATM-y *Lightman's Currency*).

---

## 5. Test pętli Tycoona, progresji i zabezpieczeń anty-exploitowych

### 5.1 Ochrona ekonomii (`Lightman's Currency` + `Shoppers`)
- [ ] W **JEI** wyszukaj `Coin Mint` i `Slot Machine` — **receptury craftingu muszą być usunięte** (`economy_anti_exploit.js`).
- [ ] Sprawdź, że nie da się wybijać monet ze sztabek żelaza/złota (`canMint = false` w configu *Lightman's Currency*).
- [ ] Jako OP uruchom `/halucynacje_sync_shoppers` i sprawdź w logach oraz w GUI *Shoppers*:
  - [ ] Surowce **Tier 0** (`cobblestone`, `netherrack`, `blackstone`, `quartz`, `gold_ingot`, `iron_ingot`, `diamond`, `end_stone`, `chorus_fruit`, `shulker_shell`, `ancient_debris`) mają cenę skupu **`0`** (NPC ich nie skupują).
  - [ ] Towary przetworzone **Tier 1–5** (np. posiłki *Farmer's Delight*, słodycze *Create: Confectionery*, `Precision Mechanism`, tory, paliwa) mają poprawne ceny zgodne z `config/halucynacje_economy/prices.json` (z premią `+20%` za fizyczny handel NPC vs hurt).
  - [ ] Jeśli komenda `/shoppers value set <item> <worth>` działa bez błędów, można przełączyć `AUTO_APPLY_SHOPPERS_TIER0 = true` w `kubejs/server_scripts/economy_anti_exploit.js`.

### 5.2 Pure-Create Skyblock (receptury KubeJS)
- [ ] W **JEI** potwierdź obecność i poprawność receptur z `kubejs/server_scripts/skyblock_create_recipes.js`:
  - [ ] Generacja `minecraft:tuff` (Extruder / Compacting) + płukanie `tuff` na bryłki.
  - [ ] Wczesny `minecraft:red_sand` w `Millstone` (`terracotta -> red_sand`) oraz mieszanie `sand + red_dye -> red_sand`.
  - [ ] Ścieżki dla `crimsite`, `asurine`, `veridium`, `ochrum`, `netherrack`, `blackstone`, `quartz`, `soul_sand`, `blaze_rod` (bez *Ex Deorum* / *Ex Nihilo*).

### 5.3 Żetony Etapów, Gating Wymiarów i FTB Quests
- [ ] **Test `keepInventory`:** skocz w próżnię — po odrodzeniu cały ekwipunek i pasek szybkiego dostępu zostają nienaruszone.
- [ ] **Blokada wymiarów (Etap 0/1):**
  - [ ] Wejdź w zapalony portal do **Netheru** przed aktywacją `stage_2` -> gracz zostaje zablokowany przez `EntityTravelToDimensionEvent` (lub cofnięty przez fallback na `(0, 65, 0)`) z komunikatem po polsku bez spamu na czacie.
  - [ ] Wejdź w portal do **Endu** przed aktywacją `stage_4` -> analogiczna blokada.
- [ ] **Realizacja Żetonów (`kubejs:stage_1_token`..`stage_5_token`):**
  - [ ] Daj graczowi żetony przez `/give @s kubejs:stage_1_token` (itd.) — sprawdź poprawne **tekstury** i **polskie nazwy** z `kubejs/assets/`.
  - [ ] Próba użycia `stage_2_token` przed `stage_1` zostaje zablokowana (żeton nie znika).
  - [ ] PPM z `stage_1_token`: pojawia się ogłoszenie na czacie i dźwięk awansu, żeton znika (w Survival), a w księdze **FTB Quests** automatycznie zalicza się task `custom` (`C100000000000102`).
  - [ ] **Test co-op (2 graczy):** po aktywacji `stage_2_token` przez Gracza A, Gracz B (zarówno online, jak i po przelogowaniu) ma dostęp do **Netheru** oraz zaliczony task `C200000000000102` w **FTB Quests**.
  - [ ] Po aktywacji `stage_4_token` obaj gracze mogą wejść do **Endu**.

### 5.4 QoL, limity Exaroton i profilowanie Spark
- [ ] **FTB Teams:** obaj gracze tworzą wspólną drużynę (`/ftbteams party create`), współdzielą postęp *FTB Quests* oraz zclaimowane chunki.
- [ ] **FTB Chunks:** maksymalnie `16` chunków forceloaded na drużynę, wyłączony griefing mobów na claimach (`config/ftbchunks/ftbchunks-world.snbt`).
- [ ] **FTB Essentials:** działają `/home`, `/back`, `/tpa`, `/spawn`; brak `/rtp` (wyłączone na Skyblocku!).
- [ ] **Carry On blacklist:** próba podniesienia `Shift + PPM` bloków z listy zakazanej (`Lightman's Currency` ATM/traders, `Shoppers`, `Create` maszyny/magazyny, `AE2` ME Drive, `Mekanism` maszyny, `Sophisticated Storage`, `Waystones`) jest zablokowana (`config/carryon-common.toml`).
- [ ] **Spark (wydajność serwera):** uruchom `/spark tps` oraz `/spark profiler --timeout 60` przy pracującej próbnej linii Create:
  - [ ] Cel: **20.0 TPS**, średnie **MSPT < 25 ms**, stabilne zużycie RAM bez ciągłego wzrostu (brak wycieków pamięci — `AllTheLeaks` aktywne).

---

## 6. Zbiorcza lista punktów `[VERIFY ON 1.21.1 BOOT]`

Wszystkie miejsca w repozytorium oznaczone `[VERIFY ON 1.21.1 BOOT]` zebrane w jednej tabeli do szybkiego odhaczenia podczas pierwszego uruchomienia serwera `NeoForge 1.21.1`:

| Obszar | Plik w repozytorium | Co dokładnie zweryfikować przy pierwszym starcie | Status |
| :--- | :--- | :--- | :---: |
| **Packwiz / FTB Quests** | `packwiz/mods/ftb-quests-forge.pw.toml` | Zweryfikowano `META-INF/neoforge.mods.toml` w `ftb-quests-neoforge-2101.1.39.jar`: wymaga wyłącznie `architectury` (>=13.0.11), `ftblibrary` (>=2101.1.40), `ftbteams` (>=2101.1.9) + opcjonalny `ftbxmodcompat` (>=21.1.7). `FTB Filter System` **nie jest wymagany** (i nie jest używany w naszych `.snbt`). | [x] |
| **Packwiz / Klient** | `packwiz/mods/better-advanced-tooltips.pw.toml` | Zweryfikowano `META-INF/neoforge.mods.toml` (`side = "CLIENT"`): przełączono na `side = "client"` + dopisano do `CLIENT_ONLY_GUARD` (55 modów serwerowych + 10 klienckich = 65). | [x] |
| **Packwiz / `.mrpack`** | `.github/workflows/ci.yml`, `scripts/bundle_mrpack_overrides.mjs` | CI automatycznie wstrzykuje `overrides/config/` i `overrides/kubejs/` do `dist/halucynacjeGTP2.mrpack` i weryfikuje obecność kluczowych plików (`stage_tokens.js`, `pl_pl.json`, tekstury, `carryon-common.toml`, `data.snbt`, `prices.json`). | [x] |
| **Skyblock Builder** | `config/skyblockbuilder/inventory.json5` | Schemat kluczy ekwipunku startowego (`Slot` + `Item: { id, count }`). | [ ] |
| **Skyblock Builder** | `config/skyblockbuilder/spawn.json5` | Klucze `skipSelectionGui` / `autoCreate` przy pierwszym wejściu gracza. | [ ] |
| **Skyblock Builder** | `config/skyblockbuilder/templates.json5` | Dokładne nazwy i offsety po wrzuceniu binarnych plików `starter_island.nbt`, `market_island.nbt`, `industrial_island.nbt`. | [ ] |
| **Skyblock Builder** | `config/skyblockbuilder/world.json5` | Schemat sekcji `surface` / `dimensions` oraz `biomes` / `singleBiome` w `SkyblockBuilder-21.1.37`. | [ ] |
| **Ekonomia (LC)** | `config/lightmanscurrency-server.toml` | Nazwy sekcji i kluczy TOML (zwłaszcza `canMint = false`, wyłączone kasyno/slot machine, przeniesienie pliku do `world/serverconfig/` jeśli wymagane przez NeoForge). | [ ] |
| **Ekonomia (Shoppers)** | `config/shoppers-common.toml` | Zweryfikowano klucze w `ShoppersConfig.class` (`maxShoppers = 10`, bezpieczny promień `4–12` na Wyspie-Rynku, `overpriceMultiplier = 1.25`) — potwierdzić na starcie 1.21.1. | [ ] |
| **Rynek Hurtowy (KubeJS)** | `kubejs/server_scripts/economy_market.js` | Przetestować komendy `/ekonomia`, `/cennik 1`, `/sklep`, `/sprzedaj`, `/kup kelp 1` z fizycznymi monetami `Lightman's Currency`. | [ ] |
| **KubeJS (Anty-exploit)** | `kubejs/server_scripts/economy_anti_exploit.js` | 1) Dokładne ID bloków `Coin Mint` i `Slot Machine` w LC 2.3.0.6; 2) Składnia `/shoppers value set <item> 0` w `Shoppers v1.0.2`; 3) Sygnatura `ctx.source.sendSuccess(() => Text..., true)` w komendzie `/halucynacje_sync_shoppers`. | [ ] |
| **KubeJS (Gating + Quests)** | `kubejs/server_scripts/dimension_gating.js` | 1) Rejestracja `NativeEvents.onEvent('...EntityTravelToDimensionEvent')` i `event.setCanceled(true)`; 2) Składnia `/ftbquests change_progress <gracz> complete <task_id>` w `FTB Quests 2101.1.39`; 3) Fallback teleportu `(0, 65, 0)` vs spawn drużyny. | [ ] |
| **KubeJS (Receptury)** | `kubejs/server_scripts/skyblock_create_recipes.js` | Schemat JSON receptur Create `6.0.10` (milling, splashing, mixing, compacting) oraz `create_mechanical_extruder:extruding` (`2.2.2-6.0.10`). | [ ] |
| **FTB Quests (SNBT)** | `config/ftbquests/quests/README.md` | Parsowanie plików `.snbt` (rozdziały `stage_0`..`stage_5`), ikony itemów modowych (`create:*`, `farmersdelight:*`, `ae2:*`, `mekanism:*`) oraz zaliczanie tasków `C1..C5`. | [ ] |
| **FTB Chunks** | `config/ftbchunks/ftbchunks-common.snbt`, `ftbchunks-world.snbt` | Nazwy kluczy w `FTB Chunks 2101.1.24` oraz lokalizacja pliku (`config/` vs `world/serverconfig/`). | [ ] |
| **FTB Essentials** | `config/ftbessentials/ftbessentials.snbt` | Lokalizacja pliku (`config/` vs `world/serverconfig/`) oraz wyłączenie `/rtp` w `FTB Essentials 2101.1.10`. | [ ] |
| **Carry On** | `config/carryon-common.toml` | Dokładne nazwy sekcji/kluczy TOML blacklisty bloków i encji w `Carry On 2.2.6.13`. | [ ] |
| **Sophisticated Storage** | `config/sophisticatedstorage-common.toml` | Dokładne nazwy kluczy TOML wygenerowanych przez `Sophisticated Storage 1.6.20` (limit zasięgu kontrolera). | [ ] |

---

## 7. Kryterium Go / No-Go przed startem kampanii

Serwer jest gotowy do startu gry we dwóch (**GO**), gdy:
1. Obaj gracze (PC + Mac M2) bezproblemowo wchodzą na serwer Exaroton i widzą poprawne ikony/nazwy `kubejs:stage_1..5_token`.
2. Na Mac M2 działają stabilnie `Sodium`, `Create 6.0.10`, `Steam 'n' Rails` i `Hypertubes` bez crashy OpenGL 4.1.
3. Wszystkie 3 wyspy `.nbt` generują się poprawnie, `keepInventory = true` działa, a `Coin Mint` / `Slot Machine` / skup surowców Tier 0 są zablokowane.
4. Realizacja Żetonów odblokowuje Nether (Stage 2), End (Stage 4) i zalicza taski `C1..C5` w `FTB Quests` dla całej drużyny.
5. `/spark tps` utrzymuje `20.0 TPS` przy stabilnym zużyciu pamięci na Exaroton.
