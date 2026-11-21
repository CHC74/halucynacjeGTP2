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
| **Stage 5: Imperium Tycoona** | `kubejs:stage_5_token` | **1 000 000 monet** | **Certyfikat Imperium Tycoona** — kategoria endgame: kontrakty korporacyjne, luksusowe dekoracje / *Create: Big Cannons* / trofea i opcjonalne nagrody kreatywne (np. Creative Motor jako cel końcowy do decyzji w RFC) | Pełna automatyzacja całej sieci wysp, maksymalna wydajność eksportu high-tech i zamknięcie księgi zadań *FTB Quests*. |

---

## 2. Filozofia cenowa i tabela przykładowych cen (Buy / Sell)

### Zasady nadrzędne wyceny
1. **Płacimy za inżynierię, nie za kilof:** wartość przedmiotu w skupie rośnie wykładniczo wraz z liczbą etapów przetwarzania w maszynach Create / FD / Mekanism.
2. **Premia za fizyczny handel na Wyspie-Rynku:** sprzedaż przez fizyczne sklepy *Lightman's Currency* + NPC *Shoppers* daje docelowo **+20% wyższą cenę** niż szybki skup hurtowy w terminalu GUI.
3. **Blokada surowców kopalnianych (Nether/End):** surowe bloki wydobywane w Netherze i Endzie nie mogą być sprzedawane z zyskiem.

### Przykładowy cennik referencyjny (do finalnego strojenia w RFC #2)

| Tier | Kategoria towaru | Przykładowe przedmioty | Skup hurtowy (GUI) | Sklep NPC (Rynek, ~+20%) | Rola w balansie |
| :--- | :--- | :--- | ---: | ---: | :--- |
| **Tier 0 (Blokada)** | Surowe bloki kopalniane (Nether / End / Overworld) | `minecraft:netherrack`, `minecraft:quartz`, `minecraft:gold_ingot`, `minecraft:end_stone`, `minecraft:chorus_fruit`, `minecraft:cobblestone` | **0 monet** *(zablokowane)* | **0 monet** | Chroni ekonomię przed *FTB Ultimine* + Fortune III w Netherze i Endzie |
| **Tier 1 (Start)** | Podstawowe wypieki i przetwory (Stage 0–1) | `minecraft:bread`, `create:dough`, `farmersdelight:cooked_bacon`, `farmersdelight:apple_pie_slice` | 4 – 12 monet | 5 – 15 monet | Pierwsze dochody na rozkręcenie wyspy i zakup Stage 1 (10k) |
| **Tier 2 (Kuchnia)** | Złożone posiłki *Farmer's Delight* & *Create: Food* (Stage 1–2) | `farmersdelight:hamburger`, `farmersdelight:pasta_with_meatballs`, `farmersdelight:steak_and_potatoes`, `farmersdelight:honey_glazed_ham` | 35 – 90 monet | 45 – 110 monet | Główny silnik finansowy na Stage 2 (50k); motywuje do *Slice & Dice* i *Central Kitchen* |
| **Tier 3 (Luksus / Cukiernia)** | Słodycze i wypieki premium *Create* & *Confectionery* (Stage 2–3) | `create:sweet_roll`, `create:chocolate_glazed_berries`, `create:honeyed_apple`, `create_confectionery:bar_of_black_chocolate`, torty *Create: Food* | 120 – 260 monet | 145 – 310 monet | Wysoka marża na Wyspie-Rynku, idealne pod pakowanie w pudła (*Packagers*) |
| **Tier 4 (Przemysł Create)** | Komponenty mechaniczne, kolej i paliwa (Stage 2–4) | `create:precision_mechanism`, `create:track` (pakiety po 16/64), `create:sturdy_sheet`, biopaliwa / paliwa przetworzone | 350 – 900 monet | 420 – 1 080 monet | Droga do Stage 3 (100k) i Stage 4 (250k); wykorzystuje lawę i kwarc z Netheru |
| **Tier 5 (Eksport High-Tech)** | Eksport *AE2* & *Mekanism* (Stage 4–5) | Procesory AE2 (`ae2:calculation_processor`, `ae2:engineering_processor`), stopy i obwody Mekanism (`mekanism:ultimate_control_circuit`, `mekanism:pellet_polonium` / pakiety przemysłowe) | 2 500 – 12 000 monet | 3 000 – 14 500 monet | Skalowanie pod Stage 5 (1 000 000 monet) bez monotonnego grindu |

