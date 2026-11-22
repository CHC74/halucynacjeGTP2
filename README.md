# HalucynacjeGTP2 — Create Skyblock Tycoon (NeoForge 1.21.1)

Modpack kooperacyjny typu **Create Skyblock Tycoon** budowany na **Minecraft 1.21.1 (NeoForge)** z wykorzystaniem **Create 6.x**. Zaprojektowany z myślą o płynnej rozgrywce na hostingu **Exaroton (6–8 GB RAM)** oraz pełnej kompatybilności z klientem na **Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)**.

---

## Szybki start (5 minut — Exaroton + Klient)

👉 **[docs/QUICKSTART_EXAROTON.md](docs/QUICKSTART_EXAROTON.md)** — gotowa instrukcja „krok po kroku” pobrania **`halucynacjeGTP2-curseforge.zip`** (**CurseForge App** — PC & Mac M2; dostępny także `.mrpack` dla Prism/Modrinth), pełnej paczki **`halucynacjeGTP2-server-exaroton.zip`** (komplet **55/55 JAR** + 3 binarne wyspy `.nbt` + `server.properties`) oraz lekkiego patcha **`halucynacjeGTP2-server-patch.zip`** (wyłącznie zmienione pliki `kubejs/` i `config/` od poprzedniego wydania, #43) prosto z **[GitHub Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** (aktualne wydanie: **`v1.0.8-playtest`**)!

---

## Szybkie linki do dokumentacji

- [docs/QUICKSTART_EXAROTON.md](docs/QUICKSTART_EXAROTON.md) — **5-minutowa instrukcja instalacji klienta (CurseForge App / Prism Launcher) i serwera Exaroton**
- [AGENTS.md](AGENTS.md) — protokół współpracy wielu agentów AI (branching, claimowanie zadań, wspólny zakres globalny Rhino, wymóg CI `server-boot`, mapa katalogów)
- [docs/VISION.md](docs/VISION.md) — pełny Game Design Document (pętla rozgrywki, wyspy, ochrona ekonomii, zasady QoL)
- [docs/MODLIST.md](docs/MODLIST.md) — kuratorowana lista modów (**65 modów** = **55** serwer + **10** czysto klienckich, z bibliotekami, limit Exaroton `<= 115`) oraz lista wykluczeń
- [docs/PROGRESSION_AND_ECONOMY.md](docs/PROGRESSION_AND_ECONOMY.md) — 6-poziomowa progresja (Stage 0–5), cennik towarów fabrycznych i ścieżki surowcowe pure-Create
- [docs/ECONOMY_GUIDE.md](docs/ECONOMY_GUIDE.md) — przewodnik po komendach rynku, hurtowym skupie, dynamicznym rynku (*Market Boom* `+40%`, *Diversity Bonus*, serie kontraktów), Doku Eksportowym i sklepach NPC *Shoppers*
- [docs/ISLAND_DESIGN.md](docs/ISLAND_DESIGN.md) — projekt 3 wysp *Skyblock Builder* (Wyspa Startowa, Wielka Wyspa-Rynek ~150 bloków, Huta Południowa)
- [docs/ISLAND_PREVIEWS.md](docs/ISLAND_PREVIEWS.md) — **rendery 3D wszystkich 3 wysp `.nbt` + interaktywny podgląd 3D HTML** (#35, zatwierdzanie bez restartu serwera!)
- [docs/QOL_AND_SERVER_CONFIGS.md](docs/QOL_AND_SERVER_CONFIGS.md) — konfiguracje QoL, limity *FTB Chunks*/*Essentials*, blacklista *Carry On* i limity *Sophisticated Storage*
- [docs/EXAROTON_AND_MAC_M2.md](docs/EXAROTON_AND_MAC_M2.md) — konfiguracja serwera Exaroton i checklista wydajnościowa pod Apple Silicon Mac M2
- [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) — checklista pierwszego uruchomienia, playtestu na Exaroton + Mac M2 oraz tabela pokrycia CI `server-boot` vs testy klienta
- Dystrybucja i konfiguracje:
  - [packwiz/README.md](packwiz/README.md) — definicja `packwiz` (NeoForge `21.1.267`, Create `6.0.10`, 65 modów), eksport `.mrpack`, CurseForge `.zip` i paczki serwerowej Exaroton
  - [schematics/README.md](schematics/README.md) — dokumentacja 3 binarnych szablonów wysp `.nbt` (`starter_island`, `market_island`, `industrial_island`)
  - [config/ftbquests/quests/README.md](config/ftbquests/quests/README.md) — struktura księgi zadań *FTB Quests* (Etapy 0–5, dotacje startowe Stage 0 #52) i deterministyczne ID tasków
  - [config/halucynacje_economy/prices.json](config/halucynacje_economy/prices.json) — źródło prawdy cennika (**61** blokad Tier 0 = `0`, **87** towarów Tier 1–5 hurt + NPC `+20%`, **80** pozycji Buy, **5** Żetonów Etapów)
  - [config/lightmanscurrency/PersistentTraders.json](config/lightmanscurrency/PersistentTraders.json) — **10** sklepów sieciowych `[KUP]/[SKUP]` (172 oferty zsynchronizowane z `prices.json`, #46)
- Skrypty KubeJS:
  - [kubejs/startup_scripts/stage_tokens.js](kubejs/startup_scripts/stage_tokens.js) — rejestracja 5 Żetonów Etapów (`kubejs:stage_1_token`..`stage_5_token`, tekstury 16×16 i polskie nazwy)
  - [kubejs/server_scripts/shared_economy.js](kubejs/server_scripts/shared_economy.js) — wspólne stałe i pomocniki ekonomii (`priority: 100`, jeden globalny zakres Rhino, ujednolicone saldo portfel/bank/monety, #60/#61)
  - [kubejs/server_scripts/dimension_gating.js](kubejs/server_scripts/dimension_gating.js) — realizacja żetonów i realne perki etapowe (#51), spięcie z *FTB Quests*, gating Netheru (Etap 2) / Endu (Etap 4, #64) oraz stałe `keepInventory = true`
  - [kubejs/server_scripts/skyblock_create_recipes.js](kubejs/server_scripts/skyblock_create_recipes.js) — receptury pure-Create uzupełniające luki surowcowe Skyblocka oraz odnawialne łańcuchy rud *Mekanism* (Stage 3–4, #49)
  - [kubejs/server_scripts/economy_anti_exploit.js](kubejs/server_scripts/economy_anti_exploit.js) — blokada *Coin Mint* / *Slot Machine* oraz automatyczna synchronizacja 148 cen *Shoppers* z `prices.json` przez `ShoppersWorldData` API po hashu treści (#62)
  - [kubejs/server_scripts/economy_market.js](kubejs/server_scripts/economy_market.js) — hurtowy terminal/rynek (`/ekonomia`, `/ekonomia top`, `/sprzedaj`, `/sklep`, `/kup`, `/cennik`), marże Wyspy-Rynku i Automatyczny Dok Eksportowy (#48), *Market Boom* `+40%` i *Factory Diversity Bonus* (#50) oraz kamienie milowe Tycoona (#53)
  - [kubejs/server_scripts/economy_contracts.js](kubejs/server_scripts/economy_contracts.js) — dynamiczne kontrakty fabryczne (`/kontrakt`, `/kontrakt oddaj`, `/kontrakt nowy`) z premią `+35%` rosnącą z serią do `+55%` (#50)
  - [kubejs/server_scripts/economy_tab_balance.js](kubejs/server_scripts/economy_tab_balance.js) — wyświetlanie łącznego salda (ekwipunek + portfel + bank + drużyna) pod klawiszem `TAB` oraz komenda `/saldo` (#61)

---

## Nienegocjowalne filary serwera

1. **Platforma:** Minecraft `1.21.1`, **NeoForge** (`21.1.267`), **Create 6.x** (`6.0.10`).
2. **Pure-Create Skyblock:** zero *Ex Deorum* / *Ex Nihilo* i ręcznego przesiewania — wszystkie surowce bazowe (w tym odnawialne rudy *Mekanism* w Stage 3–4, #49) zdobywane są przez automatyzację w Create (młyny, płukanie, mieszanie, ekstrudery, logistyka).
3. **Wielo-wyspowy Overworld + odblokowywane wymiary:** *Skyblock Builder* generuje Wyspę Startową (Fabryczną), Wielką Wyspę-Rynek (~150 bloków) i Hutę Południową (~150 bloków), co naturalnie zachęca do budowy pociągów Create, Chain Conveyors / Frogportów, Packagerów i Hypertubes (z marżami lokalizacyjnymi i Automatycznym Dokiem Eksportowym, #48). Normalny **Nether** (Stage 2) oraz **End** (Stage 4 + odblokowany Portal Endu, #64) otwierane są Żetonami Etapów.
4. **Ekonomia oparta na dobrach przetworzonych:** **10** sklepów sieciowych `[KUP]/[SKUP]` (**87** towarów Tier 1–5, **80** pozycji Buy, **61** blokad Tier 0 = `0`, #46), dynamiczny rynek (*Market Boom* `+40%`, *Diversity Bonus*, serie kontraktów `+35%`..`+55%`, #50), fizyczne sklepy NPC (*Lightman's Currency* + *Shoppers*, `+20%`) zasilane logistyką Create oraz **Żetony Etapów** (`10k / 50k / 100k / 250k / 1M` monet) z realnymi perkami etapowymi (#51). Wysokie wypłaty wyłącznie za przetworzone dobra fabryczne, nigdy za surowe wykopane bloki z Netheru czy Endu.
5. **Ściśle ZERO MAGII:** brak Botania, Ars Nouveau, różdżek i systemów mistycznych. Wyłącznie inżynieria mechaniczna, gastronomia przemysłowa i late-game high-tech (*Applied Energistics 2* + *Create: Applied Kinetics*, *Mekanism*).
6. **Bezpieczeństwo Mac M2 & lekkość na Exaroton:** **65 modów** (**55** serwerowych + **10** czysto klienckich, wraz z bibliotekami — duży zapas wobec budżetu ~95–115), sprawdzony stos optymalizacyjny (*Sodium*, *Lithium*, *FerriteCore*, *ModernFix*, *EntityCulling*, *AllTheLeaks*, *Spark*, *Clumps*), całkowity zakaz niestabilnych modów fizyki/renderingu (*Valkyrien Skies*, *Clockwork*).
7. **Przyjazne QoL:** stałe `keepInventory = true`, pełny pakiet FTB (*Teams*, *Chunks*, *Essentials*, *Ultimine*, *Quests*, *XMod Compat*), *JEI*, *Jade*, *Xaero's Minimap & World Map*, *Waystones*, *Carry On*, *Mouse Tweaks*, *Sophisticated Storage & Backpacks*, *Building Gadgets 2*.

---

## Status mapy drogowej (Roadmap)

| Faza | Zakres | Status |
| :--- | :--- | :--- |
| **Faza 0** | Architektura początkowa, GDD, protokół agentów (`AGENTS.md`), szkielety KubeJS | ✅ Ukończona |
| **Faza 1** | Uzgodnienie finalnej listy modów (RFC #3) i zasad ekonomii (RFC #5) | ✅ Ukończona |
| **Faza 2** | Inicjalizacja `packwiz` (**65** modów = **55** serwer / **10** klient), eksport CurseForge `.zip` + `.mrpack`, eksporter Exaroton i GitHub Actions CI | ✅ Ukończona |
| **Faza 3** | Zweryfikowane configi *Skyblock Builder* 1.21.1, 3 realne binarne wyspy `.nbt` (`DataVersion 3955`) oraz rendery 3D + interaktywny podgląd HTML (#35) | ✅ Ukończona |
| **Faza 4** | Przebudowa sklepu na **10** sklepów sieciowych `[KUP]/[SKUP]` (**87** towarów Tier 1–5, **80** Buy, **61** blokad Tier 0, #46), dynamiczny rynek (*Market Boom* `+40%`, *Diversity Bonus*, serie kontraktów, #50), Automatyczny Dok Eksportowy i marże Wyspy-Rynku (#48), odnawialne rudy *Mekanism* (#49), realne perki Żetonów Etapów (#51), dotacje startowe *FTB Quests* (#52), Portal Endu na Etapie 4 (#64), ujednolicone saldo TAB/portfel/bank (#61), auto-sync *Shoppers* (#62) i centralny `shared_economy.js` (#60) | ✅ Ukończona |
| **Faza 5** | Wydanie GitHub Release **`v1.0.8-playtest`** (CurseForge `.zip` + `.mrpack` + Exaroton `.zip` + lekki patch serwerowy `halucynacjeGTP2-server-patch.zip` od #43) oraz automatyczny job CI **`server-boot`** (prawdziwy rozruch NeoForge `21.1.267`, #59) + live playtest | 🚀 Gotowe do gry! |

---

## Instalacja i uruchamianie

Pełna 5-minutowa instrukcja wdrożenia: **[docs/QUICKSTART_EXAROTON.md](docs/QUICKSTART_EXAROTON.md)** (oraz procedura smoke-testu w [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md)).

### Klient — Opcja A (Główna): CurseForge App (`halucynacjeGTP2-curseforge.zip`)
1. Pobierz **`halucynacjeGTP2-curseforge.zip`** z zakładki **[Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** (`v1.0.8-playtest` lub nowsze; albo wyeksportuj lokalnie przez `node scripts/export_curseforge_pack.mjs`).
2. W **CurseForge App** kliknij **Create Custom Profile** → **Import** → wskaż pobrany plik `.zip` — profil automatycznie skonfiguruje NeoForge `21.1.267`, pobierze 15 natywnych modów CurseForge i rozpakuje 50 zweryfikowanych JAR-ów Modrinth + `config/` (3 wyspy `.nbt`) + `kubejs/`.
3. W **Profile Options** ustaw **6 GB RAM (`6144 MB`)**, a na **Apple Silicon Mac M2** upewnij się, że CurseForge używa natywnej **Java 21 `arm64`** oraz zapoznaj się z ustawieniami Flywheel pod OpenGL 4.1 w [docs/EXAROTON_AND_MAC_M2.md](docs/EXAROTON_AND_MAC_M2.md).

### Klient — Opcja B (Alternatywna): Prism Launcher / Modrinth App (`halucynacjeGTP2.mrpack`)
1. Pobierz **`halucynacjeGTP2.mrpack`** z zakładki **[Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** i przeciągnij do **Prism Launcher** (lub Modrinth App).
2. Ustaw **Java 21** (na Mac M2: natywna `arm64`) oraz **6 GB RAM** (`-Xms4G -Xmx6G`).

### Serwer (Exaroton)
1. **Nowa instalacja:** Pobierz gotowe archiwum **`halucynacjeGTP2-server-exaroton.zip`** z zakładki **[Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** (zawiera wszystkie **55/55 plików `.jar`**, `config/`, 3 wyspy `.nbt`, `kubejs/` oraz `server.properties` — alternatywnie zbuduj lokalnie przez `node scripts/export_server_pack.mjs`).
2. **Szybka aktualizacja istniejącego serwera:** Zamiast ponownie wgrywać 135 MB modów, pobierz lekki **`halucynacjeGTP2-server-patch.zip`** (~17–65 KB, wyłącznie zmienione pliki `kubejs/` i `config/` od poprzedniego wydania, #43), rozpakuj nadpisując istniejące pliki na Exaroton i wykonaj `/reload` lub restart serwera.
3. Na **Exaroton** ustaw Software **NeoForge `21.1.267`** (**MC `1.21.1`**), **RAM 6–8 GB**, **Allow Flight = ON**, wgraj `mods/`, `config/`, `kubejs/` i wygeneruj świat z typem **`skyblockbuilder:skyblock`**.
4. Przejdź punkty kontrolne z [docs/PLAYTEST_CHECKLIST.md](docs/PLAYTEST_CHECKLIST.md) (w tym `/halucynacje_sync_shoppers` i profilowanie `/spark tps`).