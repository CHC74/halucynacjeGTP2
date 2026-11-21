# VISION.md — Game Design Document (Create Skyblock Tycoon)

## 1. Koncepcja przewodnia

**HalucynacjeGTP2** to kooperacyjny modpack typu **Create Skyblock Tycoon** na **Minecraft 1.21.1 (NeoForge)**, w którym cała progresja opiera się na inżynierii mechanicznej, logistyce i handlu przetworzonymi dobrami fabrycznymi.

Zamiast klasycznego skyblockowego grindu na sitach (*Ex Deorum* / *Ex Nihilo*) oraz zamiast systemów magicznych, gracze budują pełnoprawną, estetyczną dzielnicę przemysłową w zawieszonym świecie wysp, transportują gotowe wyroby na oddaloną Wyspę-Rynek i zamieniają zyski w **Żetony Etapów (Stage Tokens)** odblokowujące nowe surowce, wymiary i technologie high-tech.

---

## 2. Główna pętla rozgrywki (Core Gameplay Loop)

```text
[Wyspa Startowa / Fabryczna]
   │  1. Generacja surowców pure-Create (ekstrudery, płukanie, młyny, farmy)
   │  2. Przetwarzanie na towary o wysokiej marży (dania, słodycze, mechanizmy, paliwa)
   │  3. Pakowanie i logistyka Create 6 (Packagers, Stock Links, Chain Conveyors / Frogports,
   │     Pociągi Steam 'n' Rails, Hypertubes)
   ▼
[Transport ~150 bloków przez pustkę]
   ▼
[Wyspa-Rynek (Market Island)]
   │  4. Dostawa do fizycznych sklepów NPC (Lightman's Currency + Shoppers)
   │     oraz hurtowego terminala skupu / sklepu GUI
   │  5. Sprzedaż przetworzonych towarów -> zarobek monet
   ▼
[Sklep Progresji & FTB Quests]
   │  6. Zakup Żetonów Etapów (Stage Tokens: 10k / 50k / 100k / 250k / 1M)
   │  7. Odblokowanie nowych kategorii sklepu, rzadkich surowców bazowych,
   │     wymiarów (Nether @ Stage 2, End @ Stage 4) oraz AE2 + Mekanism
   ▼
[Skalowanie fabryki i kolejne linie produkcyjne -> powrót do kroku 1]
```

### Dlaczego taki układ działa najlepiej w kooperacji?
- **Naturalny podział ról:** jeden gracz może projektować linie gastronomiczne i estetyczne stoiska na Rynku, a drugi budować wiadukt kolejowy, logistykę Packagerów i przetwórstwo metalurgiczne.
- **Widoczny postęp w świecie:** zamiast stać przed jednym blokiem sklepu GUI, widzisz jak Twoje pociągi z wagonami towarowymi i cysternami kursują między Wyspą Fabryczną a Wyspą-Rynkiem, zasilając sklepy odwiedzane przez NPC *Shoppers*.
- **Brak sztucznego „hard-locka” w recepturach:** progresja stosuje **soft gating** (głównie przez sklep surowców/katalogów, questy i dostęp do wymiarów), dzięki czemu gracze nie frustrują się nieintuicyjnymi, zablokowanymi recepturami podstawowych bloków.

---

## 3. Architektura świata i wysp (*Skyblock Builder*)

Overworld jest pustką (*Void*) zarządzaną przez **Skyblock Builder** w układzie wielo-wyspowym:

