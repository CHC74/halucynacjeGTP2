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
| **Dynamiczne Kontrakty Fabryczne (`/kontrakt`)** | **+35% premii!** | System losuje celowane zlecenie eksportowe dopasowane do Waszego aktualnego Etapu (Stage 0–5) prosto z [prices.json](../config/halucynacje_economy/prices.json). Oddanie pełnej partii wypłaca fizyczne monety *Lightman's Currency* z premią `+35%` i automatycznie losuje kolejne zlecenie. | Najwyższa rentowność w grze — motywuje do automatyzacji różnych linii produkcyjnych! |
| **Fizyczne sklepy NPC na Wyspie-Rynku** (*Lightman's Currency* + *Shoppers*) | **+20% wyższa cena!** | Pociągi Create / Chain Conveyors + Frogporty dowożą towary na tylne korytarze 8 stoisk na Wyspie-Rynku `(152, 64, 0)`. Klienci NPC (`maxShoppers = 10`, bezpieczny promień `4–12` bloków + `VirtualShoppingSimulator` w tle!) kupują towary, a pieniądze trafiają na Wasze **Team Bank Account**. | Główny pasywny silnik zarobku w Stage 1–5 — stały przychód i żywy rynek! |
| **Rynek Hurtowy (`/sprzedaj` / `/sprzedaj all`)** | **100% (cena bazowa)** | Natychmiastowa sprzedaż z ekwipunku za fizyczne monety *Lightman's Currency* (zasilana bezpośrednio z [prices.json](../config/halucynacje_economy/prices.json)). Działa od 1. minuty gry bez ręcznej konfiguracji. | Szybki start w Stage 0 i zlew gigantycznych nadwyżek w late-game. |

---

## 3. Komendy ekonomiczne dla graczy

Komendy rynku i zakupów obsługuje [kubejs/server_scripts/economy_market.js](../kubejs/server_scripts/economy_market.js), a system dynamicznych zleceń — [kubejs/server_scripts/economy_contracts.js](../kubejs/server_scripts/economy_contracts.js):

- **`/ekonomia`** — Twój panel Tycoona: aktualny Etap drużyny, wartość monet w ekwipunku, łączny obrót z eksportu hurtowego oraz ile monet brakuje do kolejnego Żetonu Etapu.
- **`/cennik [1-5]`** — tabela skupu hurtowego i docelowej ceny NPC `+20%` dla wybranego Tieru (1–5).
- **`/sprzedaj`** — sprzedaje stack z głównej ręki (respektując `pack_size`, np. pakiety po 16 torów) i wypłaca monety *Lightman's Currency*.
- **`/sprzedaj all`** — sprzedaje hurtem wszystkie przetworzone towary Tier 1–5 z ekwipunku jednym kliknięciem.
- **`/sklep`** (lub PPM na bloku `Trading Terminal` na Wyspie-Rynku — zalecamy `/sklep`, bo obsługuje przycisk **„Back to Network Terminal”**) — otwiera **prawdziwe, graficzne GUI Sklepu Sieciowego** (*Lightman's Currency*) zasilane z [config/lightmanscurrency/PersistentTraders.json](../config/lightmanscurrency/PersistentTraders.json) (**10 sklepów, 170 ofert**):
  - **`[KUP] 1. Żetony Etapów`** (`kubejs:stage_1..5_token` za `10k/50k/100k/250k/1M` + `create:creative_motor` za `2M`),
  - **`[KUP] 2. Rośliny i Sadzonki`** (30 pozycji: wszystkie 8 drzew, nasiona Vanilla i FD, grzyby, kakao, jagody),
  - **`[KUP] 3. Zwierzęta i Hodowla`** (14 pozycji: zwierzęta farmowe, pszczoły/ule, ryby, kałamarnice, osadnik S2),
  - **`[KUP] 4. Skyblock i Bloki`** (16 pozycji: grass, lód, mech, dripstone, lawa, **Soul Sand S1**, slime, budding amethyst),
  - **`[KUP] 5. Maszyny i High-Tech`** (17 pozycji: Blaze Burner, Waystones, Terminal/ATM, AE2 Sky Stone + Budding Quartz + **4 matryce Inscriber Press**, Mekanism Osmium/Tin/Lead/Fluorite/Uranium),
  - **`[SKUP] 1..5`** (87 przetworzonych dóbr fabrycznych Tier 1–5 z ceną bazową `100%`, zero surowców Tier 0!).
- **`/sklep lista [0-5]`** (lub `/sklep <0-5>`) — tekstowy podgląd katalogu zakupowego z kategoriami i aliasami do szybkiego `/kup`.
- **`/kup <alias> [ilość]`** — kupuje wybrany towar za monety z ekwipunku i automatycznie wydaje resztę (np. `/kup kelp 2`, `/kup cow 2`, `/kup stage_1`, `/kup creative_motor`).
- **`/kontrakt`** — pokazuje aktywny kontrakt fabryczny (wymagany towar, ilość i nagrodę `+35%` w monetach *Lightman's Currency*).
- **`/kontrakt oddaj`** — pobiera wymagane towary z ekwipunku, wypłaca premię `+35%` i automatycznie losuje nowe zlecenie dla Waszego Etapu.
- **`/kontrakt nowy`** — losuje inny kontrakt na aktualnym Etapie (cooldown `5 minut`).

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
