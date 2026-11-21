# ISLAND_DESIGN.md — Projekt układu wysp (*Skyblock Builder*)

Dokumentacja architektoniczna wielo-wyspowego Overworlda w modpacku **HalucynacjeGTP2** (*Create Skyblock Tycoon*, Minecraft `1.21.1`, NeoForge, Create `6.x`).

> 🖼️ **Podgląd 3D bez uruchamiania serwera:** zobacz gotowe rendery 3D wszystkich 3 wysp w **[docs/ISLAND_PREVIEWS.md](ISLAND_PREVIEWS.md)** oraz interaktywny plik **[docs/renders/island_viewer_3d.html](renders/island_viewer_3d.html)**!

Układ wysp realizuje dwa kluczowe cele projektowe z [VISION.md](VISION.md):
1. **Naturalna motywacja do logistyki Create 6** — dystans **~150 bloków** przez pustkę sprawia, że budowa **Chain Conveyors + Frogports**, **wiaduktów kolejowych (`Create` / `Steam 'n' Rails`)** oraz **rur `Create: Hypertubes`** jest zarówno praktyczna, jak i widowiskowa.
2. **Bezpieczne i wydajne środowisko pod ekonomię (`Lightman's Currency` + `Shoppers`)** — Wyspa-Rynek jest w 100% płaska, ma rozproszone bankomaty (ATM) i zaplecze serwisowe pod taśmociągi, zgodnie z ustaleniami z [PROGRESSION_AND_ECONOMY.md](PROGRESSION_AND_ECONOMY.md) oraz RFC #5.

---

## 1. Mapa logistyczna — trójkąt 3 wysp Overworlda

Wszystkie 3 wyspy generują się na wspólnym poziomie bazowym **`y = 64`** (z jednolitym poziomem torowiska **`y = 65`**), dzięki czemu gracze mogą prowadzić proste, idealnie wypoziomowane wiadukty kolejowe oraz linie napowietrzne bez uciążliwego korygowania osi.

```mermaid
flowchart LR
    S["Wyspa Startowa (0, 64, 0)<br/>15x13x15 | Baza, Farma, Fabryka<br/>Pirs Wschodni: (+7, 65, 0)"]
    M["Wielka Wyspa-Rynek (152, 64, 0)<br/>45x25x35 | Dworzec, Rotunda z Terminalem, 8 Butikow, 3 ATM<br/>Stacja Zachodnia: (130, 65, 0)"]
    I["Huta Poludniowa (0, 64, 152)<br/>33x21x33 | 4 Hale 11x11, Suwnica, Komin, Dyspozytornia<br/>Dok Polnocny: (0, 65, 136)"]

    S -->|"~122 bloki (Wschod, Z=0, Y=65)<br/>Pociagi Create / Chain Conveyors / Hypertube"| M
    S -->|"~128 blokow (Poludnie, X=0, Y=65)<br/>Linia przemyslowa (surowce & polprodukty)"| I
    I -.->|"~215 blokow (Luk poludniowo-wschodni, Y=65)<br/>Opcjonalna petla 3-stacyjna (eksport Tier 3-5)"| M
```

> **Ważna zasada wymiarów (Guardrail):** Pustką (*Void*) objęty jest **wyłącznie Overworld (`minecraft:overworld`)**. **Nether (`minecraft:the_nether`, odblokowywany w Stage 2)** oraz **End (`minecraft:the_end`, odblokowywany w Stage 4)** zachowują w pełni **normalną generację waniliową** (szczegóły w [world.json5](../config/skyblockbuilder/world.json5)).

---

## 2. Tabela koordynatów bazowych i punktów orientacyjnych

Koordynaty podane są względem punktu początkowego wyspy drużyny (`origin = (0, 64, 0)`). W `Skyblock Builder` wyspy satelickie definiowane są jako `spreads` z relatywnym przesunięciem (`offset`) i wyrównaniem `origin: "center"` (`originOffset = size // 2`), więc przy wielu drużynach zachowują identyczny układ względny oraz wspólny poziom nawierzchni **`Y = 64`**.

