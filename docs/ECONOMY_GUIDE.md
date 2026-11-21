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

## 2. Dwa kanały zbytu (dlaczego opłaca się budować logistykę na Wyspę-Rynek?)

| Kanał sprzedaży | Marża | Jak działa | Kiedy używać |
| :--- | :--- | :--- | :--- |
| **Fizyczne sklepy NPC na Wyspie-Rynku** (*Lightman's Currency* + *Shoppers*) | **+20% wyższa cena!** | Pociągi Create / Chain Conveyors + Frogporty dowożą towary na tylne korytarze 8 stoisk na Wyspie-Rynku `(152, 64, 0)`. Klienci NPC (`maxShoppers = 10`, bezpieczny promień `4–12` bloków + `VirtualShoppingSimulator` w tle!) kupują towary, a pieniądze trafiają na Wasze **Team Bank Account**. | Główny silnik zarobku w Stage 1–5 — maksymalna marża i żywy świat! |
| **Rynek Hurtowy (`/sprzedaj` / `/sprzedaj all`)** | **100% (cena bazowa)** | Natychmiastowa sprzedaż z ekwipunku za fizyczne monety *Lightman's Currency* (zasilana bezpośrednio z [prices.json](../config/halucynacje_economy/prices.json)). Działa od 1. minuty gry bez ręcznej konfiguracji. | Szybki start w Stage 0 i zlew gigantycznych nadwyżek w late-game. |

---

## 3. Komendy ekonomiczne dla graczy

Wszystkie komendy obsługuje [kubejs/server_scripts/economy_market.js](../kubejs/server_scripts/economy_market.js):

- **`/ekonomia`** — Twój panel Tycoona: aktualny Etap drużyny, wartość monet w ekwipunku, łączny obrót z eksportu hurtowego oraz ile monet brakuje do kolejnego Żetonu Etapu.
- **`/cennik [1-5]`** — tabela skupu hurtowego i docelowej ceny NPC `+20%` dla wybranego Tieru (1–5).
- **`/sprzedaj`** — sprzedaje stack z głównej ręki (respektując `pack_size`, np. pakiety po 16 torów) i wypłaca monety *Lightman's Currency*.
- **`/sprzedaj all`** — sprzedaje hurtem wszystkie przetworzone towary Tier 1–5 z ekwipunku jednym kliknięciem.
- **`/sklep [0-5]`** — lista dostępnych starterów Skyblocka (nasiona, sadzonki, jaja hodowlane krów/świń/kur/owiec/pszczół, lawa, Blaze Burner, startery AE2 i Mekanism: Osmium/Fluoryt/Uran), **Żetonów Etapów** oraz prestiżowego `creative_motor`.
- **`/kup <alias> [ilość]`** — kupuje wybrany towar za monety z ekwipunku i automatycznie wydaje resztę (np. `/kup kelp 2`, `/kup cow 2`, `/kup stage_1`, `/kup creative_motor`).

---

## 4. Tarcza anty-exploitowa (4 warstwy ochrony)

1. **Zero zysku za surowiznę (47 blokad Tier 0):** wszystkie kamienie, rudy, sztabki, dropy mobów oraz bloki z Netheru i Endu mają cenę `0` monet zarówno w `/sprzedaj`, jak i w `Shoppers`.
2. **Wyłączony `Coin Mint` i `Slot Machines`:** receptury usunięte przez [economy_anti_exploit.js](../kubejs/server_scripts/economy_anti_exploit.js) oraz wyłączone w [lightmanscurrency-server.toml](../config/lightmanscurrency-server.toml).
3. **Limit marży w `Shoppers` (`overpriceMultiplier = 1.25`):** skonfigurowane w [shoppers-common.toml](../config/shoppers-common.toml) — NPC odmawiają zakupu przedmiotów wystawionych powyżej +25% ich wartości rynkowej.
4. **Automatyczna walidacja anty-arbitrażowa w CI:** [scripts/validate_economy.mjs](../scripts/validate_economy.mjs) pilnuje przy każdym PR, że żadne składniki kupione w `/sklep` nie dadzą się sprzedać drożej po przetworzeniu.

---

## 5. Komendy administratora (OP)

- **`/halucynacje_sync_shoppers`** — wgrywa do moda `Shoppers` wszystkie ceny Tier 0 (`0`) oraz Tier 1–5 (`+20%`) z `prices.json` (wykonać raz po starcie świata).
- **`/halucynacje_reload_economy`** — przeładowuje `config/halucynacje_economy/prices.json` na żywo bez restartu serwera Exaroton.
- **`/halucynacje_sync_stages`** — wymusza pełną resynchronizację etapów co-op i tasków `FTB Quests` dla wszystkich graczy online.
