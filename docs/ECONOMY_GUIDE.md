# ECONOMY_GUIDE.md — Podręcznik Ekonomii i Handlu (Gracz + Admin)

Ten dokument opisuje, jak w praktyce działa jednowalutowa ekonomia **HalucynacjeGTP2** oparta na **`Lightman's Currency`** + **`Shoppers`** + wspólnym źródle prawdy [config/halucynacje_economy/prices.json](../config/halucynacje_economy/prices.json).

---

## 1. Jedna spójna waluta (*Lightman's Currency*)

Cała ekonomia serwera korzysta z 6 fizycznych nominałów monet (przelicznik dziesiętny `×10`):

| Moneta (ID) | Wartość bazowa | Rola w progresji |
| :--- | ---: | :--- |
| `lightmanscurrency:coin_copper` | `1` moneta | Reszta i podstawowe wypieki Tier 1 |
| `lightmanscurrency:coin_iron` | `10` monet | Wczesna kuchnia (Stage 0–1) |
| `lightmanscurrency:coin_gold` | `100` monet | Dania *Farmer's Delight* / *Create: Food* (Stage 1–2) |
| `lightmanscurrency:coin_emerald` | `1 000` monet | Słodycze premium i przemysł Create (Stage 2–4) |
| `lightmanscurrency:coin_diamond` | `10 000` monet | Żetony Etapów (`stage_1` = 1 diamentowa!) i eksport AE2/Mekanism |
| `lightmanscurrency:coin_netherite` | `100 000` monet | High-tech late-game (`stage_5` = 10 netherytowych!) |

> **Wspólne konto drużyny (Team Bank Account):** Korzystajcie z 3 bankomatów **ATM** na Wyspie-Rynku (`(146,64,-8)`, `(158,64,-8)`, `(152,64,+10)`) oraz portfeli *Lightman's Currency* (od żelaznego portfela monety automatycznie zamieniają się w wyższe nominały!).

---

## 2. Trzy kanały zbytu (dlaczego opłaca się budować zróżnicowane fabryki i logistykę?)

