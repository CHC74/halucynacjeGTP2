# PROGRESSION_AND_ECONOMY.md — Progresja, Ekonomia i Pure-Create Skyblock

Ten dokument opisuje model progresji **6 etapów (Stage 0–5)**, filozofię wyceny towarów chroniącą ekonomię przed exploitami z Netheru/Endu oraz pełną mapę pozyskiwania surowców bez *Ex Deorum* / *Ex Nihilo*.

---

## 1. Tabela progresji (Stage 0 — Stage 5)

Progresja działa na zasadzie **soft gatingu**: gracz kupuje odpowiedni **Żeton Etapu (`kubejs:stage_1_token`..`stage_5_token`)** w sklepie progresji, aktywuje go prawym przyciskiem myszy (PPM) i odblokowuje kolejny poziom dla siebie / drużyny.

| Etap | Żeton (ID KubeJS) | Koszt | Odblokowania w sklepie i świecie | Cel technologiczny i logistyczny |
| :--- | :--- | ---: | :--- | :--- |
| **Stage 0: Start** | *(brak — startowy)* | 0 monet | Podstawowe sadzonki, nasiona *Farmer's Delight*, woda/lawa awaryjna, pierwsze części Create, podstawowe stoisko *Lightman's Currency* | Generator bruku (*Mechanical Extruder*), koła wodne, pierwsze płukanie żwiru i piekarnia / prosta kuchnia na Wyspie Startowej. |
| **Stage 1: Rzemiosło i Handel** | `kubejs:stage_1_token` | **10 000 monet** | Kategoria sklepu: **Gastronomia & Rolnictwo** (egzotyczne sadzonki, kakaowiec, kelp, glina, startowe Blaze Burnery), dostęp do wyższych skrzyń *Sophisticated*, startowe materiały kolejowe | Pierwsze zautomatyzowane linie dań *Farmer's Delight* (`Slice & Dice`, `Central Kitchen`), pierwsze **Packagery + Chain Conveyors / Frogports** wysyłające paczki w stronę Wyspy-Rynku. |
| **Stage 2: Ekspansja i Nether** | `kubejs:stage_2_token` | **50 000 monet** | **Odblokowanie normalnego Netheru**, kategoria sklepu: **Przemysł & Kolej** (*Steam 'n' Rails*, *Hypertubes*, *Create: Confectionery*, *Enchantment Industry*, silniki elektryczne) | Budowa mostu kolejowego na Wyspę-Rynek (~150 bloków), pociągi-cysterny z lawą przez portal Netheru, produkcja słodyczy i mosiądzu (Brass Age). |
| **Stage 3: Przemysł Ciężki** | `kubejs:stage_3_token` | **100 000 monet** | Kategoria sklepu: **Zaawansowana Inżynieria** (rzadkie minerały bazowe pod AE2: Certus Quartz seed / Sky Stone, elementy startowe *Mekanism*, *Create: Trading Floor*, *Building Gadgets 2* wyższe tiery) | Masowa produkcja Precision Mechanisms, torów, biopaliw i wyrobów luksusowych; rozbudowane sklepy NPC *Shoppers* + sprzedaż hurtowa. |
| **Stage 4: High-Tech i End** | `kubejs:stage_4_token` | **250 000 monet** | **Odblokowanie normalnego Endu** + zakup komponentów portalu (`12× end_portal_frame` i `12× ender_eye`), pełny dostęp do **Applied Energistics 2** + **Create: Applied Kinetics** oraz **Mekanism + Mekanism Generators** | Budowa własnego Portalu Endu na Skyblocku i pokonanie Smoka, cyfrowa integracja magazynów AE2 z fabrykami Create, przetwórstwo 3x–5x w Mekanism, reaktory zasilające gigantyczne linie eksportowe. |
| **Stage 5: Imperium Tycoona** | `kubejs:stage_5_token` | **1 000 000 monet** | **Certyfikat Imperium Tycoona** — tytuł **`[Tycoon]`**, maksymalne perki (`+14` FTB Chunks, `+10%` premii skupu, `8` Doków Eksportowych) oraz survivalowy **Wielki Finał Tycoona** (`/kontrakt final` -> **`kubejs:tycoon_empire_trophy`** + `500 000` monet) | Pełna automatyzacja całej sieci 3 wysp, zjednoczenie wszystkich 5 filarów paczki i czysto survivalowe zwycięstwo bez przedmiotów kreatywnych. |