| Wyspa / Wymiar | Położenie / Dostęp | Rola w rozgrywce |
| :--- | :--- | :--- |
| **Wyspa Startowa (Fabryczna)** | Punkt startowy drużyny (`0, y, 0`) | Pierwsze drzewo, generator bruku, miejsce pod koła wodne, młyn i wczesne farmy. Łatwa do rozbudowy platformami Create. |
| **Wyspa-Rynek (Market Island)** | ~150 bloków od Wyspy Startowej (widoczna z daleka) | Miejsce handlu: plac z fizycznymi sklepami (*Lightman's Currency* + NPC *Shoppers*), stacja rozładunkowa dla pociągów/Frogportów, Waystone oraz terminal hurtowy. |
| **Wyspy Ekspansyjne (opcjonalnie)** | 200–350 bloków w dalszych etapach | Opcjonalne wysepki tematyczne (np. wyspa rolnicza / port lotniczy Hypertubes / kompleks reaktorowy Mekanism) do wykorzystania przy skalowaniu bazy. |
| **Normalny Nether** | Odblokowywany przy **Stage 2 (50k monet)** | Klasyczny, w pełni generowany Nether. Źródło lawy dla pociągów-cystern, farmy Blaze'ów, Netherracku, kwarcu i Netherite'u. |
| **Normalny End** | Odblokowywany przy **Stage 4 (250k monet)** | Klasyczny End. Walka ze smokiem, elytry, Shulkery, End Stone i Chorus Fruit potrzebne do zaawansowanego late-game. |

### Dystans ~150 bloków — celowy zabieg projektowy
Odległość ~150 bloków między Wyspą Startową a Wyspą-Rynkiem jest:
- wystarczająco mała, by na starcie (Stage 0) dotrzeć tam prostym mostem lub Waystonem i poczuć cel inwestycji,
- wystarczająco duża, by w Stage 1–3 budowa **Chain Conveyors + Frogports**, **mostu kolejowego Create (Steam 'n' Rails)** oraz szybkiej rury transportowej **Create: Hypertubes** miała realny sens praktyczny i wizualny.

---

## 4. Analiza ochrony ekonomii (dlaczego normalny Nether i End nie zepsują Tycoona?)

Jednym z najczęstszych błędów w paczkach Skyblock z ekonomią jest wpuszczenie graczy do normalnego Netheru lub Endu przy jednoczesnym wysokim skupie surowców kopalnianych. Gracz bierze wtedy kilof z Fortune III + *FTB Ultimine* i w 10 minut rujnuje sens budowania fabryk.

W **HalucynacjeGTP2** stosujemy **4 warstwy ochrony ekonomii**:

1. **Zasada „Zero zysku za surowiznę” (Processed-Goods Only Economy):**
   - Sklep skupuje po wysokich cenach **wyłącznie dobra przetworzone w wieloetapowych liniach produkcyjnych**: złożone dania *Farmer's Delight*, wyroby cukiernicze *Create: Confectionery* / *Create: Food*, precyzyjne mechanizmy, tory kolejowe, paliwa przetworzone oraz komponenty *AE2* / *Mekanism*.
   - Surowe bloki kopane w Netherze i Endzie (`netherrack`, `quartz`, `gold_nugget`, `blackstone`, `end_stone`, `chorus_fruit`, `shulker_shell`, `ancient_debris`) mają **zerową (zablokowaną) lub czysto symboliczną cenę skupu**. Ich wartością jest użyteczność w recepturach i budowaniu, a nie bezpośrednia zamiana na monety.
2. **Nether jako akcelerator logistyki, a nie bankomat:**
   - Prawdziwą nagrodą z odblokowania Netheru w Stage 2 jest **pompa lawy + pociągi-cysterny przez portal** (nieskończone, darmowe paliwo pod kotły parowe i Blaze Burnery) oraz łatwiejsze pozyskiwanie Blaze Rodów i kwarcu pod bardziej złożone linie fabryczne (które dopiero produkują drogie towary na sprzedaż).
3. **Progresywna wartość dodana (Value-Added Multiplier):**
   - Im więcej etapów przetwarzania Create (mielenie -> mieszanie -> podgrzewanie -> prasowanie -> sekwencyjny montaż -> pakowanie), tym wyższa marża za sztukę/paczki towaru. Dzięki temu rozbudowa fabryki zawsze wygrywa z ręcznym zbieractwem.
4. **Dwa kanały zbytu — oba wspierające automatyzację:**
   - **Fizyczne sklepy NPC (*Lightman's Currency* + *Shoppers*)** na Wyspie-Rynku dają **premię do marży** (np. +15–25% względem skupu hurtowego) i motywują do ładnej logistyki oraz dystrybucji różnorodnego asortymentu.
   - **Hurtowy terminal / sklep GUI** zapewnia wygodny zlew nadwyżek przy produkcji wielkoskalowej w late-game (Stage 3–5), aby NPC nie byli wąskim gardłem w drodze do 1 000 000 monet.

---

## 5. Zasady QoL, kooperacji i komfortu gry

Paczka projektowana jest dla małej grupy znajomych grających wspólnie (bez sztucznej kary za błędy i bez frustrującego mikrozarządzania):

- **`keepInventory = true` na stałe:** wymuszane przy każdym uruchomieniu serwera skryptem KubeJS (`dimension_gating.js`). Spadnięcie w pustkę Skyblocka nie niszczy dorobku gracza — zbędne stają się mody na nagrobki (*Corpse*/*Gravestone*).
- **Kooperacja drużynowa (*FTB Teams* + *FTB Quests* + *FTB Chunks*):** wspólny postęp w księdze zadań, bezpieczne claimowanie i limitowane chunk-loading dla fabryk (kontrolowane pod budżet Exaroton).
- **Wygoda poruszania się i budowania:** *FTB Essentials* (`/home`, `/tpa`, `/spawn`), *FTB Ultimine* (wygodne ścinanie drzew i kopanie), *Waystones* (szybkie przeskoki po odkryciu lokacji), *Carry On* (przenoszenie skrzyń i maszyn bez opróżniania), *Building Gadgets 2* (szybkie stawianie platform i hal fabrycznych), *Mouse Tweaks*.
- **Czytelność informacji:** *JEI* (receptury + integracja z AE2 i Create), *Jade* (podgląd bloków, stresu SU, zawartości zbiorników), *AppleSkin* (statystyki jedzenia), *Xaero's Minimap & World Map* (bez nadmiernego obciążenia GPU).
- **Czystość gatunkowa:** zero magii, zero voice chatu w grze (rozmowy na Discordzie), maksymalna stabilność na Apple Silicon Mac M2.
