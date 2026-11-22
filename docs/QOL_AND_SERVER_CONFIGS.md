# QOL_AND_SERVER_CONFIGS.md — Konfiguracje QoL i Limity pod Exaroton & Mac M2

Ten dokument opisuje wszystkie konfiguracje Quality-of-Life, ochrony przed korupcją świata oraz limity wydajnościowe przygotowane w ramach **Goal 2 (Track 2)** dla serwera **Exaroton (6–8 GB RAM)** oraz klientów na **Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)**.

Powiązane dokumenty:
- [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md) — ogólny poradnik serwera Exaroton i klienta Mac M2
- [docs/ISLAND_DESIGN.md](ISLAND_DESIGN.md) — układ trójkąta 3 wysp Overworlda
- [docs/VISION.md](VISION.md) — zasady QoL i ochrony ekonomii
- [docs/PLAYTEST_CHECKLIST.md](PLAYTEST_CHECKLIST.md) — pełna checklista testów CI vs ręczny playtest

---

## 1. FTB Chunks — budżet chunk-loadingu i Create Fake Players

Plik (rzeczywista ścieżka ładowania *FTB Library* `2101.1.40` `ConfigManager` — synchronizowana automatycznie do wszystkich klientów):
- [`config/ftbchunks-world.snbt`](../config/ftbchunks-world.snbt) *(uwaga: `world/serverconfig/ftbchunks-world.snbt` służy w 1.21.1 wyłącznie jako opcjonalny override per-świat; dawny plik `ftbchunks-common.snbt` nie istnieje w FTB Chunks 1.21.1!)*

