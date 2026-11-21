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
| **Stage 4: High-Tech i End** | `kubejs:stage_4_token` | **250 000 monet** | **Odblokowanie normalnego Endu**, pełny dostęp do **Applied Energistics 2** + **Create: Applied Kinetics** oraz **Mekanism + Mekanism Generators** | Cyfrowa integracja magazynów AE2 z fabrykami Create, przetwórstwo 3x–5x w Mekanism, farmy Endu, reaktory zasilające gigantyczne linie eksportowe. |
| **Stage 5: Imperium Tycoona** | `kubejs:stage_5_token` | **1 000 000 monet** | **Certyfikat Imperium Tycoona** — kategoria endgame: kontrakty korporacyjne, trofea, zamknięcie księgi *FTB Quests* oraz odblokowanie zakupu prestiżowego **`create:creative_motor`** za dodatkowe **2 000 000 monet** (twardy limit **1–2 sztuki na drużynę**) | Pełna automatyzacja całej sieci 3 wysp, maksymalna wydajność eksportu high-tech i zamknięcie progresji. |

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

### Cennik referencyjny (Tier 0–5 — spójny z `config/halucynacje_economy/prices.json`)

| Tier | Kategoria towaru | Flagowe przedmioty eksportowe | Skup hurtowy (Terminal) | Sklep NPC (Rynek, ~+20%) | Rola w balansie |
| :--- | :--- | :--- | ---: | ---: | :--- |
| **Tier 0 (Blokada)** | Surowe bloki kopalniane (Nether / End / Overworld) | `minecraft:netherrack`, `minecraft:quartz`, `minecraft:gold_ingot`, `minecraft:iron_ingot`, `minecraft:end_stone`, `minecraft:chorus_fruit`, `minecraft:shulker_shell`, `minecraft:ancient_debris`, `minecraft:cobblestone` | **0 monet** *(zablokowane)* | **0 monet** | Chroni ekonomię przed *FTB Ultimine* + Fortune III w Netherze i Endzie |
| **Tier 1 (Start)** | Podstawowe wypieki i przetwory (Stage 0–1) | `minecraft:bread`, `farmersdelight:cooked_bacon`, `farmersdelight:apple_pie_slice`, `farmersdelight:sweet_berry_cheesecake_slice`, podstawowe wypieki `createfood:*` | 4 – 12 monet | 5 – 15 monet | Pierwsze dochody na rozkręcenie wyspy i zakup Stage 1 (10k) |
| **Tier 2 (Kuchnia)** | Złożone posiłki *Farmer's Delight* & *Create: Food* (Stage 1–2) | `farmersdelight:hamburger`, `farmersdelight:pasta_with_meatballs`, `farmersdelight:steak_and_potatoes`, `farmersdelight:honey_glazed_ham`, burgery/kanapki `createfood:*` | 35 – 90 monet | 42 – 110 monet | Główny silnik finansowy na Stage 2 (50k); motywuje do *Slice & Dice* i *Central Kitchen* |
| **Tier 3 (Luksus / Cukiernia)** | Słodycze i wypieki premium *Create* & *Confectionery* (Stage 2–3) | `create:sweet_roll`, `create:chocolate_glazed_berries`, `create:honeyed_apple`, `create_confectionery:bar_of_black_chocolate`, `create_confectionery:bar_of_caramel`, torty `createfood:*` | 120 – 260 monet | 145 – 310 monet | Wysoka marża na Wyspie-Rynku, idealne pod pakowanie w pudła (*Packagers*) |
| **Tier 4 (Przemysł Create)** | Komponenty mechaniczne, kolej i paliwa (Stage 2–4) | `create:precision_mechanism`, `create:track` (pakiety po 16/64), `create:sturdy_sheet`, `createaddition:bioethanol_bucket` / paliwa przetworzone | 350 – 900 monet | 420 – 1 080 monet | Droga do Stage 3 (100k) i Stage 4 (250k); wykorzystuje lawę i kwarc z Netheru |
| **Tier 5 (Eksport High-Tech)** | Eksport *AE2* & *Mekanism* (Stage 4–5) | `ae2:calculation_processor`, `ae2:engineering_processor`, `mekanism:ultimate_control_circuit`, `mekanism:pellet_polonium` / pakiety przemysłowe | 2 500 – 12 000 monet | 3 000 – 14 500 monet | Skalowanie pod Stage 5 (1 000 000 monet) oraz cel flex (2M) bez monotonnego grindu |

### Przykładowe ceny zakupowe w katalogu progresji (Buy — tylko startowe / odblokowujące)
- Sadzonki drzew, nasiona *Farmer's Delight*, trzcina cukrowa, kelp: **100 – 500 monet** (Stage 0–1)
- Wiadro lawy / zestaw startowy Blaze Burner (przed odblokowaniem Netheru): **1 500 – 3 500 monet** (Stage 1)
- Certus Quartz Seed / Sky Stone (starter do namnażania w AE2): **5 000 – 15 000 monet** (Stage 3–4)
- Żetony Etapów (`stage_1_token` .. `stage_5_token`): **10k / 50k / 100k / 250k / 1M monet**
- Prestiżowy cel endgame (po Stage 5): `create:creative_motor` — **2 000 000 monet** (limit **1–2 sztuki na drużynę**)

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

---

## 4. Zatwierdzone decyzje ekonomiczne (RFC #5 — zamknięte)

Wszystkie otwarte pytania z RFC #5 zostały wspólnie rozstrzygnięte przez `agent:antigravity` i `agent:partner`:

1. **Jedna spójna waluta:** wyłącznie **`Lightman's Currency`** (bez *SDM Shop (Legacy)* i bez *Create: Numismatics*) — wspólne **Team Bank Accounts**, fizyczne stoiska NPC (`Shoppers`, premia +20%) oraz hurt/katalog progresji przez natywne `Creative Network Traders` (`Trading Terminal`).
2. **Strojenie Wyspy-Rynku i `Shoppers` pod Exaroton:** limit **8–12 aktywnych NPC**, **3 bankomaty ATM** w odstępach >6 bloków i w 100% płaski plac `Y=64` (wdrożone w [ISLAND_DESIGN.md](ISLAND_DESIGN.md)).
3. **Ochrona anty-exploitowa:** wyłączony `Coin Mint`, zablokowane `Slot Machines`, wyzerowana wartość surowców Tier 0 w `Shoppers` oraz zautomatyzowany walidator braku pętli arbitrażowych nad `config/halucynacje_economy/prices.json`.
4. **Współdzielenie Żetonów Etapów:** współdzielenie drużynowe (`FTB Teams`) / globalne co-op (`halucynacje_global_stages` w `dimension_gating.js`).
5. **Nagroda za Stage 5 (1 000 000 monet):** odblokowanie prestiżowego zakupu **`create:creative_motor`** za dodatkowe **2 000 000 monet** (twardy limit **1–2 sztuki na drużynę**) + zamknięcie księgi zadań *FTB Quests*.
