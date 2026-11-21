# EXAROTON_AND_MAC_M2.md — Poradnik hostingu Exaroton i klienta Apple Silicon Mac M2

Ten dokument zbiera konkretne wymagania operacyjne i konfiguracje wydajnościowe dla dwóch filarów technicznych projektu:
1. **Serwer:** hosting **Exaroton** (6–8 GB RAM, NeoForge 1.21.1, Java 21).
2. **Klient:** pełna stabilność na **Apple Silicon Mac M2** (macOS `arm64`, ograniczenie do **OpenGL 4.1**).

---

## 1. Konfiguracja serwera Exaroton (6–8 GB RAM)

### Parametry bazowe instancji
- **Silnik:** `NeoForge` dla **Minecraft 1.21.1** (wersja zgodna z plikiem `packwiz/pack.toml` po Fazie 2).
- **Środowisko uruchomieniowe:** **Java 21**.
- **Alokacja RAM:** **6 GB** na start (Stage 0–2) z opcją podbicia do **8 GB** w late-game (Stage 4–5, gdy działają sieci AE2 + Mekanism + pociągi między wymiarami).
- **Budżet modów:** ~95–115 modów (w tym biblioteki). Nie wrzucać modów czysto klienckich (*Sodium*, *EntityCulling*, *Xaero's Minimap*, *Xaero's World Map*, *Mouse Tweaks*, *Controlling*, *Configured*) do katalogu `mods/` na serwerze — `packwiz` odfiltruje je automatycznie przy eksporcie serwerowym.

### Zalecane ustawienia `server.properties` i gamerule
```properties
# Podstawy pod Skyblock Builder (dokładny level-type potwierdzić po konfiguracji modu)
level-type=skyblockbuilder\:skyblock
allow-flight=true
max-tick-time=120000
view-distance=10
simulation-distance=8
sync-chunk-writes=false
```

- **`allow-flight=true`:** obowiązkowe z uwagi na *Create: Stuff 'N Additions* (jetpacki), *Hypertubes* oraz przejazdy pociągami nad pustką.
- **`keepInventory = true`:** wymuszane automatycznie przy każdym starcie serwera przez [kubejs/server_scripts/dimension_gating.js](../kubejs/server_scripts/dimension_gating.js) (dodatkowo można potwierdzić w konsoli Exaroton komendą `/gamerule keepInventory true`).
- **Limity *FTB Chunks*:** ustawić limit force-loaded chunks na rozsądne **16–25 chunków na drużynę**, aby 2–4 graczy nie utrzymywało w pamięci setek aktywnych maszyn jednocześnie.

### Wdrażanie z `packwiz` (docelowy workflow po Fazie 2)
1. W katalogu `packwiz/` zaktualizować mody i wykonać eksport paczki serwerowej (lub zsynchronizować przez `packwiz-installer-bootstrap.jar` / spakowany zip zawierający `mods/`, `config/`, `kubejs/`, `defaultconfigs/`).
2. Wyłączyć serwer na Exaroton przed podmianą katalogów `mods/` i `kubejs/`.
3. Po starcie sprawdzić logi pod kątem błędów KubeJS (`logs/kubejs/server.log`, `logs/kubejs/startup.log`).

### Diagnostyka wydajności za pomocą `Spark`
Gdy serwer spadnie poniżej 19.5 TPS lub MSPT przekroczy 35 ms, wykonaj w konsoli lub w grze (jako OP):

```text
/spark tps
/spark health --memory
/spark profiler start --timeout 60
```

Po 60 sekundach otwórz wygenerowany link profilera i sprawdź:
- Czy jakaś farma nie wyrzuca setek przedmiotów na ziemię (dodaj *Funnel* / *Chute* / *Sophisticated Storage* z void upgrade).
- Czy NPC *Shoppers* na Wyspie-Rynku nie blokują się na ścieżkowaniu (zmniejsz limit aktywnych NPC w configu *Shoppers* i zapewnij płaskie ścieżki na Rynku).
- Czy rury *Mekanism* nie tworzą pętli przeliczania sieci energetycznej/płynów.

