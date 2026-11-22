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
| **Automatyczny Dok Eksportowy (`/rynek_eksport`)** | **105% (+5% logistyka + Boom/Różnorodność!)** | Podłącz pociąg Create, Chain Conveyor + Frogport lub lejek do skrzyni / beczki / `Create: Item Vault` na **Wyspie-Rynku** i wpisz `/rynek_eksport dodaj` (limit: 4 doki na serwer). Co 30 sekund serwer sam sprzedaje przetworzone towary Tier 1–5 z premią **`+5%`** i przelewa środki prosto na Wasze **Team Bank Account**! | W pełni bezobsługowy, pasywny eksport całych linii produkcyjnych! |
| **Rynek Hurtowy (`/sprzedaj` / `/sprzedaj all`)** | **100% na Rynku / 85% zdalnie (+ Boom/Różnorodność)** | Natychmiastowa sprzedaż z ekwipunku za fizyczne monety *Lightman's Currency*. Sprzedaż poza Wyspą-Rynkiem pobiera `-15%` opłaty kurierskiej (`85%`), a na Wyspie-Rynku płaci pełne `100%`. Co **20 minut** losowany jest **Boom Rynkowy (`+40%`)** (`/boom`), a **3 / 5 / 7 różnych towarów** w oknie 30 min daje **Premię za Różnorodność (`+10% / +15% / +20%`)**! | Szybki start w Stage 0 i ręczne polowanie na gorące ceny giełdowe. |

---

## 3. Komendy ekonomiczne dla graczy

Komendy rynku i zakupów obsługuje [kubejs/server_scripts/economy_market.js](../kubejs/server_scripts/economy_market.js), a system dynamicznych zleceń — [kubejs/server_scripts/economy_contracts.js](../kubejs/server_scripts/economy_contracts.js):