### Dlaczego takie ustawienia?
1. **Budżet chunk-loadingu pod Exaroton (`force_loading.max_force_loaded_chunks: 20`, `claiming.max_claimed_chunks: 100`):**
   - Na serwerze 6–8 GB RAM z aktywnym Create 6, Farmer's Delight, AE2 i Mekanism każdy na stałe załadowany chunk generuje koszt ticków (`MSPT`).
   - Bazowy limit **20 chunków force-load na drużynę** (skalowany dalej perkami za Etapy `extra_force_load_chunks` #73) pozwala utrzymać w pełni załadowane:
     - serce fabryki na Wyspie Startowej (~6–8 chunków),
     - kluczowe stacje i stoiska na Wyspie-Rynku (~4–6 chunków),
     - fragment Huty Południowej / pompy lawy w Netherze (~6–8 chunków).
   - Przy 1–2 drużynach daje to bezpieczny zapas pod stabilne **20 TPS**.
2. **Tryb ładowania (`force_loading.force_load_mode: "default"`):**
   - Bez *FTB Ranks* chunki pracują wyłącznie, dopóki przynajmniej jeden gracz drużyny jest online. Gdy wszyscy się wylogują, serwer nie marnuje kredytów/CPU Exaroton na puste symulacje.
3. **KRYTYCZNE: `fake_players.fake_players: "allow"` + `team_prop_defaults.def_fake_players: true` + `def_fake_player_ids: true`:**
   - W Create 6 bloki takie jak **Deployer**, **Mechanical Drill**, **Mechanical Harvester**, **Mechanical Plough** czy **Spout** działają jako tzw. *Fake Players*.
   - Bez włączenia tej opcji ochrona zclaimowanych chunków FTB Chunks zablokuje pracę Deployerów i linii Precision Mechanism wewnątrz własnej bazy graczy!
4. **Wyłączenie dublowanej minimapy (`force_disable_minimap: true`):**
   - Paczka zawiera już **Xaero's Minimap** i **Xaero's World Map**. Ustawienie `force_disable_minimap: true` w `config/ftbchunks-world.snbt` wymusza po stronie serwera wyłączenie minimapy FTB Chunks u wszystkich klientów (Windows PC & **Mac M2 OpenGL 4.1**), oszczędzając VRAM i narzut renderingu. Ekran claimowania chunków nadal działa bez zmian.

---

## 2. FTB Essentials — wygodne komendy bez psucia balansu

Plik (rzeczywista ścieżka ładowania `FTBEssentials.init()` w `2101.1.10`):
- [`config/ftbessentials.snbt`](../config/ftbessentials.snbt)

| Grupa / Komenda | Status | Parametry | Uzasadnienie |
| :--- | :--- | :--- | :--- |
| `teleportation.home` (`/home`) | ✅ Włączona | `max: 5`, `cooldown: 5s`, `warmup: 0s` | Szybkie przemieszczanie między Wyspą Startową, Rynkiem, Hutą i bazą w Netherze |
| `teleportation.tpa` (`/tpa`) | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Wygodna gra kooperacyjna ze znajomymi |
| `teleportation.spawn` (`/spawn`) | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Szybki powrót na punkt startowy wyspy |
| `teleportation.back` (`/back`) | ✅ Włączona | `max: 5`, `cooldown: 10s`, `warmup: 0s` | Wygodny powrót po szybkim skoku na Rynek lub po śmierci (obok `keepInventory = true`) |
| `teleportation.warp` (`/warp`) | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Opcjonalne publiczne punkty orientacyjne |
| `misc.hat`, `misc.nick`, `misc.leaderboard`, `misc.rec` | ✅ Włączone | — | Czysty fun-factor co-op bez wpływu na balans |
| `teleportation.rtp` (`/rtp`) | ❌ Wyłączona | — | W pustym Overworldzie Skyblock losowy teleport w próżnię jest bezużyteczny |
| `teleportation.jump` (`/jump`) | ❌ Wyłączona | — | Chroni wartość jetpacków *Create: SA* i *Hypertubes* |
| `admin.*` (`/fly`, `/god`, `/heal`, `/feed`, `/extinguish`, `/speed`) | ❌ Wyłączone | — | Chronią sens progresji, kuchni *Farmer's Delight* i narzędzi inżynierskich |
| `misc.*` (`/anvil`, `/crafting`, `/enderchest`, `/smithing`, `/stonecutter`, `/trashcan`) | ❌ Wyłączone | — | Chronią fizyczną logistykę warsztatów, magazynów i utylizacji (lawa / zsyp) |

---

## 3. Carry On — ochrona przed korupcją zapisów i duplikacją

Plik: [`config/carryon-common.toml`](../config/carryon-common.toml)

`Carry On` jest świetny na Skyblocku do przestawiania zwykłych skrzyń, beczek i przenoszenia krów/owiec na nową zagrodę (`pickupHostileMobs = false`, `slownessInCreative = false`). Jednocześnie podnoszenie złożonych maszyn potrafi uszkodzić dane NBT lub zepsuć multi-blocki.

Dlatego czarna lista (`blacklist.forbiddenTiles` / `forbiddenEntities` / `forbiddenStacking`) **bezwzględnie blokuje**:
- **Create 6 i wszystkie addony** (`create:*`, `railways:*`, `create_hypertube:*`, `createaddition:*`, `create_enchantment_industry:*`, `trading_floor:*`, `create_mechanical_extruder:*`, `create_central_kitchen:*`, `sliceanddice:*`, `create_connected:*`, `copycats:*`, `createappliedkinetics:*`) — chroni kotły parowe, zbiorniki płynów, Item Vaulty, Packagery, Frogporty, pociągi i kontrapcje.
- **Mekanism & Generators** (`mekanism:*`, `mekanismgenerators:*`) — chroni reaktory, turbiny, rury i QIO przed uszkodzeniem sieci i wyciekiem promieniowania.
- **Applied Energistics 2** (`ae2:*`) — chroni ME Controllery, dyski ME Drive (ryzyko ogromnych pakietów NBT!) i kable.
- **Ekonomia i NPC** (`lightmanscurrency:*`, `shoppers:*`) — **nigdy** nie pozwala podnosić bankomatów ATM, Trading Terminali, stoisk sklepowych ani klientów NPC `Shoppers` na Wyspie-Rynku!
- **Infrastruktura świata** (`waystones:*`, kontrolery `sophisticatedstorage:controller` / `storage_link`, `ftbquests:*`, spawnery Vanilla).

---

## 4. Jade & Sophisticated Storage — czytelny HUD i zdrowe pakiety NBT

- [`config/jade/jade.json`](../config/jade/jade.json) *(schemat `WailaConfig.CODEC` Jade `15.10.6`)* — czytelny HUD w trybie `TOGGLE`, wyświetlający płyny (`fluidMode: "ANY"`), nazwę moda (`itemModNameTooltip: true`), przesuwający się pod pasek bossa (`bossBarOverlapMode: "PUSH_DOWN"`) i automatycznie ukrywający się przy liście graczy `Tab` (`hideFromTabList: true`).
- [`config/sophisticatedstorage-server.toml`](../config/sophisticatedstorage-server.toml) *(rzeczywista ścieżka `ModConfig.Type.SERVER` w NeoForge `21.1.267`; `world/serverconfig/` to wyłącznie opcjonalny override per-świat)* — ograniczony zasięg Storage Controllera `server.controllerRange = 15`, zasięg magnesów (`magnetUpgrade.magnetRange = 3`, `advancedMagnetUpgrade.magnetRange = 4`) oraz złagodzony interwał `advancedHopperUpgrade.transferSpeedTicks = 4` pod TPS Exaroton.
- [`config/sophisticatedstorage-common.toml`](../config/sophisticatedstorage-common.toml) — `common.dropPacked = false` (zachowuje użycie Packing Tape przy rozbijaniu pełnych skrzyń).

---

## 5. Pokrycie CI `server-boot` vs Checklista żywej sesji (`[VERIFY ON 1.21.1 BOOT]`)

Job CI **`server-boot`** (`scripts/server_boot_test.sh`, #59 + #80) uruchamia prawdziwy serwer **NeoForge `21.1.267`** i **po czystym `stop` asertywnie weryfikuje**:
- brak nieoczekiwanych / zduplikowanych plików konfiguracyjnych naszych modów w `config/` i `world/serverconfig/` (gwarancja, że żaden plik nie został po cichu zignorowany),
- aktywne wartości zapisane na dysk przez serwer dla: `config/ftbchunks-world.snbt`, `config/ftbessentials.snbt`, `config/sophisticatedstorage-server.toml`, `config/sophisticatedstorage-common.toml`, `config/shoppers-common.toml`, `config/carryon-common.toml`, `config/lightmanscurrency-common.txt`, `config/lightmanscurrency-server.txt` oraz `config/jade/jade.json`.

Poniższe punkty wymagają **żywej sesji gracza / klienta Mac M2** (`[VERIFY ON 1.21.1 BOOT]`, szczegóły w [docs/PLAYTEST_CHECKLIST.md](PLAYTEST_CHECKLIST.md)):
1. **Perki chunków za Etapy (`ftbchunks admin extra_force_load_chunks <gracz> set <N>`, #73) oraz Create Deployer:** po odblokowaniu Etapu 1–5 przez zalogowanego gracza potwierdzić wzrost limitu force-load powyżej bazowych `20` oraz swobodną pracę Deployera na zclaimowanym chunku.
2. **Żywe komendy *FTB Essentials*:** potwierdzić w grze działanie `/home`, `/back`, `/tpa`, `/spawn` oraz odrzucenie `/rtp`, `/fly`, `/god`, `/heal`, `/feed`.
3. **Składnia wildcardów *Carry On* w grze:** przetestować `Shift + PPM` pustą ręką — **działa** na zwykłą skrzynię / krowę, a jest **zablokowane** na `create:fluid_tank`, `lightmanscurrency:terminal`, `waystones:waystone` oraz NPC `shoppers`.
4. **Zasięg *Sophisticated Storage* w grze:** zweryfikować na żywo zasięg Storage Controllera (15 bloków) i magnesu (3 / 4 bloki).
5. **Klient Mac M2 — brak podwójnej minimapy i HUD *Jade*:** sprawdzić na kliencie, że widoczna jest wyłącznie minimapa *Xaero's Minimap* (mimo aktywnego ekranu claimowania *FTB Chunks*) oraz że *Jade* chowa się po wciśnięciu `Tab`.
