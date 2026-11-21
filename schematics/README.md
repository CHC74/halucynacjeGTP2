# Schematy wysp NBT (`schematics/`)

Ten katalog służy do przechowywania i dokumentowania **szablonów struktur `.nbt`** wysp używanych przez mod **Skyblock Builder** (NeoForge `1.21.1`).

> **Status (Faza 3 — UKOŃCZONA ✅):**
> Wszystkie 3 binarne pliki `.nbt` (Minecraft `1.21.1`, `DataVersion 3955`, czyste bloki waniliowe) zostały wygenerowane deterministycznie przez [scripts/generate_island_nbt.py](../scripts/generate_island_nbt.py), zweryfikowane round-trip parserem NBT oraz zakomitowane w dokładnych katalogach wymaganych przez `MelanX/SkyblockBuilder` 1.21.x (`SkyPaths.java`). Kompletny blueprint znajduje się w [docs/ISLAND_DESIGN.md](../docs/ISLAND_DESIGN.md).

---

## Docelowe pliki szablonów (zweryfikowane z `SkyPaths.java`)

```text
config/skyblockbuilder/templates/
├── islands/
│   └── starter_island.nbt      # Wyspa Startowa (15x13x15, spawn [7,7,7] -> (0,65,0) EAST, skrzynia anty-softlock + Pirs Wschodni)
└── spreads/
    ├── market_island.nbt       # Wyspa-Rynek (29x9x25, offset [152,0,0], 100% płaski plac Y=64, 8 stoisk + tylne aleje Create + 3 ATM)
    └── industrial_island.nbt   # Wyspa Przemysłowa / Huta Południowa (21x7x21, offset [0,0,152], płyta Y=64 + Dok Północny)
```

Aby ponownie wygenerować lub zweryfikować pliki `.nbt` lokalnie:
```bash
python3 scripts/generate_island_nbt.py          # regeneracja + pełna weryfikacja
python3 scripts/generate_island_nbt.py --verify # sama weryfikacja binarna
```

*(Jeśli kiedyś zechcesz nadpisać wyspy własną wersją z trybu Creative, poniższa instrukcja eksportu przez `Structure Block` nadal obowiązuje — pamiętaj tylko, by `starter_island.nbt` trafiał do `templates/islands/`!)*

---

## Instrukcja krok po kroku: budowa i eksport `.nbt` w Creative

### Krok 1: Przygotowanie świata roboczego
1. Uruchom paczkę **HalucynacjeGTP2** (NeoForge `1.21.1`) lokalnie w trybie jednoosobowym.
2. Utwórz płaski lub pusty świat (*Superflat — The Void*) w trybie **Creative** z włączonymi komendami (`Allow Commands: ON`).
3. Wyłącz dzień/noc i spawn mobów podczas budowania:
   ```mcfunction
   /gamerule doDaylightCycle false
   /gamerule doMobSpawning false
   /time set 6000
   ```

### Krok 2: Zbudowanie 3 wysp zgodnie z `docs/ISLAND_DESIGN.md`
Zbuduj każdą strukturę dokładnie według wymiarów i poziomów wysokości z [docs/ISLAND_DESIGN.md](../docs/ISLAND_DESIGN.md):

1. **`starter_island.nbt`** (`~18 × 16 × 15` bounding box, w tym Pirs Wschodni i Maszt Chain Conveyor do `Y = 72`):
   - Platforma `15 × 15` na poziomie `Y = 64` (środek wyznaczony jako punkt spawnu).
   - Dąb startowy, wnęka cobble-gen (lód/woda + lawa), opcjonalna skrzynia startowa.
   - **Pirs Wschodni** na środku wschodniej krawędzi z 2 odcinkami toru `create:track` na `Y = 65` i masztem pod `Chain Conveyor` na `Y = 72`.
   - Oświetlenie w narożnikach (poziom światła ≥ 10).

