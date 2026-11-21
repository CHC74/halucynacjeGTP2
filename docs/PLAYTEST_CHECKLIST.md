# Checklista Playtestu i Pierwszego Uruchomienia (Exaroton + PC + Apple Silicon Mac M2)

Ten dokument jest praktyczną, krok-po-kroku checklistą smoke-testu dla wydania **`v1.0.2-playtest`** modpacka **HalucynacjeGTP2** (`Minecraft 1.21.1`, `NeoForge 21.1.267`, `Create 6.0.10`, 65 modów). Zbiera w jednym miejscu procedurę wdrożenia klienta (CurseForge App / Prism Launcher) i serwera Exaroton, test Apple Silicon Mac M2, weryfikację 3 gotowych wysp `.nbt`, GUI sklepu *Lightman's Currency*, stanu konta pod TAB oraz zbiorczą tabelę `[VERIFY ON 1.21.1 BOOT]`.

Powiązane poradniki:
- [docs/QUICKSTART_EXAROTON.md](QUICKSTART_EXAROTON.md) — 5-minutowy przewodnik uruchomienia
- [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md) — flagi JVM, Flywheel i strojenie serwera Exaroton
- [docs/ISLAND_DESIGN.md](ISLAND_DESIGN.md) — dokładne wymiary i schematy 3 wysp *Skyblock Builder*
- [docs/ECONOMY_GUIDE.md](ECONOMY_GUIDE.md) — przewodnik po GUI sklepu, kontraktach `+35%`, TAB-ie i *Shoppers*
- [docs/QOL_AND_SERVER_CONFIGS.md](QOL_AND_SERVER_CONFIGS.md) — limity FTB Chunks/Essentials, Carry On blacklist i Sophisticated Storage

---

## 1. Instalacja klienta (Windows PC + Apple Silicon Mac M2)