---

## 2. Filozofia cenowa i tabela cen (Buy / Sell)

### Zasady nadrzędne wyceny (zatwierdzone w RFC #5)
1. **Jedna spójna waluta (`Lightman's Currency`):** cała ekonomia działa na jednej walucie i wspólnych **Team Bank Accounts**:
   - **Fizyczne sklepy graczy na Wyspie-Rynku** (`Lightman's Currency` + NPC `Shoppers`) oferują **+20% premii** względem skupu hurtowego.
   - **Hurtowy Terminal Skupu & Katalog Progresji** (`Creative Network Traders` dostępne w `Trading Terminal`) obsługuje masowy eksport w late-game oraz zakup Żetonów Etapów i startowych sadzonek.
2. **Płacimy za inżynierię, nie za kilof:** wartość przedmiotu w skupie rośnie wykładniczo wraz z liczbą etapów przetwarzania w maszynach Create / FD / Mekanism.
3. **Blokada surowców kopalnianych (Nether/End) i twarde anty-exploity:**
   - **Wyłączony `Coin Mint`** (`canMint = false` w configu *Lightman's Currency* + usunięte receptury w [economy_anti_exploit.js](../kubejs/server_scripts/economy_anti_exploit.js)) — farmy żelaza/złota/miedzi Create nie mogą wybijać monet.
   - **Wyzerowana wartość surowców Tier 0 w `Shoppers`** (`/shoppers value set <item> 0`) — wyłącza domyślny *Dynamic Worth Calculator* i skup surowizny przez NPC.
   - **Zablokowane `Slot Machines`** (kasyno *Lightman's Currency*) — brak generowania pieniędzy poza fabrykami.
   - **Jedno źródło prawdy i walidacja anty-arbitrażowa:** docelowy cennik trzymamy w `config/halucynacje_economy/prices.json` i weryfikujemy w CI, że żadna kombinacja kupna składników i sprzedaży produktu nie tworzy pętli arbitrażowej.

### Cennik referencyjny (Tier 0–5 — spójny z `config/halucynacje_economy/prices.json` v3)

| Tier | Kategoria towaru (`[SKUP]`) | Flagowe przedmioty eksportowe | Skup hurtowy (Terminal) | Sklep NPC (Rynek, ~+20%) | Rola w balansie |
| :--- | :--- | :--- | ---: | ---: | :--- |
| **Tier 0 (Blokada)** | Surowe bloki kopalniane, rudy i elementy portalu (Overworld / Nether / End / Mekanism / AE2) | `minecraft:netherrack`, `minecraft:quartz`, `minecraft:gold_ingot`, `minecraft:iron_ingot`, `minecraft:end_stone`, `minecraft:chorus_fruit`, `minecraft:shulker_shell`, `minecraft:end_portal_frame`, `minecraft:ender_eye`, `minecraft:ancient_debris`, `mekanism:ingot_osmium`, `ae2:certus_quartz_crystal` (61 pozycji) | **0 monet** *(zablokowane)* | **0 monet** | Chroni ekonomię przed *FTB Ultimine* + Fortune III oraz sprzedażą surowizny i elementów portalu |
| **Tier 1 (Start)** | `[SKUP] 1. Wypieki i Start` (15 poz., Stage 0–1) | `minecraft:bread`, `farmersdelight:cooked_bacon`, `farmersdelight:apple_pie_slice`, `farmersdelight:apple_cider`, `farmersdelight:fried_rice`, podstawowe wypieki `createfood:*` | 4 – 22 monet | 5 – 26 monet | Pierwsze dochody na rozkręcenie wyspy i zakup Stage 1 (10k) |
| **Tier 2 (Kuchnia)** | `[SKUP] 2. Kuchnia i Obiady` (21 poz., Stage 1–2) | `farmersdelight:hamburger`, `farmersdelight:pasta_with_meatballs`, całe ciasta FD (`apple_pie`, `sweet_berry_cheesecake`, `chocolate_pie`), `farmersdelight:honey_glazed_ham`, pizze i burgery `createfood:*` | 36 – 100 monet | 43 – 120 monet | Główny silnik finansowy na Stage 2 (50k); spójna wycena całych ciast (+25% względem 4 kawałków) |
| **Tier 3 (Cukiernia)** | `[SKUP] 3. Cukiernia i Słodycze` (18 poz., Stage 2–3) | `create:sweet_roll`, `create:chocolate_glazed_berries`, `createaddition:chocolate_cake`, `createaddition:honey_cake`, `create_confectionery:bar_of_*`, `createfood:berry_milkshake_bottle`, `createfood:apple_ice_cream_cone`, `createfood:apple_cream_chocolate_donut`, `create:blaze_cake` | 125 – 285 monet | 150 – 342 monet | Wysoka marża za przetwórstwo płynnej czekolady, miodu, karmelu i kremów |
| **Tier 4 (Przemysł Create)** | `[SKUP] 4. Przemysł Create 6` (18 poz., Stage 2–4) | `create:brass_casing`, `create:railway_casing`, `create:sturdy_sheet`, `create:track` (x16), `create:precision_mechanism`, `create_hypertube:hypertube` (x16), `create:packager`, `create:package_frogport`, `create:stock_link`, `create:steam_engine`, `createaddition:bioethanol_bucket`, `createaddition:alternator`, `createaddition:electric_motor`, `createaddition:servo_motor`, `create:mechanical_arm` | 340 – 1 050 monet | 408 – 1 260 monet | Droga do Stage 3 (100k) i Stage 4 (250k); nagradza pełne linie mechaniczne, logistyczne i elektryczne |
| **Tier 5 (High-Tech)** | `[SKUP] 5. Eksport High-Tech` (15 poz., Stage 4–5) | `ae2:logic/calculation/engineering_processor`, `ae2:cell_component_16k/64k/256k`, `mekanism:advanced/elite/ultimate_control_circuit`, `mekanism:hdpe_sheet`, `mekanism:alloy_atomic`, `mekanism:teleportation_core`, `mekanism:pellet_plutonium`, `mekanism:pellet_polonium` | 2 400 – 12 000 monet | 2 880 – 14 400 monet | Skalowanie pod Stage 5 (1 000 000 monet) oraz Wielki Finał Tycoona (`/kontrakt final`) z twardą ochroną anty-arbitrażową nawet przy maks. premii `×1,45` |

### Struktura 10 sklepów w Trading Terminalu (`/sklep`, RFC #46)
Sklep sieciowy (`config/lightmanscurrency/PersistentTraders.json`) jest podzielony na **5 tematycznych sklepów zakupowych `[KUP]`** oraz **5 sklepów skupu hurtowego `[SKUP]`** (każdy z czytelnym podtytułem i identycznym sortowaniem wg nazwy i ID):
1. **`[KUP] 1. Żetony Etapów`** — Żetony Stage 1–5 (`10k / 50k / 100k / 250k / 1M`; brak przedmiotów kreatywnych — czysto survivalowy cel końcowy pod `/kontrakt final`).
2. **`[KUP] 2. Rośliny i Sadzonki`** (30 pozycji, 100–400 monet) — wszystkie 8 gatunków drzew Vanilla, nasiona i uprawy *Farmer's Delight*, grzyby, kakao, jagody, kelp, bambus, pnącza.
3. **`[KUP] 3. Zwierzęta i Hodowla`** (14 pozycji, 600–8 000 monet) — zwierzęta farmowe, pszczoły i ul, ryby w wiadrach, kałamarnice (`Squid` i `Glow Squid`), towarzysze oraz startowy Osadnik (Stage 2, pod *Create: Trading Floor*).
4. **`[KUP] 4. Skyblock i Bloki`** (16 pozycji, 200–4 000 monet) — awaryjne i niedostępne na Skyblocku bloki (`grass_block`, `ice`, `blue_ice`, `podzol`, `mycelium`, `moss_block`, `pointed_dripstone`, `lava_bucket`, **`soul_sand` S1** odblokowujący *Bulk Haunting* przed Netherem, `slime_ball`, `ink_sac`, `sponge`, `calcite`, `prismarine_shard`, `budding_amethyst`, `heart_of_the_sea`).
5. **`[KUP] 5. Maszyny i High-Tech`** (19 pozycji, 2 000–15 000 monet) — startowy `create:blaze_burner`, `waystones:warp_stone`, `waystones:waystone`, `lightmanscurrency:terminal`, `portable_terminal`, `atm`, komplet startowy **AE2** (`sky_stone_block`, `flawless_budding_quartz` oraz **wszystkie 4 matryce Inscriber Press** bez potrzeby meteorytów), komplet 5 minerałów **Mekanism** (`osmium`, `tin`, `lead`, `fluorite`, `uranium`) oraz **komponenty Portalu Endu (Stage 4)** — `minecraft:end_portal_frame` (`6 000` monet, limit 12/drużynę) i `minecraft:ender_eye` (`2 000` monet, limit 12/drużynę).
6–10. **`[SKUP] 1..5`** — 5 osobnych okienek skupu hurtowego (87 towarów fabrycznych Tier 1–5).

### Ścieżka do Endu na Skyblocku (Stage 4 — brak twierdz)
Ponieważ Overworld jest pustką (*Skyblock Builder*: `Overworld.isCustom: true`), naturalne twierdze (*Strongholds*) nie generują się. Po aktywacji **`kubejs:stage_4_token`** (250 000 monet) drużyna buduje własny Portal Endu:
- **12× `minecraft:end_portal_frame`:** zakup przez `/kup end_portal_frame 12` lub w GUI `/sklep` -> **`[KUP] 5. Maszyny i High-Tech`** (`6 000` monet/szt., łącznie `72 000` monet; twardy limit **`team_limit: 12`** na drużynę, brak możliwości zakupu przed Etapem 4).
- **12× `minecraft:ender_eye`:** dwie równoważne ścieżki:
  1. **Zakup w sklepie (Stage 4):** `/kup ender_eye 12` lub `/sklep` (`2 000` monet/szt., łącznie `24 000` monet; **`team_limit: 12`** na drużynę), **albo**
  2. **Crafting własny (0 monet):** `minecraft:ender_pearl` (handel z klerykiem-wieśniakiem z Etapu 2 / *Create: Trading Floor*) + `minecraft:blaze_powder` (z Netheru odblokowanego w Etapie 2).
- **Zasada bezpiecznej budowy portalu:** ram portalu nie da się wykopać w trybie Survival ani przenieść modem *Carry On*. Portal najlepiej wznieść na dedykowanej platformie przy **Wyspie-Rynku `(152, 64, 0)`** lub na **Hucie Południowej `(0, 64, 152)`**, **stojąc w środku pierścienia 3×3** i kładąc wszystkie 12 ram wokół siebie tak, aby ich fronty były skierowane do wnętrza portalu.
- **Gwarancja ochrony ekonomii:** zarówno `minecraft:end_portal_frame`, jak i `minecraft:ender_eye` znajdują się w `tier_0_blocked` (`0` monet w `/sprzedaj`, skupie `[SKUP]` GUI, Automatycznych Dokach Eksportowych i u NPC *Shoppers*), a brak ich w `sell_tiers` jest twardo egzekwowany w CI przez `scripts/validate_economy.mjs`.

---

## 3. Mapa surowcowa Pure-Create Skyblock (bez *Ex Deorum*)

Wszystkie kluczowe surowce potrzebne od Stage 0 do Stage 3 można zautomatyzować czystym **Create 6** wspieranym przez **Create: Mechanical Extruder** oraz lekkie receptury uzupełniające w [kubejs/server_scripts/skyblock_create_recipes.js](../kubejs/server_scripts/skyblock_create_recipes.js):

| Surowiec | Metoda w Pure-Create Skyblock | Etap | Uwagi / KubeJS |
| :--- | :--- | :--- | :--- |
| **Cobblestone / Stone / Basalt / Andesite / Tuff** | **Create: Mechanical Extruder** (woda + lawa + blok katalizatora pod spodem) oraz zapasowe receptury KubeJS (`Mixing` dla Andesite, `Compacting` dla Tuff) | Stage 0 | Zastępuje lagujące generatory tłokowe; `Tuff` domknięty z review Issue #4 |
| **Gravel & Flint** | Mielenie Cobblestone w **Millstone** lub **Crushing Wheels** | Stage 0 | Bazowy cykl Create |
| **Sand, Red Sand & Clay** | Mielenie Gravel -> Sand -> płukanie (**Bulk Washing**) -> **Clay Ball**; wczesny **Red Sand** w **Millstone** z terakoty lub `Mixing` (`sand + red_dye`) | Stage 0 | Wczesny `red_sand` (z review Issue #4) usuwa wąskie gardło przed Crushing Wheels |
| **Iron Nuggets (Żelazo)** | Płukanie Gravel (**Bulk Washing**) -> Iron Nuggets + Flint; mid-game: `Crimsite` | Stage 0 | Standard Create 6 — skaluje się łatwo z Ekstruderem |
| **Gold Nuggets (Złoto)** | Płukanie Red Sand -> Gold Nuggets; mid-game: `Ochrum` | Stage 0–1 | Płynna ścieżka z `Millstone -> Red Sand -> Washing` |
| **Quartz (przed Netherem)** | Płukanie **Soul Sand** (Bulk Haunting na Sand -> Soul Sand -> Bulk Washing -> Quartz + Gold Nuggets) | Stage 1 | Pozwala uzyskać Electron Tubes i Brass jeszcze przed Stage 2, a Nether potem drastycznie przyspiesza skalę |
| **Zinc (Cynk)** | 1) Płukanie **Tuff** (wczesny Stage 0–1) <br> 2) Mielenie **Asurine** (`Millstone` lub `Crushing Wheels`) z receptury KubeJS `Compacting` | Stage 0–1 | Zdefiniowane w `skyblock_create_recipes.js` (wypełnia lukę Skyblocka!) |
| **Copper (Miedź)** | 1) Płukanie **Tuff** (wczesny Stage 0–1) <br> 2) Mielenie **Veridium** (`Millstone` lub `Crushing Wheels`) z receptury KubeJS `Compacting` | Stage 0–1 | Zdefiniowane w `skyblock_create_recipes.js` — niezbędne do rur i kotłów |
| **Andesite & Andesite Alloy** | Mixing: Gravel + Flint + Water / lub Mechanical Extruder -> Andesite + Iron/Zinc Nuggets -> Andesite Alloy | Stage 0 | Szybkie wejście w pierwsze koła wodne i prasy |
| **Kamienie rudonośne Create (`Asurine`, `Crimsite`, `Ochrum`, `Veridium`)** | Dedykowane receptury **Create Mixing / Compacting** w KubeJS (z lokalnych półproduktów Skyblocka) -> potem **Crushing Wheels** dla wysokich uzysków rud | Stage 1–2 | Daje satysfakcjonującą, typowo „Create'ową” linię rud bez żadnych sit |
| **Limestone & Scoria** | Mixing/Extruder: **Limestone** (Honey + Lava / KubeJS Compacting), **Scoria** (Chocolate + Lava lub Netherrack + Lava w Stage 2) | Stage 1–2 | Standardowe interakcje płynów Create + opcjonalny fallback w KubeJS |
| **Kelp (Wodorosty)** | 1) Zakup pierwszej sztuki w sklepie (Stage 0/1) <br> 2) Automatyczna farma wodna Create Mechanical Harvester | Stage 0–1 | Kluczowy do pasów transmisyjnych (*Mechanical Belt*) i suszenia na paliwo |
| **Blaze Burner** | 1) Pusty Blaze Burner (Iron Sheets + wczesny Netherrack z KubeJS Mixing) + napełnienie w sklepie Stage 1 (ograniczona liczba startowa) <br> 2) Po odblokowaniu Netheru (Stage 2) — klasyczne łapanie Blaze'ów ze spawnera | Stage 1–2 | Zapewnia miękkie wejście w Brass Age na Stage 1 i wielką nagrodę przy odblokowaniu Netheru |
| **Lawa (Paliwo)** | 1) Stage 0–1: Dripstone + Cauldron (zakup Pointed Dripstone w sklepie) lub podgrzewany Mixing Cobblestone -> Lava <br> 2) Stage 2+: **Pociągi-cysterny z Netheru** (nieskończone źródło lawy) | Stage 0–2 | Pociąg z lawą z Netheru to jedna z najfajniejszych pętli w Create |
| **Mekanism: Raw Tin / Raw Lead / Raw Osmium** | **Heated Mixing** w Create (`Veridium + Clay + Zinc + Lava` -> `raw_tin`; `Basalt + Crimsite + Flint + Lava` -> `raw_lead`; `Asurine + Crimsite + Quartz + Lava` -> `raw_osmium`) -> **3x–5x mnożniki rud Mekanism** | Stage 3 | Odnawialne surowce z `skyblock_create_recipes.js` (Issue #49); wszystkie `raw_*` zablokowane w Tier 0 (`0` monet) |
| **Mekanism: Fluorite & Raw Uranium** | **Superheated Mixing** (Blaze Cake!): `Quartz + Glowstone + Clay + Lava` -> `fluorite_gem`; `End Stone + Raw Osmium + Fluorite + Lava` -> `raw_uranium` | Stage 4 | Łączy End, Create Superheated i reaktory/antymaterię Mekanism w jedną odnawialną fabrykę |

---

## 4. Zatwierdzone decyzje ekonomiczne (RFC #5 + #51 — zamknięte)

Wszystkie otwarte pytania z RFC #5 oraz aktualizacja celu końcowego z RFC #51 zostały wdrożone:

1. **Jedna spójna waluta:** wyłącznie **`Lightman's Currency`** (bez *SDM Shop (Legacy)* i bez *Create: Numismatics*) — wspólne **Team Bank Accounts**, fizyczne stoiska NPC (`Shoppers`, premia +20%) oraz hurt/katalog progresji przez natywne `Creative Network Traders` (`Trading Terminal`).
2. **Strojenie Wyspy-Rynku i `Shoppers` pod Exaroton:** limit **8–12 aktywnych NPC**, **3 bankomaty ATM** w odstępach >6 bloków i w 100% płaski plac `Y=64` (wdrożone w [ISLAND_DESIGN.md](ISLAND_DESIGN.md)).
3. **Ochrona anty-exploitowa:** wyłączony `Coin Mint`, zablokowane `Slot Machines`, wyzerowana wartość surowców Tier 0 w `Shoppers` oraz zautomatyzowany walidator braku pętli arbitrażowych nad `config/halucynacje_economy/prices.json`.
4. **Współdzielenie Żetonów Etapów:** współdzielenie drużynowe (`FTB Teams`) / globalne co-op (`halucynacje_global_stages` w `dimension_gating.js`).
5. **Survivalowy cel końcowy po Stage 5 (1 000 000 monet, #51):** zamiast kreatywnego silnika, drużyna odblokowuje **Wielki Finał Tycoona (`/kontrakt final`)** — wielomodowy Mega-Kontrakt łączący wszystkie 5 filarów paczki (*Farmer's Delight*, *Confectionery*, *Create 6*, *AE2 256k*, *Mekanism Polonium*), nagradzany unikalnym **`kubejs:tycoon_empire_trophy`** + `500 000` monet i zamykający księgę *FTB Quests*.
