# Szybki start (5 minut) — Klient + Serwer Exaroton (`HalucynacjeGTP2`)

Ten poradnik pozwala postawić gotowy serwer **HalucynacjeGTP2** (NeoForge `1.21.1` / `21.1.267`, Create `6.0.10`) na **Exaroton** i dołączyć z **Windows / Linux / Apple Silicon Mac M2** w kilka minut — bez ręcznego szukania modów i bez ręcznego eksportu wysp!

> **Skąd pobrać gotowe paczki?**
> Przejdź do zakładki **[Releases](https://github.com/CHC74/halucynacjeGTP2/releases)** w repozytorium `CHC74/halucynacjeGTP2` i pobierz dwa pliki z najnowszego wydania (np. `v1.0.0-playtest`):
> - **`halucynacjeGTP2.mrpack`** — gotowy pakiet dla graczy (**65 modów** + `config/` + 3 wyspy `.nbt` + `kubejs/`).
> - **`halucynacjeGTP2-server-exaroton.zip`** — gotowy pakiet serwerowy pod Exaroton (**55/55 modów `.jar`** ze zweryfikowanymi sumami kontrolnymi, odfiltrowane 10 modów klienckich + `config/` + 3 wyspy `.nbt` + `kubejs/` + `server.properties`).

---

## Krok 1 — Klient gry (PC Windows/Linux oraz Apple Silicon Mac M2)

> **Rekomendacja:** Użyj **[Prism Launcher](https://prismlauncher.org/)** (darmowy, open-source, natywny dla macOS `arm64` i Windows). **Prism Launcher jest NAJLEPSZYM wyborem**, ponieważ w **1 kliknięciu** bezproblemowo instaluje zarówno 50 modów z Modrinth, jak i 15 modów FTB/JEI z CurseForge zawartych w `halucynacjeGTP2.mrpack`!

1. Pobierz plik **`halucynacjeGTP2.mrpack`** z GitHub Releases.
2. Otwórz **Prism Launcher** → kliknij **Add Instance** → zakładka **Import** → wskaż pobrany plik `halucynacjeGTP2.mrpack` (albo po prostu przeciągnij plik w okno launchera).
3. Kliknij prawym na utworzoną instancję → **Edit** → **Settings**:
   - **Java:** wybierz **Java 21** (na **Mac M2** koniecznie natywna wersja **`arm64`**, np. Azul Zulu 21 ARM64 lub Eclipse Temurin 21 ARM64 — Prism może pobrać ją automatycznie przyciskiem *Download Java*).
   - **Memory (RAM):** ustaw Minimum `4096 MiB`, Maximum `6144 MiB` (**6 GB RAM**).
4. *(Tylko Apple Silicon Mac M2 — OpenGL 4.1)*: jeśli po wejściu do gry zauważysz artefakty na kołach zębatych Create, wpisz w grze:
   ```mcfunction
   /flywheel backend instancing
   ```
   *(lub `/flywheel backend off` jako tryb awaryjny — szczegóły w [EXAROTON_AND_MAC_M2.md](EXAROTON_AND_MAC_M2.md)).*
5. Kliknij **Launch** — gotowe!

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