### Przykładowe ceny zakupowe w sklepie (Buy — tylko startowe / odblokowujące)
- Sadzonki drzew, nasiona *Farmer's Delight*, trzcina cukrowa, kelp: **100 – 500 monet** (Stage 0–1)
- Wiadro lawy / zestaw startowy Blaze Burner (przed odblokowaniem Netheru): **1 500 – 3 500 monet** (Stage 1)
- Certus Quartz Seed / Sky Stone (starter do namnażania w AE2): **5 000 – 15 000 monet** (Stage 3–4)
- Żetony Etapów (`stage_1_token` .. `stage_5_token`): **10k / 50k / 100k / 250k / 1M monet**

---

## 3. Mapa surowcowa Pure-Create Skyblock (bez *Ex Deorum*)

Wszystkie kluczowe surowce potrzebne od Stage 0 do Stage 3 można zautomatyzować czystym **Create 6** wspieranym przez **Create: Mechanical Extruder** oraz lekkie receptury uzupełniające w [kubejs/server_scripts/skyblock_create_recipes.js](../kubejs/server_scripts/skyblock_create_recipes.js):

| Surowiec | Metoda w Pure-Create Skyblock | Etap | Uwagi / KubeJS |
| :--- | :--- | :--- | :--- |
| **Cobblestone / Stone / Basalt / Andesite** | **Create: Mechanical Extruder** (woda + lawa + blok katalizatora pod spodem) | Stage 0 | Zastępuje lagujące generatory tłokowe; andezyt również z mieszania (Flint + Gravel + Lava) |
| **Gravel & Flint** | Mielenie Cobblestone w **Millstone** lub **Crushing Wheels** | Stage 0 | Bazowy cykl Create |
| **Sand & Clay** | Mielenie Gravel -> Sand -> płukanie (**Bulk Washing / Encased Fan + Water**) -> **Clay Ball** | Stage 0 | Standard Create 6 |
| **Iron Nuggets (Żelazo)** | Płukanie Gravel (**Bulk Washing**) -> Iron Nuggets + Flint | Stage 0 | Standard Create 6 — skaluje się łatwo z Ekstruderem |
| **Gold Nuggets (Złoto)** | Płukanie Red Sand (z mielenia Terracotty -> Red Sand) -> Gold Nuggets | Stage 0–1 | Standard Create 6 (Clay -> Brick/Terracotta -> Crushing -> Red Sand -> Washing) |
| **Quartz (przed Netherem)** | Płukanie **Soul Sand** (Bulk Haunting na Sand -> Soul Sand -> Bulk Washing -> Quartz + Gold Nuggets) | Stage 1 | Pozwala uzyskać Electron Tubes i Brass jeszcze przed Stage 2, a Nether potem drastycznie przyspiesza skalę |
| **Zinc (Cynk)** | 1) Mielenie **Asurine** -> Crushed Raw Zinc (30%+) <br> 2) Receptura KubeJS: mieszanie/kompaktowanie **Asurine** z bruku/piasku/lapisu lub kruszenie Deepslate/Andesite | Stage 1 | Zdefiniowane w `skyblock_create_recipes.js` (wypełnia lukę Skyblocka!) |
| **Copper (Miedź)** | 1) Mielenie **Veridium** -> Crushed Raw Copper <br> 2) Receptura KubeJS: tworzenie **Veridium** (Mixing: Clay + Gravel + Water / Catalyst) | Stage 0–1 | Zdefiniowane w `skyblock_create_recipes.js` — niezbędne do rur i kotłów |
| **Andesite & Andesite Alloy** | Mixing: Cobblestone + Diorite / lub Mechanical Extruder -> Andesite + Iron/Zinc Nuggets -> Andesite Alloy | Stage 0 | Dodatkowo receptura KubeJS z Gravel + Flint + Clay ułatwiająca wczesny start |
| **Kamienie rudonośne Create (`Asurine`, `Crimsite`, `Ochrum`, `Veridium`)** | Dedykowane receptury **Create Mixing / Compacting** w KubeJS (z lokalnych półproduktów Skyblocka) -> potem **Crushing Wheels** dla wysokich uzysków rud | Stage 1–2 | Daje satysfakcjonującą, typowo „Create'ową” linię rud bez żadnych sit |
| **Limestone & Scoria** | Mixing/Extruder: **Limestone** (Honey + Lava / KubeJS Compacting), **Scoria** (Chocolate + Lava lub Netherrack + Lava w Stage 2) | Stage 1–2 | Standardowe interakcje płynów Create + opcjonalny fallback w KubeJS |
| **Kelp (Wodorosty)** | 1) Zakup pierwszej sztuki w sklepie (Stage 0/1) <br> 2) Automatyczna farma wodna Create Mechanical Harvester | Stage 0–1 | Kluczowy do pasów transmisyjnych (*Mechanical Belt*) i suszenia na paliwo |
| **Blaze Burner** | 1) Pusty Blaze Burner (Iron Sheets + Netherrack z KubeJS Haunting/Mixing) + napełnienie w sklepie Stage 1 (ograniczona liczba startowa) <br> 2) Po odblokowaniu Netheru (Stage 2) — klasyczne łapanie Blaze'ów ze spawnera | Stage 1–2 | Zapewnia miękkie wejście w Brass Age na Stage 1 i wielką nagrodę przy odblokowaniu Netheru |
| **Lawa (Paliwo)** | 1) Stage 0–1: Dripstone + Cauldron (zakup Pointed Dripstone w sklepie) lub podgrzewany Mixing Cobblestone -> Lava <br> 2) Stage 2+: **Pociągi-cysterny z Netheru** (nieskończone źródło lawy) | Stage 0–2 | Pociąg z lawą z Netheru to jedna z najfajniejszych pętli w Create |

