# AGENTS.md — Protokół współpracy wieloagentowej (`CHC74/halucynacjeGTP2`)

Ten dokument definiuje zasady współpracy pomiędzy dwoma autonomicznymi agentami AI rozwijającymi modpack **HalucynacjeGTP2** (Create Skyblock Tycoon, NeoForge 1.21.1):
- **`agent:antigravity`** — architekt paczki po stronie pierwszego współzałożyciela.
- **`agent:partner`** — partnerski agent AI po stronie drugiego współzałożyciela.

Celem tego protokołu jest bezkonfliktowa, asynchroniczna praca w jednym repozytorium GitHub, pełna przejrzystość decyzji projektowych (RFC) oraz spójność z nienegocjowalnymi wymaganiami serwera.

---

## 1. Rytuał synchronizacji na początku każdej sesji

Zanim zaczniesz pisać kod lub dokumentację, **zawsze** wykonaj synchronizację stanu repozytorium i tablicy GitHub:

```bash
git fetch origin
git status
gh issue list -R CHC74/halucynacjeGTP2 --state open
gh pr list -R CHC74/halucynacjeGTP2 --state open
```

1. Przeczytaj ostatnie komentarze pod otwartymi RFC i PR-ami partnera.
2. Sprawdź, które zadania mają już etykietę `status:in-progress`, aby nie dublować pracy ani nie edytować tych samych plików równolegle.
3. Nową gałąź zawsze tworz z aktualnego `origin/main`.

---

## 2. Jak przejmować zadania (Claiming Protocol)

Aby uniknąć konfliktów merge na plikach (zwłaszcza w `docs/`, `kubejs/`, `config/` i `packwiz/`):

1. Wybierz otwarte Issue bez etykiety `status:in-progress`.
2. Dodaj swoją etykietę agenta (`agent:antigravity` lub `agent:partner`) oraz `status:in-progress`:
   ```bash
   gh issue edit <NR> -R CHC74/halucynacjeGTP2 --add-label "agent:partner,status:in-progress"
   ```
3. Zostaw **komentarz claimujący** pod Issue, podając dokładnie:
   - nazwę tworzonej gałęzi (np. `feat/packwiz-init`),
   - **listę plików docelowych**, które zamierzasz utworzyć lub zmodyfikować,
   - szacowany zakres zmian i ewentualne pytania otwarte.
4. Jeśli musisz zmodyfikować plik zadeklarowany już przez drugiego agenta w innym otwartym zadaniu, najpierw skomentuj jego Issue/PR lub poczekaj na merge.

---

## 3. Konwencje gałęzi, commitów i Pull Requestów

### Gałęzie
**Nigdy nie pushuj bezpośrednio na `main`.** Każda zmiana trafia na dedykowaną gałąź roboczą i przechodzi przez Pull Request:
- `feat/<krótki-opis>` — nowe funkcje, skrypty KubeJS, konfiguracje, struktury wysp, dokumenty architektoniczne
- `balance/<krótki-opis>` — strojenie cen sklepu, progów Żetonów Etapów, receptur Create
- `fix/<krótki-opis>` — poprawki błędów, kompatybilności modów, problemów Mac M2 / Exaroton
- `docs/<krótki-opis>` — wyłącznie aktualizacje dokumentacji

### Wspólny zakres globalny w `kubejs/server_scripts/` (Rhino, #60)
Wszystkie skrypty w `kubejs/server_scripts/` dzielą **jeden globalny zakres (single Rhino scope)** — powtórna deklaracja `const`/`let`/`function` o tej samej nazwie pomiędzy plikami przerywa ładowanie skryptów na serwerze:
- Wszystkie wspólne stałe, klucze `persistentData`, obsługę waluty *Lightman's Currency* oraz funkcje pomocnicze umieszczamy **wyłącznie** w `kubejs/server_scripts/shared_economy.js` (`priority: 100`).
- **Zabronione** jest duplikowanie pomocników z prefiksami (np. `marketFormatCoins`, `contractFormatCoins`) w pozostałych skryptach serwerowych.

### Walidacja przed commitem i pushem
Przed każdym `git push` autor PR ma obowiązek uruchomić i zaraportować:
1. Składnię wszystkich skryptów KubeJS, narzędzi Node i skryptu smoke-testu:
   ```bash
   for f in kubejs/*/*.js scripts/*.mjs; do node --check "$f"; done
   bash -n scripts/server_boot_test.sh
   ```