| Lokacja / Element | Koordynaty `(X, Y, Z)` | Wymiary / Przesunięcie | Przeznaczenie |
| :--- | :--- | :--- | :--- |
| **Wyspa Startowa — środek / spawn** | `(0, 64, 0)` | `15 × 13 × 15` (`offset [-7, -6, -7]`) | Punkt odrodzenia drużyny i startowa platforma Stage 0 |
| Drzewo startowe (Dąb) | `(-4, 65, -4)` | 1 drzewo na bloku ziemi | Pierwsze drewno, sadzonki, jabłka |
| Wnęka Cobble-Gen (Lód/Woda + Lawa) | `(-4, 64, +3)` | Niecka z `stone_bricks` + blok lodu | Bezpieczny generator bruku |
| Skrzynia Startowa (anty-softlock) | `(-1, 65, -2)` | 11 pozycji startowych + stół rzemieślniczy | Lawa, 2× lód, sadzonki, trzcina, kaktus, wodorosty, nasiona |
| **Pirs Logistyczny Wschodni (Startowa)** | `(+4..+7, 64, 0)` | Tor `Y=65`, latarnie kierunkowe | Wyrównany wylot na wschód ku Stacji Rynku |
| **Wielka Wyspa-Rynek — centrum Rotundy** | `(152, 64, 0)` | `45 × 25 × 35` (`X: 130..174`, `Z: -17..+17`), `offset [152, 4, 0]` | Wiktoriańsko-steampunkowy hub handlowy: `Shoppers` NPC + `Lightman's Currency` |
| **Wielka Hala Dworca Zachodniego (Rynek)** | `(130..138, 65, 0)` | Prześwit wjazdu `9 × 6` ze szklanym sklepieniem | Przyjazd pociągów ze Startowej (prosta oś `Z=0`, `Y=65`) |
| Stacja Hypertubes (Rynek, Północ) | `(136, 65, -9)` | Pad z `create:copper_casing` + szyld | Szybki transport graczy na/z Wyspy Startowej |
| Sanktuarium Waystone (Rynek, Południe) | `(136, 65, +9)` | Pad z wapienia i tufu + szyld | Odkrywany punkt teleportacji `Waystones` |
| **Centralna Rotunda z Kopułą (`lightmanscurrency:terminal`)** | `(152, 65, 0)` | `7 × 7` (wys. do `Y=80` z iglicą!) | Gotowy, wbudowany **`lightmanscurrency:terminal`** (Giełda Centralna) |
| **Bankomat ATM #1 (NW Bulwar)** | `(141, 65, -6)` | Prawdziwy działający `lightmanscurrency:atm` w kiosku | Obsługa wypłat NPC `Shoppers` (odstęp `23` bloki od ATM #2) |
| **Bankomat ATM #2 (NE Bulwar)** | `(164, 65, -6)` | Prawdziwy działający `lightmanscurrency:atm` w kiosku | Obsługa wypłat NPC `Shoppers` (odstęp `12` bloków od ATM #3) |
| **Bankomat ATM #3 (SE Bulwar)** | `(164, 65, +6)` | Prawdziwy działający `lightmanscurrency:atm` w kiosku | Trzeci działający punkt ATM (odstęp `25.9` bloków od ATM #1) |
| 8 Dwupiętrowych Butików Handlowych (`S1–S8`) | `X: 140..166`, `Z: -9` i `+9` | 8 modułów `6 × 4 × 9` z markizami, szyldami i estakadą `brass_catwalk` w tylnej alei `3` bloki | Fizyczne sklepy `Lightman's Currency` (Piekarnia, Bistro, Cukiernia, Mechanika, Kolej, AE2, Mekanism, Bazar VIP) |
| Wschodni Taras Ogrodowy i Fontanna | `(168..174, 64, 0)` | Fontanna, 2 klomby azalii, balkon widokowy | Estetyczna strefa rekreacyjna bez przeszkód w pathfindingu |
| **Huta Południowa / Terminal Towarowy** | `(0, 64, 152)` | `33 × 21 × 33` (`X: -16..+16`, `Z: 136..168`), `offset [0, 4, 152]` | 4 otwarte hale `11 × 11` pod ciężki przemysł Create, AE2 i Mekanism |
| **Dok Kolejowy Północny & Suwnica Bramowa** | `(0, 65, 136)` | Podkłady `X=0, Y=64`, suwnica z `metal_girder` + `industrial_iron_catwalk` | Wyrównany w osi `X=0, Y=65` z Wyspą Startową |
| Komin Przemysłowy i Dyspozytornia | `(+8..+14, 65, 139..145)` | Komin z dymem (`campfire`) + przeszklona kabina z `lightmanscurrency:terminal` | Klimatyczny punkt orientacyjny i lokalny terminal handlowy |

