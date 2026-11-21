# QOL_AND_SERVER_CONFIGS.md — Konfiguracje QoL i Limity pod Exaroton & Mac M2

Ten dokument opisuje wszystkie konfiguracje Quality-of-Life, ochrony przed korupcją świata oraz limity wydajnościowe przygotowane w ramach **Goal 2 (Track 2)** dla serwera **Exaroton (6–8 GB RAM)** oraz klientów na **Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)**.

Powiązane dokumenty:
- [docs/EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md) — ogólny poradnik serwera Exaroton i klienta Mac M2
- [docs/ISLAND_DESIGN.md](ISLAND_DESIGN.md) — układ trójkąta 3 wysp Overworlda
- [docs/VISION.md](VISION.md) — zasady QoL i ochrony ekonomii

---

## 1. FTB Chunks — budżet chunk-loadingu i Create Fake Players

Pliki:
- [`config/ftbchunks/ftbchunks-world.snbt`](../config/ftbchunks/ftbchunks-world.snbt)
- [`config/ftbchunks/ftbchunks-common.snbt`](../config/ftbchunks/ftbchunks-common.snbt)

### Dlaczego takie ustawienia?
1. **Budżet chunk-loadingu pod Exaroton (`max_force_loaded_chunks: 20`):**
   - Na serwerze 6–8 GB RAM z aktywnym Create 6, Farmer's Delight, AE2 i Mekanism każdy na stałe załadowany chunk generuje koszt ticków (`MSPT`).
   - Limit **20 chunków na drużynę** (złoty środek z przedziału 16–25) pozwala utrzymać w pełni załadowane:
     - serce fabryki na Wyspie Startowej (~6–8 chunków),
     - kluczowe stacje i stoiska na Wyspie-Rynku (~4–6 chunków),
     - fragment Wyspy Przemysłowej / pompy lawy w Netherze (~6–8 chunków).
   - Przy 1–2 drużynach daje to maksymalnie **20–40 wymuszonych chunków** — bezpieczny zapas pod stabilne **20 TPS**.
2. **Tryb ładowania (`force_load_mode: "default"`, `chunk_load_offline: false`):**
   - Chunki pracują, dopóki przynajmniej jeden gracz drużyny jest online. Gdy wszyscy się wylogują, serwer nie marnuje kredytów/CPU Exaroton na puste symulacje.
3. **KRYTYCZNE: `fake_players: "allow"` + `allow_fake_players_by_id: true`:**
   - W Create 6 bloki takie jak **Deployer**, **Mechanical Drill**, **Mechanical Harvester**, **Mechanical Plough** czy **Spout** działają jako tzw. *Fake Players*.
   - Bez włączenia tej opcji ochrona zclaimowanych chunków FTB Chunks zablokuje pracę Deployerów i linii Precision Mechanism wewnątrz własnej bazy graczy!
4. **Wyłączenie dublowanej minimapy (`minimap_enabled: false`):**
   - Paczka zawiera już **Xaero's Minimap** i **Xaero's World Map**. Wyłączenie minimapy FTB Chunks eliminuje nakładanie się dwóch map w rogu ekranu oraz redukuje narzut renderingu na **Mac M2 (OpenGL 4.1)**. Ekran claimowania chunków działa bez zmian.

---

## 2. FTB Essentials — wygodne komendy bez psucia balansu

Plik: [`config/ftbessentials/ftbessentials.snbt`](../config/ftbessentials/ftbessentials.snbt)

