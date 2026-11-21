# Szybki start (5 minut) — Klient + Serwer Exaroton (`HalucynacjeGTP2`)

Ten poradnik pozwala postawić gotowy serwer **HalucynacjeGTP2** (NeoForge `1.21.1` / `21.1.267`, Create `6.0.10`) na **Exaroton** i dołączyć z **Windows / Linux / Apple Silicon Mac M2** w kilka minut — bez ręcznego szukania modów i bez ręcznego eksportu wysp!

> **Skąd pobrać gotowe paczki?**
> Przejdź do zakładki **[Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** w repozytorium `CHC74/halucynacjeGTP2` i pobierz pliki z najnowszego wydania (np. `v1.0.1-playtest`):
> - **`halucynacjeGTP2-curseforge.zip`** ⭐ *(Główna paczka dla graczy — **CurseForge App**)* — natywny pakiet CurseForge (**65/65 modów**: 15 pobieranych natywnie z CurseForge + 50 zweryfikowanych JAR-ów Modrinth w `overrides/mods/` + `config/` + 3 wyspy `.nbt` + `kubejs/`).
> - **`halucynacjeGTP2-server-exaroton.zip`** — gotowy pakiet serwerowy pod Exaroton (**55/55 modów `.jar`** ze zweryfikowanymi sumami kontrolnymi, odfiltrowane 10 modów klienckich + `config/` + 3 wyspy `.nbt` + `kubejs/` + `server.properties`).
> - **`halucynacjeGTP2.mrpack`** *(Opcja B — Prism Launcher / Modrinth App)* — ten sam zestaw 65 modów + `overrides/` w formacie Modrinth.

---

## Krok 1 — Klient gry (PC Windows/Linux oraz Apple Silicon Mac M2)

### Opcja A (Główna): CurseForge App (`halucynacjeGTP2-curseforge.zip`)

1. Pobierz plik **`halucynacjeGTP2-curseforge.zip`** z GitHub Releases *(nie rozpakowuj go ręcznie!)*.
2. Otwórz **CurseForge App** → zakładka **Minecraft** → kliknij **Create Custom Profile** → link **Import** (u góry okna tworzenia profilu) → wskaż pobrany plik `halucynacjeGTP2-curseforge.zip`.
   - CurseForge App automatycznie zainstaluje NeoForge `21.1.267` (MC `1.21.1`), pobierze 15 natywnych modów CurseForge z `manifest.json` oraz skopiuje pozostałe 50 zweryfikowanych JAR-ów z `overrides/mods/` wraz z `config/` i `kubejs/`.
3. Po imporcie kliknij ikonę trzech kropek (`⋮`) przy profilu **HalucynacjeGTP2** → **Profile Options**:
   - Odznacz *Use System Memory Settings* i ustaw suwak RAM na **6144 MB (6 GB RAM)**.
   - *(Tylko **Apple Silicon Mac M2**)*: w ustawieniach Minecraft w CurseForge App (`Settings → Game Specific → Minecraft → Java Version`) upewnij się, że używana jest **natywna Java 21 ARM64 (`arm64` / Apple Silicon)**, a nie x86_64 przez Rosettę!
4. *(Tylko Apple Silicon Mac M2 — OpenGL 4.1)*: jeśli po wejściu do gry zauważysz artefakty na kołach zębatych Create, wpisz w grze:
   ```mcfunction
   /flywheel backend instancing
   ```
   *(lub `/flywheel backend off` jako tryb awaryjny — szczegóły w [EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md)).*
5. Kliknij **Play** — gotowe!

### Opcja B (Alternatywna): Prism Launcher / Modrinth App (`halucynacjeGTP2.mrpack`)

1. Pobierz plik **`halucynacjeGTP2.mrpack`** z GitHub Releases.
2. Otwórz **[Prism Launcher](https://prismlauncher.org/)** (lub Modrinth App) → **Add Instance** → **Import** → wskaż pobrany plik `halucynacjeGTP2.mrpack` (albo przeciągnij go w okno launchera).
3. W **Edit → Settings** ustaw **Java 21** (na Mac M2 natywna wersja `arm64`) oraz **Memory (RAM)**: Minimum `4096 MiB`, Maximum `6144 MiB` (**6 GB RAM**).
4. Kliknij **Launch** — gotowe!

---

## Krok 2 — Serwer na Exaroton (gotowy w 3 minuty)

1. Zaloguj się na **[exaroton.com](https://exaroton.com/)** i utwórz nowy serwer.
2. Zakładka **Software**:
   - Wybierz **NeoForge** → wersja Minecraft **`1.21.1`** → build **`21.1.267`** (lub najnowszy kompatybilny 1.21.1).
3. Zakładka **Options**:
   - **RAM:** ustaw **6 GB** (dla 2–3 graczy) lub **8 GB** (zalecane przy dużych fabrykach Create + AE2 + Mekanism).
   - **Allow Flight (`allow-flight`):** **`ON`** (krytyczne dla Create Hypertubes / Jetpacków / wind!).
   - **Difficulty:** `Normal`, **Gamemode:** `Survival`, **Spawn Protection:** `0`.
   - **View Distance:** `8`, **Simulation Distance:** `6`.
4. Rozpakuj na swoim komputerze pobrane archiwum **`halucynacjeGTP2-server-exaroton.zip`**. W środku znajdziesz:
   - `mods/` — komplet **55/55 plików `.jar`** (10 modów czysto klienckich jak *Sodium*, *EntityCulling*, *Xaero's* jest już odfiltrowanych!).
   - `config/` — wszystkie konfiguracje (w tym zweryfikowany *Skyblock Builder* 1.21.1 z 3 gotowymi binarnymi wyspami `.nbt`, *FTB Quests*, *FTB Chunks*, *Carry On*, `prices.json`, *Shoppers*).
   - `kubejs/` — skrypty Żetonów Etapów, blokad Netheru/Endu, receptur pure-Create, ekonomii i polskie tłumaczenia.
   - `server.properties` — referencyjna konfiguracja serwera.
5. Zakładka **Files** na Exaroton:
   - Prześlij (upload) foldery **`mods/`**, **`config/`** oraz **`kubejs/`** do głównego katalogu serwera (możesz przeciągnąć spakowane podfoldery lub wgrać je przez menedżer plików Exaroton).
6. Zakładka **Worlds** → kliknij **Generate** (nowy świat):
   - W polu **Worldtype** wpisz dokładnie:
     ```text
     skyblockbuilder:skyblock
     ```
   - Zatwierdź generowanie świata.
   - *(Dlaczego to działa idealnie? Plik `config/skyblockbuilder/dimensions.json5` ustawia pustkę z 3 wyspami WYŁĄCZNIE dla Overworldu, a **Nether i End pozostają w 100% normalnymi wymiarami waniliowymi**!)*
7. Kliknij **Start** i poczekaj na pierwsze uruchomienie!

---

## Krok 3 — Pierwsze wejście i konfiguracja w grze (1 minuta)

1. Połącz się z serwerem (adres z panelu Exaroton).
2. Wylądujesz na **Wyspie Startowej `(0, 65, 0)`**, patrząc prosto na **Wschód** (wzdłuż Pirsu Wschodniego) w stronę **Wyspy-Rynku `(+152E)`**!
   - W ekwipunku dostaniesz od razu księgę **FTB Quests**, chleb, pochodnie i sadzonki.
   - Obok Ciebie stoi **skrzynia startowa anty-softlock** (wiadro lawy, 2× lód, sadzonki, jagody, trzcina cukrowa, kaktus, wodorosty, nasiona, mączka kostna, bruk) oraz gotowa bezpieczna niecka pod generator bruku.
   - `keepInventory = true` jest włączone permanentnie przez skrypt KubeJS.
3. Jeśli gracie wspólnie jako jedna drużyna, użyjcie `/skyblock` (lub `/ftbteams party create`) do zaproszenia znajomych na wspólną wyspę.
4. *(Jednorazowo jako Operator / OP po ustawieniu sklepów na Wyspie-Rynku)* — wpisz komendę synchronizującą ceny i reguły dla NPC `Shoppers`:
   ```mcfunction
   /halucynacje_apply_shoppers
   ```
5. Pełna lista komend ekonomii (`/rynek`, `/sklep`, `/etap`) znajduje się w [ECONOMY_GUIDE.md](ECONOMY_GUIDE.md), a szczegółowa checklista testów przed dłuższą kampanią w [PLAYTEST_CHECKLIST.md](PLAYTEST_CHECKLIST.md).