2. **`market_island.nbt`** (`33 × 14 × 27` bounding box):
   - W 100% **płaski plac** (`Y = 64`) bez schodów, półpłytek i przeszkód dla AI `Shoppers`.
   - **Stacja Kolejowa Zachodnia** z peronem na `Y = 65` (dokładnie naprzeciwko Pirsu Wschodniego z Wyspy Startowej) + wyznaczone miejsca na `Hypertube` i `Waystone`.
   - **Pawilon Centralny** z `lightmanscurrency:terminal` (podłączony do Creative Network Traders na serwerze).
   - **8 stoisk handlowych** (4 północne + 4 południowe) z **tylnym korytarzem serwisowym** (`2` bloki szerokości + rampa `Y = 68` pod logistykę Create).
   - **3 zatoki ATM** (`lightmanscurrency:atm`) w odstępie >6 bloków od siebie (`(146,64,-8)`, `(158,64,-8)`, `(152,64,+10)` względem centrum).
   - Pełna siatka oświetlenia (poziom światła ≥ 10 wszędzie).

3. **`industrial_island.nbt`** (`21 × 10 × 21` bounding box):
   - Płaska płyta przemysłowa `21 × 21` na poziomie `Y = 64` z `polished_deepslate` i `stone_bricks`.
   - **Dok Kolejowy Północny** na `Y = 65` wyrównany w osi `X = 0` do Wyspy Startowej.
   - Oświetlenie anty-spawn.

### Krok 3: Zapisanie struktur przez Structure Block (lub komendę Skyblock Builder)
Dla każdej z 3 wysp możesz użyć standardowego `minecraft:structure_block` **lub** wbudowanego narzędzia `Skyblock Builder` (`/skyblock create` / *Structure Saver*):

1. Daj sobie blok struktury:
   ```mcfunction
   /give @s minecraft:structure_block
   ```
   *(Uwaga: waniliowy `Structure Block` ma domyślny limit `48 × 48 × 48` bloków — wszystkie nasze 3 wyspy mieszczą się w tym limicie z zapasem! Największa, `market_island`, ma `33 × 14 × 27`.)*
2. Postaw `Structure Block` w narożniku `(-X, -Y, -Z)` danej wyspy i ustaw tryb **`SAVE`**.
3. Wpisz nazwę struktury:
   - `halucynacje:starter_island`
   - `halucynacje:market_island`
   - `halucynacje:industrial_island`
4. Dopasuj `Relative Position` i `Structure Size`, włącz podgląd ramki (`Show Bounding Box: ON`) i sprawdź:
   - czy **Include Entities** jest ustawione na `OFF` (nie zapisujemy zbędnych mobów ani graczy),
   - czy zapisane bloki nie ucinają liści drzewa ani masztu na `Y = 72`.
5. Kliknij **`SAVE`**. Pliki pojawią się w:
   ```text
   saves/<NazwaŚwiata>/generated/halucynacje/structures/<nazwa>.nbt
   ```

### Krok 4: Instalacja i test w `Skyblock Builder`
1. Skopiuj wyeksportowane pliki do docelowych ścieżek:
   - `starter_island.nbt` -> `config/skyblockbuilder/templates/starter_island.nbt`
   - `market_island.nbt` -> `config/skyblockbuilder/templates/spreads/market_island.nbt`
   - `industrial_island.nbt` -> `config/skyblockbuilder/templates/spreads/industrial_island.nbt`
2. Zweryfikuj punkt spawnu i przesunięcia (`offset`) w [config/skyblockbuilder/templates.json5](../config/skyblockbuilder/templates.json5) — upewnij się, że poziom powierzchni wszystkich 3 wysp ląduje dokładnie na `Y = 64`, a torowiska na `Y = 65`.
3. Utwórz nowy świat testowy z typem świata **`Skyblock`** (*Skyblock Builder*) i wykonaj checklistę odbioru:
   - [ ] Gracz spawnuje się bezpiecznie na środku Wyspy Startowej `(0, 64, 0)` z ekwipunkiem z `inventory.json5`.
   - [ ] Wyspa-Rynek jest widoczna dokładnie na wschód (`~150` bloków), a peron `(136, 65, 0)` idealnie zgrywa się w osi `Z = 0, Y = 65` z Pirsem Wschodnim.
   - [ ] Wyspa Przemysłowa jest widoczna dokładnie na południe (`~150` bloków), a dok `(0, 65, 141)` zgrywa się w osi `X = 0, Y = 65`.
   - [ ] Po wejściu do Netheru (z odblokowanym Stage 2) i Endu (z odblokowanym Stage 4) oba wymiary generują się jako **normalne, pełne światy waniliowe** (nie pustka!).
   - [ ] Na Wyspie-Rynku po zmroku nie pojawiają się żadne hostile moby, a NPC `Shoppers` swobodnie docierają do wszystkich 8 stoisk i 3 bankomatów ATM.
