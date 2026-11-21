# HalucynacjeGTP2 — Create Skyblock Tycoon (NeoForge 1.21.1)

Modpack kooperacyjny typu **Create Skyblock Tycoon** budowany na **Minecraft 1.21.1 (NeoForge)** z wykorzystaniem **Create 6.x**. Zaprojektowany z myślą o płynnej rozgrywce na hostingu **Exaroton (6–8 GB RAM)** oraz pełnej kompatybilności z klientem na **Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)**.

---

## Szybkie linki do dokumentacji

- [AGENTS.md](AGENTS.md) — protokół współpracy wielu agentów AI (branching, claimowanie zadań, etykiety, checklisty PR)
- [docs/VISION.md](docs/VISION.md) — pełny Game Design Document (pętla rozgrywki, wyspy, ochrona ekonomii, zasady QoL)
- [docs/MODLIST.md](docs/MODLIST.md) — kuratorowana lista modów (~95–115 modów), budżet Exaroton/Mac M2 oraz lista modów wykluczonych
- [docs/PROGRESSION_AND_ECONOMY.md](docs/PROGRESSION_AND_ECONOMY.md) — 6-poziomowa progresja (Stage 0–5), cennik towarów fabrycznych i ścieżki surowcowe pure-Create
- [docs/EXAROTON_AND_MAC_M2.md](docs/EXAROTON_AND_MAC_M2.md) — konfiguracja serwera Exaroton i checklista wydajnościowa pod Mac M2
- Skrypty KubeJS:
  - [kubejs/startup_scripts/stage_tokens.js](kubejs/startup_scripts/stage_tokens.js) — rejestracja 5 Żetonów Etapów (`kubejs:stage_1_token`..`stage_5_token`)
  - [kubejs/server_scripts/dimension_gating.js](kubejs/server_scripts/dimension_gating.js) — realizacja żetonów, gating Netheru/Endu oraz stałe `keepInventory = true`
  - [kubejs/server_scripts/skyblock_create_recipes.js](kubejs/server_scripts/skyblock_create_recipes.js) — receptury pure-Create uzupełniające luki surowcowe Skyblocka

---

## Nienegocjowalne filary serwera

1. **Platforma:** Minecraft `1.21.1`, **NeoForge**, **Create 6.x**.
2. **Pure-Create Skyblock:** zero *Ex Deorum* / *Ex Nihilo* i ręcznego przesiewania — wszystkie surowce bazowe zdobywane są przez automatyzację w Create (młyny, płukanie, mieszanie, ekstrudery, logistyka).
3. **Wielo-wyspowy Overworld + odblokowywane wymiary:** *Skyblock Builder* generuje Wyspę Startową (Fabryczną) oraz sąsiednią Wyspę-Rynek w odległości ~150 bloków, co naturalnie zachęca do budowy pociągów Create, Chain Conveyors / Frogportów, Packagerów i Hypertubes. Normalny **Nether** (Stage 2) oraz **End** (Stage 4) odblokowywane są Żetonami Etapów.
4. **Ekonomia oparta na dobrach przetworzonych:** fizyczne sklepy NPC (*Lightman's Currency* + *Shoppers*) zasilane logistyką Create + hurtowy terminal/sklep GUI + **Żetony Etapów** (10k / 50k / 100k / 250k / 1M monet). Wysokie wypłaty wyłącznie za przetworzone dobra fabryczne (dania Farmer's Delight, słodycze, mechanizmy Create, paliwa, eksport high-tech), a nie za surowe wykopane bloki z Netheru czy Endu.
5. **Ściśle ZERO MAGII:** brak Botania, Ars Nouveau, różdżek i systemów mistycznych. Wyłącznie inżynieria mechaniczna, gastronomia przemysłowa i late-game high-tech (*Applied Energistics 2* + *Create: Applied Kinetics*, *Mekanism*).
6. **Bezpieczeństwo Mac M2 & lekkość na Exaroton:** ~95–115 modów (wraz z bibliotekami), sprawdzony stos optymalizacyjny (*Sodium*, *Lithium*, *FerriteCore*, *ModernFix*, *EntityCulling*, *AllTheLeaks*, *Spark*), całkowity zakaz niestabilnych modów fizyki/renderingu (*Valkyrien Skies*, *Clockwork*).
7. **Przyjazne QoL:** stałe `keepInventory = true`, pełny pakiet FTB (*Teams*, *Chunks*, *Essentials*, *Ultimine*, *Quests*, *XMod Compat*), *JEI*, *Jade*, *Xaero's Minimap & World Map*, *Waystones*, *Carry On*, *Mouse Tweaks*, *Sophisticated Storage & Backpacks*, *Building Gadgets 2*.

---

## Status mapy drogowej (Roadmap)

| Faza | Zakres | Status |
| :--- | :--- | :--- |
| **Faza 0** | Architektura początkowa, GDD, protokół agentów (`AGENTS.md`), szkielety KubeJS | W trakcie (PR początkowy) |
| **Faza 1** | Uzgodnienie finalnej listy modów (RFC) i decyzji ekonomicznych (RFC) | Oczekuje na review partnera |
| **Faza 2** | Inicjalizacja `packwiz`, pierwsze złożenie `.mrpack` i paczki serwerowej | Zaplanowane |
| **Faza 3** | Schematy wysp w *Skyblock Builder* (Wyspa Startowa + Wyspa-Rynek + Stacja) | Zaplanowane |
| **Faza 4** | Konfiguracja sklepów, questów *FTB Quests* oraz testy KubeJS na żywym serwerze 1.21.1 | Zaplanowane |
| **Faza 5** | Playtest wydajnościowy na Exaroton + weryfikacja na Apple Silicon Mac M2 | Zaplanowane |

---

## Instalacja (placeholder — zostanie uzupełniona po uruchomieniu `packwiz`)

> **Uwaga:** Paczka znajduje się obecnie w fazie architektury i konfiguracji. Gotowy plik `.mrpack` oraz archiwum serwerowe pojawią się w zakładce *Releases* po zamknięciu Fazy 2.

### Klient (Prism Launcher / Modrinth App)
1. Pobierz najnowszy plik `halucynacjeGTP2-x.y.z.mrpack` z GitHub Releases.
2. Zaimportuj paczkę w **Prism Launcher** lub **Modrinth App**.
3. Upewnij się, że instancja korzysta z **Java 21** (na Mac M2: natywna wersja `arm64`, np. Azul Zulu lub Eclipse Temurin) oraz alokacji **6 GB RAM** (`-Xmx6G`).
4. Użytkownicy Apple Silicon Mac M2 powinni zapoznać się z checklistą Flywheel w [docs/EXAROTON_AND_MAC_M2.md](docs/EXAROTON_AND_MAC_M2.md).

### Serwer (Exaroton)
1. Utwórz serwer na **Exaroton** z silnikiem **NeoForge 1.21.1** i **Java 21** (zalecane 6–8 GB RAM).
2. Wgraj paczkę serwerową wyeksportowaną z `packwiz` (katalogi `mods/`, `config/`, `kubejs/`, `defaultconfigs/`).
3. Zweryfikuj ustawienia `server.properties` oraz profilowanie `Spark` zgodnie z [docs/EXAROTON_AND_MAC_M2.md](docs/EXAROTON_AND_MAC_M2.md).