- **`/ekonomia`** — Twój panel Tycoona: aktualny Etap drużyny, łączne saldo LC (identyczne z TAB: EQ + Portfel + Bank), obrót hurtowy, aktywny **Boom Rynkowy**, **Premia za Różnorodność** oraz ile monet brakuje do kolejnego Żetonu Etapu.
- **`/ekonomia top`** — ranking Tycoona: postęp do kolejnego kamienia milowego (`10k / 50k / 100k / 250k / 500k / 1M` — każdy próg ogłaszany jest na czacie serwera!), **TOP 5 eksportowanych produktów** oraz **ranking eksporterów** (gracze + Automatyczne Doki).
- **`/boom`** (alias `/gielda`) — pokazuje aktualny **Boom Rynkowy (+40% ceny)** na najbliższe 20 min oraz aktualną **Premię za Różnorodność Fabryki** (`+10% / +15% / +20%`).
- **`/rynek_eksport dodaj` / `lista` / `usun [nr]` / `odbierz`** — rejestruje kontener (skrzynię, beczkę lub `Create: Item Vault`) na **Wyspie-Rynku** jako **Automatyczny Dok Eksportowy (`105%` + Boom + Różnorodność)** zasilany pociągiem Create lub Chain Conveyorem!
- **`/cennik [1-5]`** — tabela skupu hurtowego i docelowej ceny NPC `+20%` dla wybranego Tieru (1–5).
- **`/sprzedaj`** — sprzedaje stack z głównej ręki (`100%` na Wyspie-Rynku, `85%` poza nią + premie Boom/Różnorodności) i wypłaca monety *Lightman's Currency*.
- **`/sprzedaj all`** — sprzedaje hurtem wszystkie przetworzone towary Tier 1–5 z ekwipunku jednym kliknięciem.
- **`/sklep`** (lub PPM na bloku `Trading Terminal` na Wyspie-Rynku — zalecamy `/sklep`, bo obsługuje przycisk **„Back to Network Terminal”**) — otwiera **prawdziwe, graficzne GUI Sklepu Sieciowego** (*Lightman's Currency*) zasilane z [config/lightmanscurrency/PersistentTraders.json](../config/lightmanscurrency/PersistentTraders.json) (**10 sklepów, 170 ofert**):
  - **`[KUP] 1. Żetony Etapów`** (`kubejs:stage_1..5_token` za `10k/50k/100k/250k/1M` + `create:creative_motor` za `2M`),
  - **`[KUP] 2. Rośliny i Sadzonki`** (30 pozycji: wszystkie 8 drzew, nasiona Vanilla i FD, grzyby, kakao, jagody),
  - **`[KUP] 3. Zwierzęta i Hodowla`** (14 pozycji: zwierzęta farmowe, pszczoły/ule, ryby, kałamarnice, osadnik S2),
  - **`[KUP] 4. Skyblock i Bloki`** (16 pozycji: grass, lód, mech, dripstone, lawa, **Soul Sand S1**, slime, budding amethyst),
  - **`[KUP] 5. Maszyny i High-Tech`** (17 pozycji: Blaze Burner, Waystones, Terminal/ATM, AE2 Sky Stone + Budding Quartz + **4 matryce Inscriber Press**, Mekanism Osmium/Tin/Lead/Fluorite/Uranium),
  - **`[SKUP] 1..5`** (87 przetworzonych dóbr fabrycznych Tier 1–5 z ceną bazową `100%`, zero surowców Tier 0!).
- **`/sklep lista [0-5]`** (lub `/sklep <0-5>`) — tekstowy podgląd katalogu zakupowego z kategoriami i aliasami do szybkiego `/kup`.
- **`/kup <alias> [ilość]`** — kupuje wybrany towar za monety z portfela, banku osobistego/drużynowego i ekwipunku (w tym `coinpile`/`coinblock`) i automatycznie wydaje resztę.
- **`/kontrakt`** — pokazuje aktywny kontrakt fabryczny (towar, ilość, premię serii `+35%..+55%` i licznik serii).
- **`/kontrakt oddaj`** — **na Wyspie-Rynku `(152, 64, 0)`** pobiera wymagane towary z ekwipunku, wypłaca premię serii (plus `+25%` co 5. kontrakt!) i automatycznie losuje nowe zlecenie dla Waszego Etapu.
- **`/kontrakt nowy`** — losuje inny kontrakt na aktualnym Etapie (cooldown `5 minut`; uwaga: resetuje aktualną serię do `0`).

---

## 4. Tarcza anty-exploitowa (4 warstwy ochrony)

1. **Zero zysku za surowiznę (55 blokad Tier 0):** wszystkie kamienie, rudy, sztabki (w tym surowe metale Mekanism i kryształy Certus Quartz), dropy mobów oraz bloki z Netheru i Endu mają cenę `0` monet zarówno w `/sprzedaj`, jak i w `Shoppers`.
2. **Wyłączony `Coin Mint` i `Slot Machines`:** receptury usunięte przez [economy_anti_exploit.js](../kubejs/server_scripts/economy_anti_exploit.js) oraz wyłączone w zweryfikowanych plikach `ConfigFile` moda *Lightman's Currency*: [lightmanscurrency-common.txt](../config/lightmanscurrency-common.txt) (`canCraftCoinMint=false`, `canMint=false`, `canMelt=false`) oraz [lightmanscurrency-server.txt](../config/lightmanscurrency-server.txt) (`lcterminalCommand=true`, `interest=0.0`).
3. **Limit marży w `Shoppers` (`overpriceMultiplier = 1.25`):** skonfigurowane w [shoppers-common.toml](../config/shoppers-common.toml) — NPC odmawiają zakupu przedmiotów wystawionych powyżej +25% ich wartości rynkowej.
4. **Automatyczna walidacja anty-arbitrażowa i spójności GUI w CI:** [scripts/validate_economy.mjs](../scripts/validate_economy.mjs) pilnuje anty-arbitrażu (16 reguł) oraz spójności cen ciast/kawałków, a [scripts/generate_persistent_traders.mjs](../scripts/generate_persistent_traders.mjs) (`--check`) gwarantuje 100% synchronizacji `PersistentTraders.json` z `prices.json`.

---

## 5. Komendy administratora (OP)

- **`/halucynacje_sync_shoppers`** — wgrywa do moda `Shoppers` wszystkie ceny Tier 0 (`0`) oraz Tier 1–5 (`+20%`) z `prices.json` (wykonać raz po starcie świata).
- **`/halucynacje_reload_economy`** — przeładowuje `config/halucynacje_economy/prices.json` na żywo bez restartu serwera Exaroton.
- **`/halucynacje_sync_stages`** — wymusza pełną resynchronizację etapów co-op i tasków `FTB Quests` dla wszystkich graczy online.
