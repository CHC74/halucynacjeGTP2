# AGENTS.md — Protokół współpracy wieloagentowej (`CHC74/halucynacjeGTP2`)

Ten dokument definiuje zasady współpracy pomiędzy dwoma autonomicznymi agentami AI rozwijającymi modpack **HalucynacjeGTP2** (Create Skyblock Tycoon, NeoForge 1.21.1):
- **`agent:antigravity`** — architekt paczki po stronie pierwszego współzałożyciela.
- **`agent:partner`** — partnerski agent AI po stronie drugiego współzałożyciela.

Celem tego protokołu jest bezkonfliktowa, asynchroniczna praca w jednym repozytorium GitHub, pełna przejrzystość decyzji projektowych (RFC) oraz spójność z nienegocjowalnymi wymaganiami serwera.

---

## 1. Rytuał synchronizacji na początku każdej sesji

Zanim zaczniesz pisać kod lub dokumentację, **zawsze** wykonaj synchronizację stanu repozytorium i tablicy GitHub:

```bash
git fetch origin
git status
gh issue list -R CHC74/halucynacjeGTP2 --state open
gh pr list -R CHC74/halucynacjeGTP2 --state open
```

1. Przeczytaj ostatnie komentarze pod otwartymi RFC i PR-ami partnera.
2. Sprawdź, które zadania mają już etykietę `status:in-progress`, aby nie dublować pracy ani nie edytować tych samych plików równolegle.
3. Nową gałąź zawsze tworz z aktualnego `origin/main`.

---

## 2. Jak przejmować zadania (Claiming Protocol)

Aby uniknąć konfliktów merge na plikach (zwłaszcza w `docs/`, `kubejs/` i przyszłym `packwiz/`):

1. Wybierz otwarte Issue bez etykiety `status:in-progress`.
2. Dodaj swoją etykietę agenta (`agent:antigravity` lub `agent:partner`) oraz `status:in-progress`:
   ```bash
   gh issue edit <NR> -R CHC74/halucynacjeGTP2 --add-label "agent:partner,status:in-progress"
   ```
3. Zostaw **komentarz claimujący** pod Issue, podając dokładnie:
   - nazwę tworzonej gałęzi (np. `feat/packwiz-init`),
   - **listę plików docelowych**, które zamierzasz utworzyć lub zmodyfikować,
   - szacowany zakres zmian i ewentualne pytania otwarte.
4. Jeśli musisz zmodyfikować plik zadeklarowany już przez drugiego agenta w innym otwartym zadaniu, najpierw skomentuj jego Issue/PR lub poczekaj na merge.

---

## 3. Konwencje gałęzi, commitów i Pull Requestów

### Gałęzie
**Nigdy nie pushuj bezpośrednio na `main`.** Każda zmiana trafia na dedykowaną gałąź roboczą i przechodzi przez Pull Request:
- `feat/<krótki-opis>` — nowe funkcje, skrypty KubeJS, konfiguracje, struktury wysp, dokumenty architektoniczne
- `balance/<krótki-opis>` — strojenie cen sklepu, progów Żetonów Etapów, receptur Create
- `fix/<krótki-opis>` — poprawki błędów, kompatybilności modów, problemów Mac M2 / Exaroton
- `docs/<krótki-opis>` — wyłącznie aktualizacje dokumentacji

### Walidacja przed commitem i pushem
Przed każdym `git push` autor PR ma obowiązek uruchomić i zaraportować:
1. Składnię wszystkich skryptów KubeJS:
   ```bash
   for f in kubejs/*/*.js; do node --check "$f"; done
   ```
2. Weryfikację względnych linków Markdown (brak martwych odnośników między `README.md`, `AGENTS.md` i `docs/*.md`).
3. Przegląd `git status` i `git diff --stat` (brak plików tymczasowych, logów ani sekretów).

### Review Checklist dla agenta partnerskiego (na każdym PR)
Podczas przeglądu PR drugiego agenta sprawdź:
- [ ] Czy zmiana szanuje wszystkie **nienegocjowalne zasady projektu** (sekcja 5 poniżej)?
- [ ] Czy nie dodano żadnego moda magicznego ani niestabilnego na Apple Silicon Mac M2 (np. *Valkyrien Skies*, *Clockwork*)?
- [ ] Czy nie wprowadzono *Ex Deorum* / *Ex Nihilo* ani exploitu ekonomicznego (wysokie ceny za surowe bloki z Netheru/Endu)?
- [ ] Czy liczba modów mieści się w budżecie Exaroton (~95–115 modów z bibliotekami)?
- [ ] Czy wszystkie pliki `.js` w `kubejs/` przechodzą `node --check` i mają oznaczone ewentualne punkty do weryfikacji na żywym serwerze 1.21.1?
- [ ] Czy dokumentacja po polsku jest aktualna, z poprawnymi angielskimi identyfikatorami modów i itemów?

Po zakończeniu prac nad PR dodaj etykietę `status:needs-review` (oraz zdejmij `status:in-progress` z powiązanego Issue po merge).

---

## 4. Taksonomia etykiet GitHub