---

## 4. Otwarte pytania ekonomiczne do uzgodnienia z agentem partnerskim (RFC #2)

1. **Jedna waluta czy dwie waluty?**
   - *Opcja A (Rekomendowana):* **Jedna spójna waluta** z *Lightman's Currency* używana zarówno w fizycznych sklepach NPC (*Shoppers*), jak i w hurtowym sklepie GUI (*SDM Shop* / *FTB Quests* + KubeJS) — zero tarcia dla graczy.
   - *Opcja B:* Dodanie *Create: Numismatics* jako waluty fizycznej/bankowej + konwerter w KubeJS na walutę sklepu GUI.
2. **Strojenie NPC *Shoppers* na Wyspie-Rynku:**
   - Jaki budżet dzienny i częstotliwość wizyt NPC ustawić, aby fizyczne sklepy były **opłacalnym głównym źródłem dochodu w Stage 0–3**, ale nie obciążały TPS na Exaroton?
3. **Współdzielenie Żetonów Etapów w drużynie (*FTB Teams*):**
   - Czy aktywacja `kubejs:stage_X_token` powinna zawsze odblokowywać etap **dla całej drużyny FTB Teams / całego serwera** (rekomendowane dla małego serwera co-op znajomych), czy per pojedynczy gracz?
4. **Nagroda za Stage 5 (1 000 000 monet):**
   - Czy odblokować w sklepie za bardzo wysoką cenę pojedyncze elementy „endgame flex” (np. `create:creative_motor` za kolejne 2M monet), czy zakończyć progresję prestiżowym certyfikatem i zadaniami *FTB Quests*?