---

## 3. Szczegółowy blueprint: Wyspa Startowa `(0, 64, 0)`

Wyspa Startowa ma dawać przyjemny, czysty start w klimacie **pure-Create Skyblock** (bez *Ex Deorum* / *Ex Nihilo*), a jednocześnie wizualnie podpowiadać kierunek ekspansji na wschód (ku widocznej na horyzoncie Wyspie-Rynkowi).

### Układ i budulec
- **Wymiary płyty:** ~`15 × 15` bloków (`X: -7..+7`, `Z: -7..+7`), górna warstwa trawy/ziemi na **`Y = 64`**, stożkowa podbudowa z kamienia, andezytu i deepslate'u schodząca do `Y = 58` (wygląd naturalnej latającej skały z industrialnym akcentem).
- **Strefa surowców początkowych (Stage 0):**
  - **Drzewo startowe** (`(-4, 65, -4)`): klasyczny dąb (*Oak Tree*) z kilkoma blokami trawy wokół pod wczesną trawę/nasiona.
  - **Wnęka Cobble-Gen** (`(-5, 64, +4)`): estetyczna kamienna niecka z **1 źródłem lawy** i **2 blokami lodu** (lub źródłem wody) gotowa do natychmiastowego uruchomienia bezpiecznego generatora bruku, a chwilę później — zamiany w `Create: Mechanical Extruder`.
  - **Skrzynia startowa** (`(-2, 65, +2)`): opcjonalne zapasowe zasoby wyspy (2× `minecraft:oak_sapling`, 4× `minecraft:bone_meal`, 1× `minecraft:bucket`, 8× `minecraft:torch`, 1× `minecraft:red_bed`). Ekwipunek osobisty gracza definiuje [inventory.json5](../config/skyblockbuilder/inventory.json5).
- **Pirs Logistyczny Wschodni `(+8, 64, 0)`:**
  - Krótki, 3-blokowy wypust (`X: +8..+10`, `Z: -2..+2`) z cegieł kamiennych i obramowania z andezytu (*Andesite Casing* / *Polished Andesite*).
  - **Poziom torowiska `Y = 65`:** ułożone 2 demonstracyjne odcinki `create:track` na `(+8, 65, 0)` i `(+9, 65, 0)` wskazujące dokładnie prosto na Stację Zachodnią Wyspy-Rynku `(136, 65, 0)`.
  - **Maszt Chain Conveyor `Y = 72`:** drewniano-andezytowy słup na `(+8, 64..72, -2)` z wyraźnym wspornikiem na wysokości `Y = 72`, gotowy do zawieszenia pierwszego `create:chain_conveyor` + `create:package_frogport` w Stage 1!
- **Bezpieczeństwo i oświetlenie:** 4 latarnie rozmieszczone w narożnikach wyspy (`(±6, 65, ±6)`), dzięki czemu w nocy na starcie nie pojawiają się potwory.

---

## 4. Szczegółowy blueprint: Wyspa-Rynek `(152, 64, 0)`

Wyspa-Rynek znajduje się **~150 bloków na wschód** (środek na `(152, 64, 0)`, zachodnia krawędź stacji na `X = 136`, czyli **128 bloków czystego przęsła** od Pirsu Wschodniego). Przy standardowym dystansie renderowania (10–12 chunków) wyspa jest **widoczna z Wyspy Startowej** — od pierwszej minuty stanowi jasny cel wizualny i inżynieryjny.