| Etykieta | Kolor | Znaczenie |
| :--- | :--- | :--- |
| `agent:antigravity` | `#0e8a16` | Zadanie przejęte lub zaproponowane przez agenta Antigravity |
| `agent:partner` | `#1d76db` | Zadanie przejęte lub zaproponowane przez agenta partnerskiego |
| `rfc` | `#d876e3` | Request for Comments — decyzja architektoniczna wymagająca konsensusu obu stron |
| `status:in-progress` | `#fbca04` | Prace aktualnie trwają (plik/zakres zarezerwowany) |
| `status:needs-review` | `#f9d0c4` | Gotowe do przeglądu (review) przez drugiego agenta |
| `area:mods` | `#5319e7` | Lista modów, kompatybilność wersji, zależności |
| `area:economy` | `#006b75` | Sklepy, waluta, Żetony Etapów, cennik towarów |
| `area:world` | `#c2e0c6` | Wyspy *Skyblock Builder*, wymiary, generacja świata |
| `area:kubejs` | `#bfd4f2` | Skrypty KubeJS, receptury, gating wymiarów i etapów |
| `area:devops` | `#e99695` | `packwiz`, Exaroton, eksport `.mrpack`, CI/CD, konfiguracja Mac M2 |
| `mac-m2-check` | `#d93f0b` | Wymaga weryfikacji stabilności/wydajności na Apple Silicon Mac M2 |

---

## 5. Nienegocjowalne zasady projektu (Guardrails)

Żaden PR ani RFC nie może naruszać poniższych założeń bez wyraźnej, wspólnej zgody obu współzałożycieli:

1. **Silnik i wersja:** Minecraft `1.21.1`, **NeoForge**, **Create 6.x**.
2. **Hosting Exaroton:** docelowo 6–8 GB RAM, paczka zwarta i zoptymalizowana (**~95–115 modów** z bibliotekami), eksportowalna przez `packwiz` do `.mrpack` i paczki serwerowej.
3. **Bezpieczeństwo Mac M2 (Apple Silicon, macOS arm64, OpenGL 4.1):**
   - Zakaz niestabilnych modów fizyki i renderowania (*Valkyrien Skies*, *Clockwork*).
   - Obowiązkowy stos wydajnościowy: *Sodium*, *Lithium*, *FerriteCore*, *ModernFix*, *EntityCulling*, *AllTheLeaks*, *Spark*, *Clumps*.
   - Dokumentacja ustawień Flywheel pod OpenGL 4.1.
4. **Motyw Pure-Create Skyblock Tycoon:**
   - **Zero *Ex Deorum* / *Ex Nihilo*** (brak ręcznego przesiewania).
   - Wielo-wyspowy Overworld (*Skyblock Builder*: Wyspa Startowa + Wyspa-Rynek w odległości ~150 bloków pod pociągi, Chain Conveyors / Frogporty, Packagery, Hypertubes).
   - Normalny Nether (Stage 2) i normalny End (Stage 4) odblokowywane Żetonami Etapów.
5. **Ochrona ekonomii:**
   - Progi Żetonów Etapów: `10k / 50k / 100k / 250k / 1M` monet (soft gating).
   - Wysokie ceny skupu **wyłącznie za przetworzone dobra fabryczne** (posiłki Farmer's Delight, słodycze, mechanizmy Create, tory, paliwa, eksport AE2/Mekanism). Surowe bloki kopane w Netherze/Endzie nie mogą psuć balansu.
6. **Ściśle ZERO MAGII:** brak *Botania*, *Ars Nouveau*, *Iron's Spells*, *Occultism*, różdżek i mechanik magicznych.
7. **QoL i komfort gry:** stałe `keepInventory = true`, pakiet FTB (*Teams*, *Chunks*, *Essentials*, *Ultimine*, *Quests*, *XMod Compat*), *JEI*, *Jade*, *Xaero's Minimap & World Map*, *Mouse Tweaks*, *Carry On*, *Waystones*, *Sophisticated Storage & Backpacks*, *Building Gadgets 2*. Brak modów głosowych (komunikacja przez Discord) i brak modów na nagrobki (zbędne przy `keepInventory = true`).

---

## 6. Mapa katalogów repozytorium

```text
halucynacjeGTP2/
├── README.md                              # Przegląd projektu, linki, roadmapa, instrukcja startowa
├── AGENTS.md                              # Ten dokument — protokół współpracy agentów AI
├── docs/
│   ├── VISION.md                          # Game Design Document (pętla, wyspy, ochrona ekonomii, QoL)
│   ├── MODLIST.md                         # Kuratorowana lista modów (8 tabel + wykluczenia)
│   ├── PROGRESSION_AND_ECONOMY.md         # Etapy 0-5, cennik fabryczny, surowce pure-Create
│   └── EXAROTON_AND_MAC_M2.md             # Poradnik serwera Exaroton i klienta Apple Silicon Mac M2
├── kubejs/
│   ├── startup_scripts/
│   │   └── stage_tokens.js                # Definicje przedmiotów Stage Token (1..5)
│   └── server_scripts/
│       ├── dimension_gating.js            # Realizacja żetonów, blokady Nether/End, keepInventory
│       └── skyblock_create_recipes.js     # Receptury pure-Create dla surowców Skyblocka
├── packwiz/                               # [PLANOWANE - Faza 2] Definicje modów i eksport .mrpack
├── config/                                # [PLANOWANE - Faza 3-4] Konfiguracje modów (Skyblock Builder, FTB, sklepy)
└── schematics/                            # [PLANOWANE - Faza 3] Szablony NBT wysp (Startowa, Rynek, Stacja)
```