### 1.1 Pobranie i import paczki (CurseForge App lub Prism Launcher)
- [ ] Pobierz z **[GitHub Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** (`v1.0.2-playtest` lub najnowsze wydanie):
  - **Opcja A (CurseForge App):** **`halucynacjeGTP2-curseforge.zip`** → *Create Custom Profile → Import* (instaluje automatycznie **NeoForge `21.1.267`** + 15 modów CF + 50 JAR-ów Modrinth + `overrides/config/` + `overrides/kubejs/`).
  - **Opcja B (Prism Launcher / Modrinth App — szczególnie na Mac M2):** **`halucynacjeGTP2.mrpack`** → przeciągnij do okna launchera.
- [ ] **Szybka weryfikacja po imporcie:** upewnij się, że w katalogu instancji (`minecraft/`) widnieją `kubejs/startup_scripts/stage_tokens.js`, `kubejs/assets/kubejs/lang/pl_pl.json`, 3 wyspy `.nbt` w `config/skyblockbuilder/templates/` oraz `config/lightmanscurrency/PersistentTraders.json`.

### 1.2 Java 21 i pamięć RAM
- [ ] **Windows PC:** Java 21 (64-bit, np. Eclipse Temurin 21), alokacja **6 GB RAM** (`6144 MB`).
- [ ] **Apple Silicon Mac M2 (`arm64`):**
  - [ ] Zainstalowana **natywna Java 21 `aarch64` / `arm64`** (np. Azul Zulu 21 ARM64 lub Eclipse Temurin 21 ARM64) — **NIE używaj wersji x86_64 przez Rosettę 2**.
  - [ ] W CurseForge App (`Settings → Game Specific → Minecraft → Java Version`) lub Prism Launcher wybrana ścieżka do JDK `arm64`.
  - [ ] Alokacja pamięci: **6 GB RAM** (`6144 MB`, nie przekraczać 8 GB na 16 GB unified memory).
- [ ] Klient uruchamia się do menu głównego bez błędów `MissingModException`, z widocznymi **65 modami**.

---

## 2. Wdrożenie paczki serwerowej na Exaroton (6–8 GB RAM)

- [ ] Pobierz gotowe archiwum **`halucynacjeGTP2-server-exaroton.zip`** z GitHub Releases (komplet **55/55 plików `.jar`**, `config/`, 3 wyspy `.nbt`, `kubejs/`, `server.properties`) albo zbuduj lokalnie przez `node scripts/export_server_pack.mjs`.
- [ ] Na panelu **Exaroton**:
  - [ ] Wybierz silnik **NeoForge `21.1.267`** dla **Minecraft `1.21.1`** i **Java 21**.
  - [ ] Ustaw budżet pamięci na **6–8 GB RAM** (docelowo 7–8 GB przy rozbudowanych halach Create + AE2 + Mekanism).
  - [ ] Wgraj rozpakowane katalogi `mods/` (55 modów serwerowych), `config/` oraz `kubejs/`.
  - [ ] Ustaw w **Options**: `allow-flight = ON`, `view-distance = 8`, `simulation-distance = 6`, oraz w **Worlds → Generate** wpisz Worldtype: **`skyblockbuilder:skyblock`**.
- [ ] Wykonaj pierwszy start serwera i sprawdź `logs/latest.log`:
  - [ ] Brak krytycznych błędów ładowania modów (`ERROR`, `ClassNotFoundException`, `MixinApplyError`).
  - [ ] **ZERO błędów KubeJS** (brak `Unknown event 'PlayerEvents.changedDimension'` oraz brak `redeclaration of var cfg`!).
  - [ ] Potwierdzony wpis w logach: `[HalucynacjeGTP2] Wymuszono gamerule keepInventory = true.` oraz oba natywne eventy gatingu (`EntityTravelToDimensionEvent` + `PlayerEvent$PlayerChangedDimensionEvent`).
  - [ ] Obaj gracze (Windows PC + Mac M2) dołączają bez błędu synchronizacji rejestru.

---

## 3. Test Apple Silicon Mac M2 (OpenGL 4.1) i Flywheel

Wykonywane bezpośrednio na **Mac M2** po wejściu na serwer:

- [ ] **Sodium:** stabilne FPS (cel `60+ FPS`), brak migotania chunków i brak czarnych tekstur.
- [ ] **Flywheel (Create 6.0.10) pod OpenGL 4.1:**
  - [ ] Postaw kilka obracających się kół wodnych, pasów transmisyjnych, młynów i pras mechanicznych.
  - [ ] Sprawdź aktualny backend komendą `/flywheel backend` (domyślnie `flywheel:instancing` lub `flywheel:batching`).
  - [ ] W razie artefaktów graficznych, mikrozacięć lub błędów GL w `latest.log` przełącz na `/flywheel backend off` (szczegóły w [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md)).
- [ ] **Create: Steam 'n' Rails (`0.3.0-beta.2`) & logistyka Create 6:**
  - [ ] Połóż odcinek torów Create (proste + łuk), postaw `Train Station`, złóż prosty 1-wagonowy pociąg i przejedź kilka bloków.
  - [ ] Postaw `Chain Conveyor`, `Frogport`, `Packager` oraz krótki tunel `Hypertube` i przeleć przez niego — brak crasha klienta na Mac M2 i brak kicka za latanie z serwera Exaroton (`allow-flight=true`).

---

## 4. Weryfikacja 3 gotowych binarnych wysp `.nbt` (*Skyblock Builder*)

Wszystkie 3 pliki `.nbt` są już wygenerowane przez `scripts/generate_island_nbt.py` (`DataVersion 3955`) i zweryfikowane pod kątem bloków `create`, `createdeco` oraz `lightmanscurrency`:

- [ ] **`starter_island.nbt`** (`15×13×15`, środek `(0, 64, 0)`, spawn `(0, 65, 0)` patrząc na Wschód):
  - [ ] Gracz spawnuje się bezpiecznie na trawie z widokiem na Pirs Wschodni i Wielką Wyspę-Rynek na horyzoncie, skrzynią anty-softlock (11 pozycji), stołem rzemieślniczym, dębem i niecką cobble-gen.
- [ ] **`market_island.nbt`** (**Wielka Wyspa-Rynek**, `45×25×35`, środek `(152, 64, 0)`, `offset: [152, 4, 0]`):
  - [ ] Płaski plac mozaikowy na `Y = 64` (bez przeszkód dla AI *Shoppers*), **3 działające bankomaty `lightmanscurrency:atm`** w kioskach, **Centralna Rotunda z miedzianą kopułą i działającym `lightmanscurrency:terminal`**, Zachodnia Hala Dworca z podkładami `Y=64`, 8 dwupiętrowych butików z szyldami i tylną estakadą `brass_catwalk`, wschodni ogród z fontanną.
- [ ] **`industrial_island.nbt`** (**Huta Południowa**, `33×21×33`, środek `(0, 64, 152)`, `offset: [0, 4, 152]`):
  - [ ] 4 płaskie hale `11×11` na `Y = 64`, północny dok kolejowy z suwnicą bramową, dymiący komin przemysłowy oraz przeszklona dyspozytornia z działającym `lightmanscurrency:terminal`.

---

## 5. Test pętli Tycoona, GUI sklepu, TAB-a i zabezpieczeń anty-exploitowych

### 5.1 Graficzny Sklep GUI, Kontrakty i TAB (`Lightman's Currency` + `Shoppers`)
- [ ] **Graficzne GUI Sklepu (`/sklep`, `/lcterminal`, blok Terminala w Rotundzie):**
  - [ ] Wpisanie `/sklep` (lub PPM na `lightmanscurrency:terminal` w Rotundzie) otwiera **graficzne GUI Terminala** z widocznymi sieciowymi sklepami z `PersistentTraders.json` (Żetony Etapów, Startery Skyblocka, Skup Hurtowy Tier 1–5).
  - [ ] Zakup startera i sprzedaż przetworzonego dobra działają bez błędów w konsoli.
- [ ] **Stan konta pod TAB:**
  - [ ] Przytrzymanie klawisza **TAB** pokazuje aktualny stan konta w monetach *Lightman's Currency* obok nicku każdego gracza.
- [ ] **Dynamiczne Kontrakty (`/kontrakt`):**
  - [ ] `/kontrakt` wyświetla aktualne zlecenie z premią `+35%`, `/kontrakt oddaj` odbiera towar i wypłaca fizyczne monety, `/kontrakt nowy` respektuje 5-minutowy cooldown.
- [ ] **Ochrona anty-exploitowa (`Coin Mint`, `Slot Machine`, Tier 0):**
  - [ ] W **JEI** brak receptury craftingu `Coin Mint` i `Slot Machine` (`economy_anti_exploit.js` + `lightmanscurrency-common.txt`).
  - [ ] Jako OP uruchom `/halucynacje_sync_shoppers` — potwierdź brak błędów i ceny `0` dla surowców Tier 0 oraz `+20%` dla towarów Tier 1–5.

### 5.2 Pure-Create Skyblock (receptury KubeJS)
- [ ] W **JEI** potwierdź obecność i poprawność receptur z `kubejs/server_scripts/skyblock_create_recipes.js`:
  - [ ] Generacja `minecraft:tuff` (`create_mechanical_extruder:extruding` + `compacting`) oraz płukanie `tuff` na bryłki.
  - [ ] Płynowe receptury Create `6.0.10` (`neoforge:single`): mieszanie `netherrack`, `blackstone`, `soul_sand`, `blaze_rod` (bez *Ex Deorum* / *Ex Nihilo*).

### 5.3 Żetony Etapów, Gating Wymiarów i FTB Quests
- [ ] **Test `keepInventory`:** skocz w próżnię — po odrodzeniu cały ekwipunek i pasek szybkiego dostępu zostają nienaruszone.
- [ ] **Blokada wymiarów (Etap 0/1):**
  - [ ] Wejdź w zapalony portal do **Netheru** przed aktywacją `stage_2` -> gracz zostaje zablokowany przez `EntityTravelToDimensionEvent` (lub cofnięty przez `PlayerEvent$PlayerChangedDimensionEvent` na `(0, 65, 0)`) z komunikatem po polsku bez spamu na czacie.
  - [ ] Wejdź w portal do **Endu** przed aktywacją `stage_4` -> analogiczna blokada.
- [ ] **Realizacja Żetonów (`kubejs:stage_1_token`..`stage_5_token`):**
  - [ ] PPM z `stage_1_token`: pojawia się ogłoszenie i dźwięk awansu, żeton znika (w Survival), a w księdze **FTB Quests** automatycznie zalicza się task `custom` (`C100000000000102`).
  - [ ] **Test co-op (2 graczy):** po aktywacji `stage_2_token` przez Gracza A, Gracz B ma dostęp do **Netheru** oraz zaliczony task `C200000000000102`.

### 5.4 QoL, limity Exaroton i profilowanie Spark
- [ ] **FTB Teams / Chunks / Essentials:** wspólna drużyna (`/ftbteams party create`), limit `16` chunków forceloaded, działają `/home`, `/back`, `/tpa`, `/spawn`, brak `/rtp`.
- [ ] **Carry On blacklist:** blokada `Shift + PPM` na maszynach Create, `create_hypertube:*`, `Lightman's Currency`, AE2, Mekanism, `Waystones`.
- [ ] **Spark (wydajność serwera):** `/spark tps` -> cel **20.0 TPS**, średnie **MSPT < 25 ms**.

---

## 6. Zbiorcza lista punktów `[VERIFY ON 1.21.1 BOOT]`

| Obszar | Plik w repozytorium | Status weryfikacji JAR / Playtest | Status |
| :--- | :--- | :--- | :---: |
| **Packwiz / CurseForge / `.mrpack`** | `scripts/export_curseforge_pack.mjs`, `scripts/bundle_mrpack_overrides.mjs`, `scripts/export_server_pack.mjs` | Zweryfikowano 65/65 modów klienckich (15 CF + 50 Modrinth) i 55/55 serwerowych; automatyczny build w CI & Release. | [x] |
| **Skyblock Builder & 3 Wyspy `.nbt`** | `config/skyblockbuilder/*.json5`, `scripts/generate_island_nbt.py` | Schemat 1:1 ze źródłem `SkyblockBuilder-21.1.37` (`Origin.CENTER`), 3 binarne `.nbt` (`DataVersion 3955`) + audyt 54/54 bloków modowanych i 17/17 szyldów. | [x] |
| **Create 6.0.10 & Extruder 2.2.2** | `kubejs/server_scripts/skyblock_create_recipes.js` | Zweryfikowano format `neoforge:single` oraz `blockIngredients` na prawdziwych JAR-ach 1.21.1 + testy w `test_kubejs_logic.mjs`. | [x] |
| **KubeJS 7.2 Gating Wymiarów** | `kubejs/server_scripts/dimension_gating.js` | Usunięto nieistniejący `PlayerEvents.changedDimension`; użyto zweryfikowanych `EntityTravelToDimensionEvent` + `PlayerEvent$PlayerChangedDimensionEvent`. | [x] |
| **KubeJS Rhino JSON Loader** | `kubejs/server_scripts/economy_*.js` | Zastąpiono `const cfg = JsonIO.read(...)` przez bezpieczne w Rhino `JSON.parse(String(JsonIO.readString(...)))` (fix `redeclaration of var cfg`). | [x] |
| **Shoppers AI & Promień Spawnu** | `config/shoppers-common.toml` | Zweryfikowano klucze w `ShoppersConfig.class`; `maxShoppers = 10`, `spawnRadiusMin = 4`, `spawnRadiusMax = 15` pod nową Wyspę-Rynek `45×35`. | [x] |
| **Lightman's Currency GUI & Config** | `config/lightmanscurrency/PersistentTraders.json`, `config/lightmanscurrency-*.txt` | Zweryfikować na żywym starcie `v1.0.2-playtest` działanie `/sklep`, `/lcterminal` i brak `Coin Mint` w craftingu. | [ ] |
| **Stan Konta pod TAB** | `kubejs/server_scripts/economy_tab_balance.js` | Potwierdzić na żywo odświeżanie salda (ekwipunek + portfel + bank) pod klawiszem TAB. | [ ] |
| **Live Playtest Exaroton + Mac M2** | Cała paczka `v1.0.2-playtest` | Potwierdzić `0` błędów KubeJS w `latest.log`, poprawne generowanie 3 wysp oraz stabilne `60+ FPS` na Mac M2 i `20 TPS` na Exaroton. | [ ] |

---

## 7. Kryterium Go / No-Go przed startem kampanii

Serwer jest gotowy do startu gry we dwóch (**GO**), gdy:
1. Obaj gracze (PC + Mac M2) bezproblemowo wchodzą na serwer Exaroton bez błędów KubeJS i widzą poprawne ikony/nazwy `kubejs:stage_1..5_token`.
2. Działają graficzne GUI sklepu (`/sklep`, `/lcterminal`, Terminal w Rotundzie), stan konta pod TAB oraz dynamiczne kontrakty (`/kontrakt`).
3. Na Mac M2 działają stabilnie `Sodium`, `Create 6.0.10`, `Steam 'n' Rails` i `Hypertubes` bez crashy OpenGL 4.1.
4. Wszystkie 3 wyspy `.nbt` generują się poprawnie na `Y = 64`, `keepInventory = true` działa, a `Coin Mint` / `Slot Machine` / skup surowców Tier 0 są zablokowane.