### Krytyczne zasady projektowe pod AI `Shoppers` i TPS Exaroton
Zgodnie z ustaleniami RFC #5 i [EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md):
1. **100% płaski plac handlowy (`Y = 64`):** cała strefa, po której poruszają się NPC `Shoppers` (`X: 141..167`, `Z: -12..+12`), jest **idealnie płaska** na poziomie `Y = 64`. **Zakaz schodów, półpłytek (slabs), płotków na środku alejek i uskoków o 1 blok** w strefie NPC — eliminuje to blokowanie się pathfindingu (AI) i obciążenie CPU serwera.
2. **Limit populacji NPC:** konfiguracja `Shoppers` ograniczona do **8–12 aktywnych klientów jednocześnie** (wysoki ruch wizualny przy minimalnym wpływie na TPS Exaroton).
3. **3 zatoki ATM rozstawione o >6 bloków:** NPC w `Shoppers` odwiedzają bankomat, gdy ich gotówka spadnie poniżej 500 miedzianych monet, i omijają zajęty blok w promieniu 1.5 kratki. Trzy bankomaty w punktach:
   - **ATM #1:** `(146, 64, -8)`
   - **ATM #2:** `(158, 64, -8)` *(12 bloków od ATM #1)*
   - **ATM #3:** `(152, 64, +10)` *(>18 bloków od ATM #1 i #2)*
   całkowicie eliminują korki i zatory pod bankomatami.
4. **Siatka oświetleniowa (Anti-Spawn Grid):** w nawierzchnię placu z `stone_bricks` i `polished_andesite` wbudowana jest regularna siatka ukrytych źródeł światła (*Sea Lantern* / *Glowstone* pod szarym dywanem lub *Create Brass Lantern* na kolumnach co 6 bloków), gwarantująca poziom światła **≥ 10 w każdym bloku** wyspy. Brak hostile mobów atakujących graczy lub zakłócających handel.

### Strefy funkcjonalne Wyspy-Rynku (schemat z góry)

```text
                       PÓŁNOC (Z = -13)
         +-------------------------------------------+
         |   [ Korytarz Serwisowy N: Z = -9..-10 ]   |  <- Taśmociągi / Packagery / Frogporty
         |    ATM#1 (146,-8)        ATM#2 (158,-8)   |  <- Zatoki ATM (płasko Y=64)
         |   [S1]     [S2]          [S3]     [S4]    |  <- 4 Stoiska Północne (Z = -5)
  ZACHÓD |                                           |  WSCHÓD
 [Peron] | [H]           +-----------+               | (X=168)
 (136,0) |=====  Aleja   | Trading   |   Plac        |  <- Oś główna Z=0 (szerokość 7 bloków)
 [Tor]   | [W]   Główna  | Terminal  |   Targowy     |     Pawilon (152, 64, 0)
         |               +-----------+               |
         |   [S5]     [S6]          [S7]     [S8]    |  <- 4 Stoiska Południowe (Z = +5)
         |                ATM#3 (152,+10)            |  <- Trzeci bankomat
         |   [ Korytarz Serwisowy S: Z = +9..+10 ]   |  <- Taśmociągi / Packagery / Frogporty
         +-------------------------------------------+
                      POŁUDNIE (Z = +13)

Legenda: [H] = Terminal Hypertube (139,65,-3) | [W] = Pad Waystone (139,65,+3) | [S1..S8] = Stoiska LC
```