| Kanał sprzedaży | Marża | Jak działa | Kiedy używać |
| :--- | :--- | :--- | :--- |
| **Dynamiczne Kontrakty Fabryczne (`/kontrakt`)** | **+35% do +55% (+25% co 5. z rzędu!)** | System losuje celowane zlecenie eksportowe dopasowane do Waszego aktualnego Etapu (Stage 0–5) prosto z [prices.json](../config/halucynacje_economy/prices.json). Oddawanie (`/kontrakt oddaj`) odbywa się na **Wyspie-Rynku `(152, 64, 0)`**. Każdy kolejny kontrakt z rzędu bez rerollu zwiększa premię o `+5%` (do `+55%`), a co 5. kontrakt wypłaca dodatkową premię kamienia milowego `+25%`! | Najwyższa rentowność w grze — motywuje do automatyzacji różnych linii produkcyjnych i dostaw na Rynek! |
| **Fizyczne sklepy NPC na Wyspie-Rynku** (*Lightman's Currency* + *Shoppers*) | **+20% wyższa cena!** | Pociągi Create / Chain Conveyors + Frogporty dowożą towary na tylne korytarze 8 stoisk na Wyspie-Rynku `(152, 64, 0)`. Klienci NPC (`maxShoppers = 10`, bezpieczny promień `4–12` bloków + `VirtualShoppingSimulator` w tle!) kupują towary, a pieniądze trafiają na Wasze **Team Bank Account**. | Główny pasywny silnik zarobku w Stage 1–5 — stały przychód i żywy rynek! |
| **Automatyczny Dok Eksportowy (`/rynek_eksport`)** | **105% (+5% logistyka + Boom/Różnorodność/Etap, limit +25% / +45% z Boomem)** | Podłącz pociąg Create, Chain Conveyor + Frogport lub lejek do skrzyni / beczki / `Create: Item Vault` na **Wyspie-Rynku** i wpisz `/rynek_eksport dodaj` (limit: 4 doki na starcie, do 8 na Stage 5). Co 30 sekund serwer sam sprzedaje przetworzone towary Tier 1–5 z premią **`+5%`** i przelewa środki prosto na Wasze **Team Bank Account**! | W pełni bezobsługowy, pasywny eksport całych linii produkcyjnych! |
| **Rynek Hurtowy (`/sprzedaj` / `/sprzedaj all`)** | **100% na Rynku (+ premie do +45%) / sztywne 85% zdalnie** | Natychmiastowa sprzedaż z ekwipunku za fizyczne monety *Lightman's Currency*. Sprzedaż poza Wyspą-Rynkiem płaci **sztywne `85%`** (`-15%` opłaty kurierskiej, **bez premii dynamicznych**, zawsze poniżej cen NPC `+20%`!). Na Wyspie-Rynku co **20 minut** losowany jest **Boom Rynkowy (`+30%`)** (`/boom`), a **3 / 5 / 7 różnych towarów** (każdy za min. `250` monet bazowo w oknie 30 min) daje **Premię za Różnorodność (`+5% / +10% / +15%`)** — przy twardym limicie łącznych premii `+25%` bez Boomu i `+45%` (`×1,45`) z Boomem! | Szybki start w Stage 0 i ręczne polowanie na gorące ceny giełdowe na Wyspie-Rynku. |

---

## 3. Komendy ekonomiczne dla graczy

Komendy rynku i zakupów obsługuje [kubejs/server_scripts/economy_market.js](../kubejs/server_scripts/economy_market.js), a system dynamicznych zleceń — [kubejs/server_scripts/economy_contracts.js](../kubejs/server_scripts/economy_contracts.js):

- **`/ekonomia`** — Twój panel Tycoona: aktualny Etap drużyny, łączne saldo LC (identyczne z TAB: EQ + Portfel + Bank), obrót hurtowy, aktywny **Boom Rynkowy**, **Premia za Różnorodność** oraz ile monet brakuje do kolejnego Żetonu Etapu.
- **`/ekonomia top`** — ranking Tycoona: postęp do kolejnego kamienia milowego (`10k / 50k / 100k / 250k / 500k / 1M` — każdy próg ogłaszany jest na czacie serwera!), **TOP 5 eksportowanych produktów** oraz **ranking eksporterów** (gracze + Automatyczne Doki).
- **`/boom`** (alias `/gielda`) — pokazuje aktualny **Boom Rynkowy (+30% ceny na Wyspie-Rynku)** na najbliższe 20 min, aktualną **Premię za Różnorodność Fabryki** (`+5% / +10% / +15%`, min. `250` monet bazowo/towar w oknie 30 min) oraz aktywne limity premii (`+25%` bez Boomu / `+45%` z Boomem).
- **`/rynek_eksport dodaj` / `lista` / `usun [nr]` / `odbierz`** — rejestruje kontener (skrzynię, beczkę lub `Create: Item Vault`) na **Wyspie-Rynku** jako **Automatyczny Dok Eksportowy (`105%` + Boom + Różnorodność + Etap, limit `+45%`)** zasilany pociągiem Create lub Chain Conveyorem!
- **`/cennik [1-5]`** — tabela skupu hurtowego i docelowej ceny NPC `+20%` dla wybranego Tieru (1–5).
- **`/sprzedaj`** — sprzedaje stack z głównej ręki (`100%` + premie na Wyspie-Rynku, sztywne `85%` poza nią bez premii) i wypłaca monety *Lightman's Currency*.
- **`/sprzedaj all`** — sprzedaje hurtem wszystkie przetworzone towary Tier 1–5 z ekwipunku jednym kliknięciem.
- **`/sklep`** (lub PPM na bloku `Trading Terminal` na Wyspie-Rynku — zalecamy `/sklep`, bo obsługuje przycisk **„Back to Network Terminal”**) — otwiera **prawdziwe, graficzne GUI Sklepu Sieciowego** (*Lightman's Currency*) zasilane z [config/lightmanscurrency/PersistentTraders.json](../config/lightmanscurrency/PersistentTraders.json) (**14 sklepów, 450 ofert**):
  - **`[KUP] 1. Żetony Etapów`** (`kubejs:stage_1..5_token` za `10k/50k/100k/250k/1M` — czysto survivalowo, bez przedmiotów kreatywnych!),
  - **`[KUP] 2. Rośliny i Sadzonki`** (30 pozycji: wszystkie 8 drzew, nasiona Vanilla i FD, grzyby, kakao, jagody),
  - **`[KUP] 3. Zwierzęta i Hodowla`** (14 pozycji: zwierzęta farmowe, pszczoły/ule, ryby, kałamarnice, osadnik S2),
  - **`[KUP] 4. Skyblock i Bloki`** (17 pozycji: grass, lód, mech, dripstone, lawa, **Soul Sand S1**, **Redstone S1** limit `256` pod *Electron Tube* i *Crushing Wheels*, slime, budding amethyst),
  - **`[KUP] 5. Maszyny i High-Tech`** (20 pozycji: Blaze Burner, Waystones, Terminal/ATM, AE2 Sky Stone + Budding Quartz + **4 matryce Inscriber Press**, Mekanism Osmium/Tin/Lead/Fluorite/Uranium, **Diamenty S4** limit `16`, **Ramy i Oczy Portalu Endu S4**),
  - **`[KUP] 6. Maszyny Create`** (96 pozycji w paczkach: kinetyka, przetwórstwo, płyny, logistyka, kolej, elektryka, *Mechanical Extruder*),
  - **`[KUP] 7. Sztabki i Surowce`** (46 pozycji w paczkach: sztabki, blachy, obudowy, `electron_tube`, `precision_mechanism`, surowce),
  - **`[KUP] 8. Bloki Dekoracyjne`** (97 pozycji w paczkach: kamienie Create, *Create Deco*, *Copycats*, szkło, cegły, kwarc, lampy, 16 barwników),
  - **`[KUP] 9. Narzędzia i Plecaki`** (40 pozycji: klucz, gogle, backtank, schematicannon, *Sophisticated Backpacks/Storage*, *Building Gadgets 2*),
  - **`[SKUP] 1..5`** (85 przetworzonych dóbr fabrycznych Tier 1–5 odblokowywanych wraz z Etapami `sell_stage = Tier - 1`, zero surowców Tier 0!).
- **`/sklep lista [0-5]`** (lub `/sklep <0-5>`) — tekstowy podgląd katalogu zakupowego z kategoriami i aliasami do szybkiego `/kup`.
- **`/kup <alias> [ilość]`** — kupuje wybrany towar za monety z portfela, banku osobistego/drużynowego i ekwipunku (w tym `coinpile`/`coinblock`) i automatycznie wydaje resztę.
- **`/kontrakt`** — pokazuje aktywny kontrakt fabryczny (towar, ilość, premię serii `+35%..+55%` i licznik serii).
- **`/kontrakt oddaj`** — **na Wyspie-Rynku `(152, 64, 0)`** pobiera wymagane towary z ekwipunku, wypłaca premię serii (plus `+25%` co 5. kontrakt!) i automatycznie losuje nowe zlecenie dla Waszego Etapu.
- **`/kontrakt nowy`** — losuje inny kontrakt na aktualnym Etapie (cooldown `5 minut`; uwaga: resetuje aktualną serię do `0`).
- **`/kontrakt final`** / **`/kontrakt final oddaj`** — **Wielki Finał Tycoona (Stage 5)**: wielomodowy Mega-Kontrakt łączący wszystkie 5 filarów paczki (`64x Hamburger`, `16x Ruby Chocolate`, `32x Precision Mechanism`, `2x AE2 256k Storage Component`, `4x Mekanism Polonium Pellet`) na Wyspie-Rynku -> nagradza **`kubejs:tycoon_empire_trophy`** + **jednorazową premią `750 000` monet** (tylko za pierwsze ukończenie)!

---

## 4. Tarcza anty-exploitowa (4 warstwy ochrony)

1. **Zero zysku za surowiznę (61 blokad Tier 0):** wszystkie kamienie, rudy, surowe sztabki (w tym surowe metale Mekanism i kryształy Certus Quartz), dropy mobów, diamenty, redstone oraz bloki z Netheru i Endu mają cenę `0` monet zarówno w `/sprzedaj`, jak i w `Shoppers`.
2. **Wyłączony `Coin Mint` i `Slot Machines`:** receptury usunięte przez [economy_anti_exploit.js](../kubejs/server_scripts/economy_anti_exploit.js) oraz wyłączone w zweryfikowanych plikach `ConfigFile` moda *Lightman's Currency*: [lightmanscurrency-common.txt](../config/lightmanscurrency-common.txt) (`canCraftCoinMint=false`, `canMint=false`, `canMelt=false`) oraz [lightmanscurrency-server.txt](../config/lightmanscurrency-server.txt) (`lcterminalCommand=true`, `interest=0.0`).
3. **Limit marży w `Shoppers` (`overpriceMultiplier = 1.25`):** skonfigurowane w [shoppers-common.toml](../config/shoppers-common.toml) — NPC odmawiają zakupu przedmiotów wystawionych powyżej +25% ich wartości rynkowej.
4. **Automatyczna walidacja anty-arbitrażowa i spójności GUI w CI:** [scripts/validate_economy.mjs](../scripts/validate_economy.mjs) pilnuje anty-arbitrażu przy maksymalnym mnożniku `×1,45` (7 reguł zużywalnych materiałów + wszystkie nakładki Buy/Sell), spójności składania (`10` par `≥ 1,1×`), spójności `sell_stage` oraz zasady `zdalna ×0,85 < NPC`, a [scripts/generate_persistent_traders.mjs](../scripts/generate_persistent_traders.mjs) (`--check`) gwarantuje 100% synchronizacji `PersistentTraders.json` z `prices.json`.

---

## 5. Komendy administratora (OP)

- **`/halucynacje_sync_shoppers`** — wgrywa do moda `Shoppers` wszystkie ceny Tier 0 (`0`) oraz Tier 1–5 (`+20%`) z `prices.json` (wykonać raz po starcie świata; od #62 synchronizacja wykrywa edycje automatycznie po hashu!).
- **`/halucynacje_reload_economy`** — przeładowuje `config/halucynacje_economy/prices.json` i odświeża zarówno rynek hurtowy/sklep, jak i ceny NPC `Shoppers` na żywo bez restartu serwera Exaroton.
- **`/halucynacje_sync_stages`** — wymusza pełną resynchronizację etapów co-op, tasków `FTB Quests` oraz bonusowych chunków `FTB Chunks` dla wszystkich graczy online.

---

## 6. Perki za Żetony Etapów (Stage 1–5, Issue #51)

Każdy odblokowany Żeton Etapu daje drużynie realne, trwałe korzyści widoczne pod `/ekonomia`:

| Etap | Dodatkowe FTB Chunks force-load | Premia handlowa Etapu (`/sprzedaj` & Doki) | Limit Doków `/rynek_eksport` | Odblokowania specjalne |
| :--- | :---: | :---: | :---: | :--- |
| **Stage 0** | `+0` (bazowo `20`) | `+0%` | `4` | Start Pure-Create + `1 500` monet dotacji w FTB Quests |
| **Stage 1** (`10k`) | **`+2`** (`22`) | **`+2%`** | `4` | Zwierzęta, Soul Sand, Blaze Burner, kontrakty/Boom Tier 2 |
| **Stage 2** (`50k`) | **`+4`** (`24`) | **`+4%`** | `4` | **Normalny Nether**, Osadnik, Waystone, Tier 2–3 |
| **Stage 3** (`100k`) | **`+6`** (`26`) | **`+6%`** | **`5`** | Startery AE2/Mekanism, odnawialne rudy Mekanism w Create |
| **Stage 4** (`250k`) | **`+10`** (`30`) | **`+8%`** | **`6`** | **Normalny End**, Superheated Fluorite/Uranium, Tier 4–5 |
| **Stage 5** (`1M`) | **`+14`** (`34`) | **`+10%`** | **`8`** | Tytuł **`[Tycoon]`**, pełny endgame & `/ekonomia top` |