| Komenda | Status | Parametry | Uzasadnienie |
| :--- | :--- | :--- | :--- |
| `/home` | ✅ Włączona | `max: 5`, `cooldown: 5s`, `warmup: 0s` | Szybkie przemieszczanie między Wyspą Startową, Rynkiem, Hutą i bazą w Netherze |
| `/tpa` | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Wygodna gra kooperacyjna ze znajomymi |
| `/spawn` | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Szybki powrót na punkt startowy wyspy |
| `/back` | ✅ Włączona | `max: 5`, `cooldown: 10s`, `warmup: 0s` | Wygodny powrót po szybkim skoku na Rynek lub po śmierci (obok `keepInventory = true`) |
| `/warp` | ✅ Włączona | `cooldown: 5s`, `warmup: 0s` | Opcjonalne publiczne punkty orientacyjne |
| `/hat`, `/nick` | ✅ Włączone | — | Czysty fun-factor co-op bez wpływu na balans |
| `/rtp` | ❌ Wyłączona | — | W pustym Overworldzie Skyblock losowy teleport w próżnię jest bezużyteczny |
| `/fly`, `/god`, `/heal`, `/feed`, `/enderchest`, `/anvil`, `/trashcan`, `/jump` | ❌ Wyłączone | — | Chronią sens narzędzi inżynierskich (*Create: SA* jetpack, *Hypertubes*, kuchnia *Farmer's Delight*, logistyka śmieci) |

---

## 3. Carry On — ochrona przed korupcją zapisów i duplikacją

Plik: [`config/carryon-common.toml`](../config/carryon-common.toml)

`Carry On` jest świetny na Skyblocku do przestawiania zwykłych skrzyń, beczek i przenoszenia krów/owiec na nową zagrodę (`pickupHostileMobs = false`). Jednocześnie podnoszenie złożonych maszyn potrafi uszkodzić dane NBT lub zepsuć multi-blocki.

Dlatego czarna lista (`forbiddenTiles` / `forbiddenEntities`) **bezwzględnie blokuje**:
- **Create 6 i wszystkie addony** (`create:*`, `railways:*`, `hypertubes:*`, `createaddition:*`, `create_enchantment_industry:*`, `trading_floor:*`, `create_mechanical_extruder:*`, `create_central_kitchen:*`, `sliceanddice:*`, `create_connected:*`, `copycats:*`, `createappliedkinetics:*`) — chroni kotły parowe, zbiorniki płynów, Item Vaulty, Packagery, Frogporty, pociągi i kontrapcje.
- **Mekanism & Generators** (`mekanism:*`, `mekanismgenerators:*`) — chroni reaktory, turbiny, rury i QIO przed uszkodzeniem sieci i wyciekiem promieniowania.
- **Applied Energistics 2** (`ae2:*`) — chroni ME Controllery, dyski ME Drive (ryzyko ogromnych pakietów NBT!) i kable.
- **Ekonomia i NPC** (`lightmanscurrency:*`, `shoppers:*`) — **nigdy** nie pozwala podnosić bankomatów ATM, Trading Terminali, stoisk sklepowych ani klientów NPC `Shoppers` na Wyspie-Rynku!
- **Infrastruktura świata** (`waystones:*`, kontrolery `sophisticatedstorage:controller` / `storage_link`, `ftbquests:*`, spawnery Vanilla).

---

## 4. Jade & Sophisticated Storage — czytelny HUD i zdrowe pakiety NBT

- [`config/jade/jade-common.json`](../config/jade/jade-common.json) — kompaktowy HUD pokazujący zawartość maszyn (płyny, energia, postęp przetwarzania, nazwa moda, podgląd do 27/54 slotów magazynu), ukrywający się automatycznie przy ekranie debugowania `F3` i liście graczy `Tab`.
- [`config/sophisticatedstorage-common.toml`](../config/sophisticatedstorage-common.toml) — ograniczony zasięg skanowania `controllerSearchRange = 15` i `storageLinkMaxRange = 15` oraz promień magnesu `magnetUpgradeRadius = 5`, aby kontrolery magazynów nie obciążały ticków serwera Exaroton.

---

## 5. Checklista weryfikacji przy pierwszym starcie (`[VERIFY ON 1.21.1 BOOT]`)

Podczas pierwszego rozruchu serwera NeoForge `1.21.1` (po złożeniu `packwiz` w Issue #6) sprawdzić:
1. **Ścieżki `serverconfig` / `defaultconfigs` dla FTB:** w NeoForge `1.21.1` mody *FTB Chunks* i *FTB Essentials* mogą generować własne konfiguracje świata w `world/serverconfig/` (dziedzicząc wzorce z `defaultconfigs/`). Po pierwszym starcie upewnić się, że wartości `max_force_loaded_chunks = 20`, `fake_players = "allow"` oraz wyłączone komendy cheatujące są aktywne w grze (`/ftbchunks admin ...`, `/home`).
2. **Składnia wildcardów `Carry On`:** przetestować na żywo, że `Shift + PPM` pustą ręką **działa** na zwykłą skrzynię / krowę, a jest **zablokowane** na `create:fluid_tank`, `lightmanscurrency:terminal`, `waystones:waystone` oraz NPC `shoppers`.
3. **Klucze `Sophisticated Storage`:** zweryfikować, czy w wybranej wersji 1.21.1 klucze zasięgu kontrolera leżą w `sophisticatedstorage-common.toml` czy `sophisticatedstorage-server.toml`.
4. **Brak podwójnej minimapy na Mac M2:** sprawdzić, że na ekranie widoczna jest wyłącznie minimapa *Xaero's Minimap*, a okno claimowania *FTB Chunks* otwiera się poprawnie.