2. Pełny zestaw testów logicznych, ekonomicznych i dokumentacyjnych:
   ```bash
   node scripts/test_kubejs_logic.mjs         # zawiera test kolizji nazw globalnych w jednej VM Rhino
   node scripts/test_tab_balance.mjs          # logika salda TAB (EQ + portfel + bank + drużyna)
   node scripts/validate_economy.mjs          # spójność prices.json i reguły anty-arbitrażowe
   node scripts/generate_persistent_traders.mjs --check  # spójność 10 sklepów PersistentTraders.json
   node scripts/check_markdown_links.mjs      # brak martwych względnych linków Markdown
   ```
3. Przy zmianach wysp `.nbt`, modów lub konfiguracji — dodatkowo: `python3 scripts/generate_island_nbt.py --verify`, walidację `.json`/`.toml` oraz `node scripts/export_curseforge_pack.mjs --dry-run` i `node scripts/export_server_pack.mjs --dry-run`.
4. Przegląd `git status` i `git diff --stat` (brak plików tymczasowych, logów ani sekretów).

### Obowiązkowy test rozruchu serwera (`server-boot`, #59 + #80)
Przed oznaczeniem PR jako gotowy do przeglądu (`status:needs-review` / zdjęciem statusu Draft) **musi przejść na zielono** job **`server-boot`** w `.github/workflows/ci.yml` (`scripts/server_boot_test.sh`):
- Uruchamia prawdziwy dedykowany serwer **NeoForge `21.1.267`** (Java 21, `55/55` serwerowych JAR-ów, `level-type=skyblockbuilder:skyblock`, świeże `config/`, `defaultconfigs/` i `kubejs/`).
- Wymusza `0` błędów w `logs/kubejs/startup.log`, `logs/kubejs/server.log` oraz wpisach KubeJS w `logs/latest.log`.
- Wymusza brak ostrzeżeń fallbackowych i znanych regresji (`Nie udało się`, `Fallback komendowy`, `ArrowFunction(`, `Unknown event`).
- Potwierdza wykonanie komend konsolowych `halucynacje_reload_economy`, `halucynacje_sync_shoppers`, `halucynacje_sync_stages` oraz czyste zamknięcie komendą `stop` (`exit 0`, brak `crash-reports/`).
- Po `stop` wykonuje **audyt ścieżek i wartości konfiguracji modów (#80)**: oblewa, jeśli serwer utworzył osobny/domyślny plik dla naszych modów w innej ścieżce niż w repo, lub jeśli którakolwiek z kluczowych wartości (*FTB Chunks*, *FTB Essentials*, *Sophisticated Storage* w `world/serverconfig/`, *Shoppers*, *Carry On*, *Lightman's Currency*, *Jade*) wróciła do domyślnej wartości moda.
- Znacznik `[VERIFIED ON NEOFORGE 21.1.267 CI]` rezerwujemy **wyłącznie** dla własności realnie sprawdzanych asercjami w `server-boot`, a `[VERIFY ON 1.21.1 BOOT]` dla zachowań wymagających żywego klienta / sesji gracza / Mac M2 (np. perki `extra_force_load_chunks` #73, interaktywne GUI, OpenGL 4.1 / Flywheel, fizyczne `Shift + PPM` *Carry On*).

### Review Checklist dla agenta partnerskiego (na każdym PR)
Podczas przeglądu PR drugiego agenta sprawdź:
- [ ] Czy zmiana szanuje wszystkie **nienegocjowalne zasady projektu** (sekcja 5 poniżej)?
- [ ] Czy nie dodano żadnego moda magicznego ani niestabilnego na Apple Silicon Mac M2 (np. *Valkyrien Skies*, *Clockwork*)?
- [ ] Czy nie wprowadzono *Ex Deorum* / *Ex Nihilo* ani exploitu ekonomicznego (wysokie ceny za surowe bloki z Netheru/Endu)?
- [ ] Czy liczba modów mieści się w budżecie Exaroton (~95–115 modów z bibliotekami; obecnie `65` = `55` serwer / `10` klient)?
- [ ] Czy w `kubejs/server_scripts/` zachowano zasadę wspólnego zakresu globalnego Rhino (pomocniki wyłącznie w `shared_economy.js` #60, bez duplikatów z prefiksami) i przeszły testy `node --check`, `test_kubejs_logic.mjs` (z testem kolizji single-VM), `test_tab_balance.mjs`, `validate_economy.mjs`, `generate_persistent_traders.mjs --check` oraz `check_markdown_links.mjs`?
- [ ] Czy przeszedł na zielono job CI **`server-boot`** (#59 + #80 — prawdziwy rozruch NeoForge `21.1.267`, `0` błędów KubeJS, brak ostrzeżeń fallbackowych, przejście komend `halucynacje_reload_economy`, `halucynacje_sync_shoppers`, `halucynacje_sync_stages`, audyt ścieżek i wartości configów po `stop`, czysty `stop`)?
- [ ] Czy znaczniki `[VERIFIED ON NEOFORGE 21.1.267 CI]` obejmują wyłącznie faktycznie asercjonowane w CI właściwości, a punkty wymagające żywego gracza / Mac M2 są rzetelnie zapisane w `docs/PLAYTEST_CHECKLIST.md`?
- [ ] Czy dokumentacja po polsku jest aktualna, z poprawnymi angielskimi identyfikatorami modów i itemów?

Po zakończeniu prac nad PR dodaj etykietę `status:needs-review` (oraz zdejmij `status:in-progress` z powiązanego Issue po merge).

---

## 4. Taksonomia etykiet GitHub

| Etykieta | Kolor | Znaczenie |
| :--- | :--- | :--- |
| `agent:antigravity` | `#0e8a16` | Zadanie przejęte lub zaproponowane przez agenta Antigravity |
| `agent:partner` | `#1d76db` | Zadanie przejęte lub zaproponowane przez agenta partnerskiego |
| `rfc` | `#d876e3` | Request for Comments — decyzja architektoniczna wymagająca konsensusu obu stron |
| `status:in-progress` | `#fbca04` | Prace aktualnie trwają (plik/zakres zarezerwowany) |
| `status:needs-review` | `#f9d0c4` | Gotowe do przeglądu (review) przez drugiego agenta |
| `area:mods` | `#5319e7` | Lista modów, kompatybilność wersji, zależności |
| `area:economy` | `#006b75` | Sklepy, waluta, Żetony Etapów, cennik towarów |
| `area:world` | `#c2e0c6` | Wyspy *Skyblock Builder*, wymiary, generacja świata |
| `area:kubejs` | `#bfd4f2` | Skrypty KubeJS, receptury, gating wymiarów i etapów |
| `area:devops` | `#e99695` | `packwiz`, Exaroton, eksport `.mrpack`, CI/CD, konfiguracja Mac M2 |
| `mac-m2-check` | `#d93f0b` | Wymaga weryfikacji stabilności/wydajności na Apple Silicon Mac M2 |

---

## 5. Nienegocjowalne zasady projektu (Guardrails)

Żaden PR ani RFC nie może naruszać poniższych założeń bez wyraźnej, wspólnej zgody obu współzałożycieli:

1. **Silnik i wersja:** Minecraft `1.21.1`, **NeoForge**, **Create 6.x**.
2. **Hosting Exaroton:** docelowo 6–8 GB RAM, paczka zwarta i zoptymalizowana (**~95–115 modów** z bibliotekami), eksportowalna przez `packwiz` do `.mrpack` i paczki serwerowej.
3. **Bezpieczeństwo Mac M2 (Apple Silicon, macOS arm64, OpenGL 4.1):**
   - Zakaz niestabilnych modów fizyki i renderowania (*Valkyrien Skies*, *Clockwork*).
   - Obowiązkowy stos wydajnościowy: *Sodium*, *Lithium*, *FerriteCore*, *ModernFix*, *EntityCulling*, *AllTheLeaks*, *Spark*, *Clumps*.
   - Dokumentacja ustawień Flywheel pod OpenGL 4.1.
4. **Motyw Pure-Create Skyblock Tycoon:**
   - **Zero *Ex Deorum* / *Ex Nihilo*** (brak ręcznego przesiewania).
   - Wielo-wyspowy Overworld (*Skyblock Builder*: Wyspa Startowa + Wyspa-Rynek w odległości ~150 bloków pod pociągi, Chain Conveyors / Frogporty, Packagery, Hypertubes).
   - Normalny Nether (Stage 2) i normalny End (Stage 4) odblokowywane Żetonami Etapów.
5. **Ochrona ekonomii:**
   - Progi Żetonów Etapów: `10k / 50k / 100k / 250k / 1M` monet (soft gating).
   - Wysokie ceny skupu **wyłącznie za przetworzone dobra fabryczne** (posiłki Farmer's Delight, słodycze, mechanizmy Create, tory, paliwa, eksport AE2/Mekanism). Surowe bloki kopane w Netherze/Endzie nie mogą psuć balansu.
6. **Ściśle ZERO MAGII:** brak *Botania*, *Ars Nouveau*, *Iron's Spells*, *Occultism*, różdżek i mechanik magicznych.
7. **QoL i komfort gry:** stałe `keepInventory = true`, pakiet FTB (*Teams*, *Chunks*, *Essentials*, *Ultimine*, *Quests*, *XMod Compat*), *JEI*, *Jade*, *Xaero's Minimap & World Map*, *Mouse Tweaks*, *Carry On*, *Waystones*, *Sophisticated Storage & Backpacks*, *Building Gadgets 2*. Brak modów głosowych (komunikacja przez Discord) i brak modów na nagrobki (zbędne przy `keepInventory = true`).

---

## 6. Mapa katalogów repozytorium

```text
halucynacjeGTP2/
├── .github/
│   └── workflows/
│       ├── ci.yml                         # Walidacja KubeJS/ekonomii/NBT, eksport packwiz + job `server-boot` (#59)
│       ├── release.yml                    # Budowa i publikacja Release (CurseForge .zip, .mrpack, Exaroton .zip, lekki patch #43)
│       └── auto-merge.yml                 # Automatyczne zatwierdzanie i squash-merge zweryfikowanych PR
├── README.md                              # Przegląd projektu, linki, roadmapa (v1.0.8-playtest), instrukcja startowa
├── AGENTS.md                              # Ten dokument — protokół współpracy agentów AI i zasady walidacji
├── server.properties.template             # Szablon `server.properties` pod Exaroton (`skyblockbuilder:skyblock`, `allow-flight=true`)
├── docs/
│   ├── VISION.md                          # Game Design Document (pętla, wyspy, ochrona ekonomii, QoL)
│   ├── MODLIST.md                         # Kuratorowana lista 65 modów (55 serwer / 10 klient) + wykluczenia
│   ├── PROGRESSION_AND_ECONOMY.md         # Etapy 0-5, cennik fabryczny, surowce pure-Create i odnawialne rudy Mekanism
│   ├── ECONOMY_GUIDE.md                   # Komendy rynku, dynamiczny rynek (#50), Dok Eksportowy (#48), NPC Shoppers
│   ├── ISLAND_DESIGN.md                   # Projekt 3 wysp Skyblock Builder (Startowa, Wielka Wyspa-Rynek, Huta)
│   ├── ISLAND_PREVIEWS.md                 # Galeria renderów 3D i instrukcja interaktywnego podglądu HTML (#35)
│   ├── QOL_AND_SERVER_CONFIGS.md          # Konfiguracje FTB Chunks/Essentials, Carry On blacklist, Jade, Sophisticated Storage
│   ├── EXAROTON_AND_MAC_M2.md             # Poradnik serwera Exaroton i klienta Apple Silicon Mac M2 (OpenGL 4.1 / Flywheel)
│   ├── QUICKSTART_EXAROTON.md             # 5-minutowa instrukcja wdrożenia klienta i serwera Exaroton
│   ├── PLAYTEST_CHECKLIST.md              # Checklista playtestu, pokrycie CI `server-boot` vs testy klienta / Mac M2
│   └── renders/                           # Rendery 3D PNG wysp + interaktywny `island_viewer_3d.html` (#35)
├── kubejs/
│   ├── assets/kubejs/                     # Polskie tłumaczenia (`lang/pl_pl.json`), modele i tekstury 16x16 Żetonów Etapów
│   ├── startup_scripts/
│   │   └── stage_tokens.js                # Definicje przedmiotów Żetonów Etapów (`kubejs:stage_1_token`..`stage_5_token`)
│   └── server_scripts/
│       ├── shared_economy.js              # (`priority: 100`) Wspólne stałe i pomocniki ekonomii w globalnym zakresie Rhino (#60)
│       ├── dimension_gating.js            # Realizacja żetonów, perki etapowe (#51), gating Nether/End (#64), keepInventory
│       ├── economy_anti_exploit.js        # Blokada Coin Mint/Slot Machine + auto-sync 148 cen Shoppers po hashu (#62)
│       ├── economy_contracts.js           # Dynamiczne kontrakty `/kontrakt` (+35%..+55% z serią, #50)
│       ├── economy_market.js              # Rynek hurtowy, marże Wyspy-Rynku, Dok Eksportowy (#48), Market Boom (#50), top (#53)
│       ├── economy_tab_balance.js         # Łączne saldo (EQ + portfel + bank + drużyna) pod klawiszem TAB i `/saldo` (#61)
│       └── skyblock_create_recipes.js     # Receptury pure-Create dla Skyblocka + odnawialne rudy Mekanism Stage 3-4 (#49)
├── packwiz/
│   ├── pack.toml                          # Manifest paczki (MC 1.21.1, NeoForge 21.1.267)
│   ├── index.toml                         # Indeks hashy SHA-256 wszystkich modów
│   ├── .packwizignore                     # Wykluczenia eksportu packwiz
│   ├── README.md                          # Instrukcja odświeżania i eksportu packwiz
│   └── mods/                              # 65 definicji `.pw.toml` (55 serwerowych + 10 czysto klienckich)
├── config/
│   ├── carryon-common.toml                # Czarna lista Carry On (Create, Mekanism, AE2, Lightman's, Shoppers, Waystones)
│   ├── ftbchunks-world.snbt               # FTB Chunks 1.21.1 (100 claimów, 20 force-load, Fake Players, wyłączona minimapa)
│   ├── ftbessentials.snbt                 # FTB Essentials 1.21.1 (`/home`, `/tpa`, `/back`, `/spawn`, wyłączone `/rtp` i cheaty)
│   ├── shoppers-common.toml               # Konfiguracja NPC Shoppers na Wyspie-Rynku (`spawnRadius = 5.0..15.0`)
│   ├── sophisticatedstorage-common.toml   # Wspólne ustawienia Sophisticated Storage (`dropPacked = false`)
│   ├── lightmanscurrency-common.txt       # Ustawienia Lightman's Currency (m.in. `canMint=false`)
│   ├── lightmanscurrency-server.txt       # Ustawienia serwerowe Lightman's Currency (`lcterminalCommand=true`)
│   ├── lightmanscurrency/
│   │   └── PersistentTraders.json         # 10 sklepów sieciowych `[KUP]/[SKUP]` (172 oferty zsynchronizowane z `prices.json`)
│   ├── halucynacje_economy/
│   │   └── prices.json                    # Źródło prawdy cennika (61 blokad Tier 0, 87 towarów Tier 1-5, 80 Buy, 5 Żetonów)
│   ├── jade/
│   │   └── jade.json                      # Konfiguracja HUD Jade (`WailaConfig.CODEC`)
│   ├── ftbquests/quests/                  # Księga zadań Etapy 0-5 (`data.snbt`, `chapter_groups.snbt`, `chapters/*.snbt`, `README.md`)
│   └── skyblockbuilder/                   # 7 plików `.json5` + `templates/` (`islands/starter_island.nbt`, `spreads/market_island.nbt`, `spreads/industrial_island.nbt`)
├── defaultconfigs/
│   └── sophisticatedstorage-server.toml   # Konfiguracja per-świat NeoForge kopiowana do `world/serverconfig/` (zasięg kontrolera 15, magnes 3/4, hopper)
├── scripts/
│   ├── bundle_mrpack_overrides.mjs        # Dołączanie `overrides/` (config, defaultconfigs, 3 wyspy .nbt, kubejs) do `.mrpack`
│   ├── check_markdown_links.mjs           # Walidator względnych linków Markdown
│   ├── export_curseforge_pack.mjs         # Eksporter natywnej paczki CurseForge App (65/65 modów + overrides)
│   ├── export_server_pack.mjs             # Eksporter paczki serwerowej Exaroton (55/55 JAR + config + defaultconfigs + kubejs)
│   ├── generate_island_nbt.py             # Generator i weryfikator 3 binarnych wysp `.nbt` (`DataVersion 3955`)
│   ├── generate_persistent_traders.mjs    # Generator i walidator (`--check`) `PersistentTraders.json` z `prices.json`
│   ├── render_islands_3d.py               # Generator renderów 3D PNG i interaktywnego widoku HTML wysp (#35)
│   ├── server_boot_test.sh                # Smoke test rozruchu prawdziwego serwera NeoForge 21.1.267 + audyt configów (#59, #80)
│   ├── test_kubejs_logic.mjs              # Testy jednostkowe KubeJS + test kolizji nazw globalnych w jednej VM Rhino (#60)
│   ├── test_tab_balance.mjs               # Testy logiki ujednoliconego salda TAB / portfel / bank (#61)
│   └── validate_economy.mjs               # Walidator cennika `prices.json`, progresji i 16 reguł anty-arbitrażowych
└── schematics/
    └── README.md                          # Dokumentacja szablonów wysp `.nbt` i współrzędnych trójkąta Overworlda
```
