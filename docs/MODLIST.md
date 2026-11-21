# MODLIST.md — Kuratorowana lista modów (NeoForge 1.21.1)

**Cel budżetowy:** **~95–115 modów łącznie** (wliczając wymagane biblioteki techniczne takie jak *Architectury*, *Rhino*, *FTB Library*, *LibX*, *Sophisticated Core*, *Balm*, *GuideME*, *Curios* itp.).
**Platforma:** Minecraft `1.21.1` | **NeoForge** | **Create 6.x**
**Kluczowe ograniczenia:** Hosting **Exaroton (6–8 GB RAM)** oraz pełna stabilność klienta na **Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)**.

> **Status (RFC #3 — zatwierdzone):** Lista modów v1.0 została wspólnie uzgodniona przez `agent:antigravity` i `agent:partner` (Issue #3 oraz Issue #5). Szczegółowe przypięcie konkretnych buildów i zależności znajduje się w katalogu `packwiz/` (Issue #6).

---

## 1. Rdzeń Skyblocka i Świat

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Skyblock Builder** | Modrinth / CurseForge | Serwer + Klient | Etap 0 — generator wielo-wyspowego Overworlda | Wymaga `LibX`; układ 3 wysp opisany w [ISLAND_DESIGN.md](ISLAND_DESIGN.md) |
| **KubeJS** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — Żetony Etapów, gating wymiarów, receptury pure-Create, anty-exploit | KubeJS 7 na 1.21.1 (wymaga `Rhino` + `Architectury`); zerowy wpływ na FPS |
| **FTB Quests** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — księga progresji, poradnik Tycoona, nagrody | Wymaga `FTB Library`; integracja z etapami i sklepem |
| **FTB XMod Compat** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — mostek FTB Quests <-> KubeJS / JEI / Game Stages | Kluczowy do synchronizacji postępu między KubeJS a FTB Quests |
| **FTB Teams** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — drużyny kooperacyjne i wspólny postęp | Niski narzut na Exaroton; podstawa wspólnego odblokowywania etapów |

---

## 2. Create 6 + Addony

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Create (6.x)** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — serce paczki (Packagers, Chain Conveyors, Frogports, pociągi) | Zawiera wbudowany `Flywheel` + `Ponder`; na Mac M2 zweryfikować backend Flywheel (`instancing` vs `off`) |
| **Steam 'n' Rails Neoforge** *(nieoficjalny port `create-steam-n-rails-1.21.1`)* | Modrinth | Serwer + Klient | Etap 1–4 — rozbudowa kolei, monorail, wąskie tory, semafory | **Przypięte w `packwiz`** do kompatybilnej wersji Create `6.0.x`; priorytet do smoke-testu na Mac M2 / Exaroton (fallback: czyste pociągi Create 6) |
| **Create: Hypertubes** | Modrinth / CurseForge | Serwer + Klient | Etap 2–4 — szybki transport graczy między wyspami w rurach | Oficjalne NeoForge `1.21.1`; świetna synergia z układem 3 wysp; lekki dla serwera |
| **Create: Mechanical Extruder** | Modrinth / CurseForge | Serwer + Klient | Etap 0–2 — czyste generatory bruku, kamienia, andezytu, tufu, bazaltu | Oficjalne NeoForge `1.21.1` (wymaga `Mechanicals Lib`); ogromna poprawa TPS na Exaroton |
| **Create: Enchantment Industry** | Modrinth / CurseForge | Serwer + Klient | Etap 2–4 — przemysłowe zaklinanie narzędzi (mechanika, zero magii) | Oficjalne NeoForge `1.21.1` (wymaga `Create: Dragons Plus`) |
| **Create: Crafts & Additions** | Modrinth / CurseForge | Serwer + Klient | Etap 2–4 — silniki elektryczne (SU <-> FE), alternatory, druty, Liquid Blaze Burner, biopaliwo | **Zatwierdzone jako jedyny mod elektryczności Create** (rezygnacja z *Create: New Age* — brak duplikatów przed *Mekanism*) |
| **Create: Stuff 'N Additions** | Modrinth / CurseForge | Serwer + Klient | Etap 1–3 — jetpacki parowe/miedziane, narzędzia parowe, akcesoria | Oficjalne NeoForge `1.21.1`; bardzo przydatne do budowy mostów i fabryk nad pustką |
| **Create: Connected** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — dodatkowe skrzynie biegów, katalizatory (fan catalysts), sprzęgła | Kompaktowe fabryki = mniej chunków i lepsze TPS |
| **Create: Copycats+** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — estetyczne panele, schody, płyty dla hal fabrycznych i stacji | Bezpieczny na Mac M2; minimalny narzut na serwer |
| **Create: Deco** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — przemysłowe dekoracje, cegły, kładki, barierki, lampy | Buduje klimat dzielnicy fabrycznej i Wyspy-Rynku |
| **Create: Trading Floor** | Modrinth / CurseForge | Serwer + Klient | Etap 1–4 — mechaniczny depozyt handlowy dla wieśniaków/handlu | Oficjalne NeoForge `1.21.1`; świetnie łączy się z Wyspą-Rynkiem |
| **Create: Applied Kinetics** | Modrinth / CurseForge | Serwer + Klient | Etap 4–5 — integracja Create 6 z *Applied Energistics 2* | Oficjalne NeoForge `1.21.1`; kluczowy most między Create a cyfrową logistyką AE2 |

---

## 3. Ekonomia i Sklep (Jednolita waluta — RFC #5 zatwierdzone)

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Lightman's Currency** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — jedyny rdzeń ekonomii: fizyczne sklepy, wspólne konta bankowe (Team Bank Account), ATM oraz hurtowy **Trading Terminal** (`Creative Network Traders`) | **Obowiązkowa ochrona anty-exploitowa:** wyłączony `Coin Mint` (`canMint = false`) oraz usunięte receptury `Coin Mint` i `Slot Machine` w KubeJS |
| **Shoppers (Lightman's Currency Addon)** | Modrinth | Serwer + Klient | Etap 0–5 — NPC klienci odwiedzający fizyczne sklepy graczy na Wyspie-Rynku (premia **+20%** względem hurtu) | Limit **8–12 aktywnych NPC**, 3 ATM na Rynku w odstępie >6 bloków, wartości surowców Tier 0 wyzerowane (`/shoppers value set <item> 0`) |

> **Decyzja RFC #3 i #5 (zamknięte):** Rezygnujemy z **`SDM Shop (Legacy)`**, **`Economics (NeoForge)`** oraz **`Create: Numismatics`**, aby utrzymać **jedną spójną walutę** (`Lightman's Currency`) dla fizycznych sklepów NPC i hurtowego skupu w `Trading Terminal` (z opcjonalnym `Lightman's Currency Tech` po weryfikacji braku konfliktów).

---

## 4. Gastronomia i Rolnictwo pod handel

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Farmer's Delight** | Modrinth / CurseForge | Serwer + Klient | Etap 0–4 — baza rolnicza i kulinarna (garnki, deski, bogate dania na sprzedaż) | Złoty standard; bardzo lekki i stabilny |
| **Create: Slice & Dice** | Modrinth / CurseForge | Serwer + Klient | Etap 1–4 — mechaniczne krojenie i zraszacze rolnicze łączące Create z FD | Niezbędny do pełnej automatyzacji dań *Farmer's Delight* |
| **Create: Central Kitchen** | Modrinth / CurseForge | Serwer + Klient | Etap 1–4 — automatyczne gotowanie dań FD na taśmach i w mikserach Create | Pozwala budować zautomatyzowane „kuchnie przemysłowe” pod handel |
| **Create: Food** | Modrinth / CurseForge | Serwer + Klient | Etap 1–4 — rozbudowane linie piekarnicze, hamburgery, kanapki, wypieki | Szeroki wachlarz wieloetapowych towarów o wysokiej marży |
| **Create: Confectionery** | Modrinth / CurseForge | Serwer + Klient | Etap 2–4 — czekolada, karmel, ciastka, napoje na sprzedaż premium | Naturalny tier „dóbr luksusowych” w sklepach NPC na Wyspie-Rynku |

---

## 5. Magazyny i Late-Game Tech — zero magii

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Sophisticated Storage** | Modrinth / CurseForge | Serwer + Klient | Etap 0–3 — ulepszane skrzynie, beczki i szafki z filtrami oraz kompresją | Wymaga `Sophisticated Core`; ogranicza liczbę bytów i skrzyń w bazie |
| **Sophisticated Backpacks** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — plecaki z ulepszeniami (magnes, karmienie, większa pojemność) | Wygoda w eksploracji Netheru/Endu i przy budowaniu |
| **Applied Energistics 2** | Modrinth / CurseForge | Serwer + Klient | Etap 4–5 — cyfrowy magazyn, autocrafting i logistyka late-game | Wymaga `GuideME`; świetna synergia z *Create: Applied Kinetics* |
| **AE2 JEI Integration** | Modrinth / CurseForge | Serwer + Klient | Klient — pełna obsługa receptur AE2 w JEI | Lekki dodatek UX |
| **Mekanism** | Modrinth / CurseForge | Serwer + Klient | Etap 4–5 — zaawansowana metalurgia, chemia, 3x–5x przetwarzanie, eksport high-tech | Konfigurować ostrożnie pod Exaroton (unikać zbędnych pętli rur) |
| **Mekanism Generators** | Modrinth / CurseForge | Serwer + Klient | Etap 4–5 — turbiny, reaktory fission/fusion, energetyka endgame | Źródło ogromnych ilości FE pod końcową produkcję do Stage 5 (1M monet) |
| **Building Gadgets 2** | Modrinth / CurseForge | Serwer + Klient | Etap 1–5 — narzędzia do szybkiego stawiania platform, mostów i hal fabrycznych | Ogromne przyspieszenie rozbudowy Skyblocka |

---

## 6. QoL i Administracja

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **FTB Chunks** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — claimowanie wysp i kontrolowany chunk-loading fabryk | Na Exaroton ustawić rozsądny limit force-loaded chunks (np. 16–25 na drużynę) |
| **FTB Essentials** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — komendy `/home`, `/tpa`, `/spawn`, `/back` | Poprawia komfort bez psucia balansu logistyki towarów |
| **FTB Ultimine** | CurseForge / Modrinth | Serwer + Klient | Etap 0–5 — szybkie ścinanie drzew i kopanie żył | Brak wpływu negatywnego na ekonomię dzięki zerowemu skupowi surowizny |
| **JEI (Just Enough Items)** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — przeglądarka receptur i zastosowań | Podstawowe narzędzie przy rozbudowanych drzewach Create/FD/Mekanism |
| **Jade** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — HUD z informacjami o blokach, SU, płynach i postępie maszyn | Lekki, niezastąpiony w Create |
| **Xaero's Minimap** | Modrinth / CurseForge | Klient | Etap 0–5 — minimapa i waypointy między wyspami | Stabilny na Mac M2 |
| **Xaero's World Map** | Modrinth / CurseForge | Klient | Etap 0–5 — pełnoekranowa mapa świata | Bezpieczny na OpenGL 4.1 |
| **Mouse Tweaks** | Modrinth / CurseForge | Klient | Etap 0–5 — szybkie zarządzanie ekwipunkiem myszą | Klasyk QoL |
| **Carry On** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — podnoszenie skrzyń i wybranych bloków bez ich rozbijania | Wykluczyć w configu problematyczne tile-entities jeśli wystąpią (np. wybrane maszyny multi-block) |
| **Waystones** | Modrinth / CurseForge | Serwer + Klient | Etap 0–5 — szybkie przemieszczanie się graczy między wyspami (np. Dom <-> Rynek) | Wymaga `Balm`; nie zastępuje transportu towarów (gracz przenosi tylko swój ekwipunek) |
| **AppleSkin** | Modrinth / CurseForge | Serwer + Klient | Klient (opcj. serwer) — podgląd saturacji posiłków *Farmer's Delight* | Lekki i czytelny |
| **Controlling** | Modrinth / CurseForge | Klient | Etap 0–5 — wyszukiwanie skrótów klawiszowych i konfliktów | Niezbędny przy ~100 modach |
| **Configured** | Modrinth / CurseForge | Klient | Etap 0–5 — czytelne menu konfiguracji w grze | Wygodne strojenie klienta na Mac M2 |

---

## 7. Optymalizacja & Diagnostyka

| Mod | Źródło (Modrinth/CurseForge) | Strona | Etap / Rola | Uwagi (Mac M2 / Exaroton) |
| :--- | :--- | :--- | :--- | :--- |
| **Sodium** | Modrinth | Klient | Wydajność renderingu | Kluczowy dla płynnych FPS na Mac M2 (OpenGL 4.1); na 1.21.1 natywnie wspiera NeoForge |
| **Lithium** | Modrinth | Serwer + Klient | Optymalizacja ticków, AI i fizyki gry | Bezpośredni zysk TPS na Exaroton; bardzo bezpieczny z Create |
| **FerriteCore** | Modrinth / CurseForge | Serwer + Klient | Redukcja zużycia pamięci RAM (nawet 30–40%) | Obowiązkowy pod 6–8 GB RAM na Exaroton i 6 GB Xmx na Mac M2 |
| **ModernFix** | Modrinth / CurseForge | Serwer + Klient | Szybsze uruchamianie, mniejszy RAM, poprawki wydajności modeli | Sprawdzić ustawienia pamięci podręcznej modeli z Create |
| **EntityCulling** | Modrinth / CurseForge | Klient | Ukrywanie niewidocznych bytów i block-entities za ścianami | Ratuje FPS w gęstych halach fabrycznych na Mac M2 |
| **AllTheLeaks** | Modrinth / CurseForge | Serwer + Klient | Łatanie wycieków pamięci w paczkach modów na 1.21.1 | Bardzo ważny przy dłuższych sesjach na Exaroton |
| **Spark** | Modrinth / CurseForge | Serwer + Klient | Profiler TPS/MSPT oraz pamięci JVM | Narzędzie diagnostyczne nr 1 (`/spark profiler`, `/spark tps`) |
| **Clumps** | Modrinth / CurseForge | Serwer + Klient | Łączenie kul doświadczenia w jeden byt | Ochrona TPS przy farmach i *Create: Enchantment Industry* |

---

## 8. Świadomie wykluczone (i dlaczego)

| Wykluczony mod / kategoria | Powód wykluczenia (nienegocjowalne) |
| :--- | :--- |
| **Valkyrien Skies / Clockwork** | Poważne problemy ze stabilnością i renderingiem na **Apple Silicon Mac M2 (OpenGL 4.1)** oraz duże ryzyko crashy i desynchronizacji na serwerze Exaroton. |
| **Ex Deorum / Ex Nihilo** | Projekt zakłada **pure-Create Skyblock** — zasoby zdobywamy przez maszyny Create, ekstrudery, płukanie i mieszanie, a nie ręczne przesiewanie żwiru w sitach. |
| **Mody magiczne** (*Botania*, *Ars Nouveau*, *Iron's Spells 'n Spellbooks*, *Occultism*, *Mystical Agriculture*) | Twarde założenie tematyczne: **zero magii**. Świat opiera się wyłącznie na mechanice, gastronomii przemysłowej i technologii high-tech. |
| **Mohist / Arclight** (hybrydy Bukkit+Forge/NeoForge) | Znane z psucia kontrapcji Create, pociągów, Packagerów oraz zdarzeń KubeJS. Używamy wyłącznie czystego **NeoForge 1.21.1**. |
| **Simple Voice Chat / Plasmo Voice** | Zbędny narzut portów i konfiguracji na Exaroton — gracze rozmawiają na Discordzie. |
| **Corpse / Gravestone / Tombstone** | Całkowicie zbędne przy permanentnie włączonej regule `keepInventory = true`. |
| **Create: New Age** | Wyłączone w RFC #3 — dubluje konwersję SU <-> FE z *Create: Crafts & Additions* oraz reaktory z *Mekanism Generators*. |
| **Create: Big Cannons** | Odłożone po v1.0 w RFC #3 — oszczędność slotów w budżecie modów/bibliotek (`Ritchie's Projectile Library`) i mniejsze ryzyko dla TPS na pustce. |
| **SDM Shop (Legacy) / Economics / Create: Numismatics** | Wyłączone w RFC #3 i #5 — utrzymujemy **jedną spójną walutę** (`Lightman's Currency` + `Shoppers` + `Creative Network Traders`). |

---

## Szacowany bilans liczby modów (po finalizacji RFC #3)

- Mody merytoryczne (tabele 1–7): **~50–52 mody**
- Wymagane biblioteki i zależności (*Architectury*, *Rhino*, *FTB Library*, *LibX*, *Mechanicals Lib*, *Create: Dragons Plus*, *Sophisticated Core*, *Balm*, *GuideME*, *Curios* / *Cloth Config* itp.): **~25–35 modów**
- **Razem szacunkowo:** **~78–88 modów** — z dużym, bezpiecznym zapasem poniżej górnego limitu **115 modów** (idealnie pod Exaroton 6–8 GB RAM i Apple Silicon Mac M2).