### Detale techniczne stref Rynku
- **8 modularnych stoisk sklepowych (`S1`–`S8`):**
  - Każde stoisko ma front handlowy (`Lightman's Currency`: *Shelf*, *Display Case*, *Vending Machine* lub *Card Display*) skierowany ku głównej alei placu (`Z = -5` i `Z = +5`).
  - Bezpośrednio za ścianą tylną biegnie **zamknięty korytarz serwisowy dla graczy i maszyn** (`2` bloki szerokości na `Y = 64` + rampa napowietrzna na `Y = 68` dla `Chain Conveyors` / `Frogports` i `Chutes`). Dzięki temu gracze mogą podpiąć rozładunek pociągów (`Portable Storage Interface` -> `Packager` -> `Frogport` -> `Funnel` -> sklep LC) bez szpecenia alei i bez blokowania ścieżek NPC!
  - Sugerowany podział tematyczny 8 stoisk (elastyczny dla graczy):
    1. *Piekarnia & Śniadania* (Tier 1)
    2. *Bistro & Dania Obiadowe* (Tier 2 — *Farmer's Delight*)
    3. *Cukiernia & Czekolada* (Tier 3 — *Create: Confectionery* / *Create: Food*)
    4. *Sklep Mechaniczny* (Tier 4 — *Precision Mechanisms*, *Sturdy Sheets*)
    5. *Skład Kolejowy & Paliwa* (Tier 4 — *Tracks*, *Bioethanol*)
    6. *Elektronika AE2* (Tier 5 — *Processors*)
    7. *Przemysł Ciężki Mekanism* (Tier 5 — *Control Circuits*)
    8. *Stoisko Sezonowe / Nadwyżki* (dowolny asortyment drużyny)
- **Pawilon Centralny (`(152, 64, 0)`):**
  - Lekka, otwarta altana na 4 filarach (brak pełnych ścian blokujących widok i ruch NPC).
  - Zawiera **`Lightman's Currency` `Trading Terminal`** podłączony do globalnych **Creative Network Traders**:
    - skup hurtowy (stawki bazowe 100%, podczas gdy stoiska NPC `S1–S8` dają premię **+20%**),
    - katalog **Żetonów Etapów** (`10k / 50k / 100k / 250k / 1M` monet) oraz prestiżowego `create:creative_motor` po odblokowaniu Stage 5,
    - sklep rzadkich nasion, sadzonek i surowców bazowych (soft gating).
- **Stacja Kolejowa Zachodnia `(136, 65, 0)` + Hypertube + Waystone:**
  - Peron na `Y = 65` oddzielony niskim krawężnikiem/barierką od strefy NPC (`X = 140`), z otwartym przejściem dla graczy i miejscem na `Create Train Station`, `Portable Storage Interface` oraz buforowy `Item Vault`.
  - Obok peronu znajdują się wyznaczone stanowiska pod **Terminal `Create: Hypertubes`** (`(139, 65, -3)`) oraz **Waystone** (`(139, 65, +3)`), umożliwiające błyskawiczny powrót na Wyspę Startową.

---

## 5. Szczegółowy blueprint: Wyspa Przemysłowa / Huta Południowa `(0, 64, 152)`

Opcjonalna trzecia wyspa w układzie (`offset: [0, 0, 152]`, ~150 bloków na południe od Wyspy Startowej), pomyślana jako czysty fundament pod ciężką ekspansję w **Stage 2–5**:
- **Wymiary płyty:** idealnie płaska platforma **`21 × 21`** (`X: -10..+10`, `Z: 142..162`, nawierzchnia `Y = 64`) wykonana z `polished_deepslate`, `stone_bricks` i obramowania z `industrial_iron_block` / `andesite`.
- **Dok Kolejowy Północny `(0, 65, 141)`:**
  - Wyrównany w osi **`X = 0`, `Y = 65`** z południową krawędzią Wyspy Startowej (`(0, 65, +8)`).
  - Pozwala graczom wybudować **3-stacyjną pętlę kolejową** (Startowa -> Huta Południowa -> Rynek -> Startowa) i rozdzielić hałaśliwe linie ciężkie (Crushing Wheels, kotły parowe, reaktory Mekanism, farmy kryształów AE2) od estetycznej wyspy głównej — co dodatkowo **poprawia FPS na Apple Silicon Mac M2**, bo ciężkie animacje obracających się wałów znajdują się poza bezpośrednim centrum bazy!
- **Oświetlenie:** narożne i środkowe lampy przemysłowe zapewniające pełną ochronę przed spawnem potworów od momentu wygenerowania wyspy.

---

## 6. Powiązane pliki w repozytorium

- [schematics/README.md](../schematics/README.md) — instrukcja budowy i eksportu 3 szablonów `.nbt` w trybie Creative (Structure Block).
- [config/skyblockbuilder/world.json5](../config/skyblockbuilder/world.json5) — pusty Overworld + normalny Nether i End.
- [config/skyblockbuilder/templates.json5](../config/skyblockbuilder/templates.json5) — definicja `starter_island.nbt` oraz `spreads` dla Rynku i Huty Południowej.
- [config/skyblockbuilder/spawn.json5](../config/skyblockbuilder/spawn.json5) — parametry spawnu drużyny.
- [config/skyblockbuilder/inventory.json5](../config/skyblockbuilder/inventory.json5) — ekwipunek początkowy gracza.