---

## 2. Checklista klienta — Apple Silicon Mac M2 (macOS arm64, OpenGL 4.1)

macOS na układach Apple Silicon (M1/M2/M3) obsługuje maksymalnie **OpenGL 4.1**, co powoduje błędy w modach polegających na zaawansowanych rozszerzeniach OpenGL (dlatego wykluczyliśmy *Valkyrien Skies* i *Clockwork*). Poniższa checklista gwarantuje wysokie FPS i brak crashy w Create 6:

### Krok 1: Natywny launcher `arm64`
- Używaj **Prism Launcher** (zalecany — najlepsza kontrola Javy i importu `.mrpack`) lub **Modrinth App** w natywnej wersji **Apple Silicon (`arm64`)**.
- **Unikaj** uruchamiania launchera ani Javy przez **Rosetta 2 (`x86_64`)** — drastycznie obniża to FPS i podnosi zużycie RAM.

### Krok 2: Natywna Java 21 `arm64`
- Zainstaluj **Java 21 (ARM 64-bit)** — zalecane dystrybucje:
  - **Azul Zulu JDK 21 (macOS ARM 64-bit)** *(często najlepiej sprawdza się na Apple Silicon)*, lub
  - **Eclipse Temurin JDK 21 (macOS aarch64)**.
- W Prism Launcher ustaw tę konkretną ścieżkę Javy dla instancji `halucynacjeGTP2`.

### Krok 3: Pamięć RAM i argumenty JVM
- Ustaw **Minimum: `4096 MB`**, **Maksimum: `6144 MB`** (`-Xms4G -Xmx6G`).
- Nie przekraczaj `8192 MB` na Macu z 16 GB zunifikowanej pamięci (zbyt duży heap wydłuża pauzy GC i zabiera pamięć systemowi/GPU).
- Zalecany Garbage Collector dla Java 21: standardowy **G1GC** (`-XX:+UseG1GC`) — stabilny i przewidywalny bez agresywnego strojenia.

### Krok 4: Rozwiązywanie problemów z **Flywheel** (Create 6) na OpenGL 4.1
Create 6 korzysta z silnika renderowania **Flywheel** do szybkiego rysowania kół zębatych, wałów i kontrapcji. Na macOS OpenGL 4.1:
1. Domyślnie Flywheel powinien wybrać tryb zgodny z OpenGL 4.1 (**instancing**).
2. Jeśli zauważysz migotanie kół zębatych, czarne kontrapcje, artefakty graficzne albo crash przy wchodzeniu do hali fabrycznej, wpisz w grze:
   ```text
   /flywheel backend flywheel:instancing
   ```
   A w przypadku dalszych problemów z OpenGL 4.1 na macOS (bezpieczny fallback):
   ```text
   /flywheel backend flywheel:off
   ```
   *(Uwaga: w Create 6 dokładne nazwy backendów można sprawdzić przez autouzupełnianie Tab po `/flywheel backend ` — np. `instancing`, `indirect` [zwykle niewspierany na macOS OpenGL 4.1], `off`).*
3. Jeśli problem występuje przy włączonym *Sodium*, upewnij się, że nie są włączone żadne niekompatybilne shadery.

### Krok 5: Ostrożność z shaderami (*Iris* + *Create*)
- Paczka **celowo nie wymusza shaderów** w domyślnym profilu.
- Na Apple Silicon Mac M2 shadery w połączeniu z rozbudowaną fabryką Create 6 potrafią obniżyć FPS o 60–80% oraz psuć renderowanie kontrapcji Flywheel.
- Jeśli chcesz testować shadery opcjonalnie na własną rękę, używaj wyłącznie lekkich pakietów (np. *Complementary* na profilu *Potato/Low* lub *MakeUp - Ultra Fast*) i miej w pogotowiu `/flywheel backend flywheel:off`.
