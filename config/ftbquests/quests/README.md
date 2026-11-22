# Księga Zadań `FTB Quests` — HalucynacjeGTP2 (NeoForge 1.21.1)

Ten katalog zawiera pełną kampanię progresji **Create Skyblock Tycoon (Etapy 0–5)** w formacie SNBT dla **FTB Quests (Minecraft 1.21.1, `version: 13`)**.

---

## 1. Schemat deterministycznych 16-znakowych ID (hex)

Wszystkie identyfikatory w plikach `.snbt` są unikalnymi 16-znakowymi ciągami wielkich liter szesnastkowych (`[0-9A-F]{16}`) o przejrzystej strukturze:

| Prefiks | Zakres | Przykład |
| :--- | :--- | :--- |
| `1000000000000001` | Grupa rozdziałów (`chapter_groups.snbt`) | `1000000000000001` (*Kampania Tycoona (Etapy 0–5)*) |
| `A<etap>00000000000000` | Rozdziały (`chapters/stage_X_*.snbt`) | `A000000000000000` .. `A500000000000000` |
| `B<etap>000000000000<QQ>` | Zadania (Quests) w rozdziale `<etap>` | `B100000000000001` (Quest #1 w Etapie 1) |
| `C<etap>0000000000<QQ><TT>` | Taski (`tasks`) w zadaniu `<QQ>` | `C100000000000102` (Task #2 w Queście #1 Etapu 1) |
| `D<etap>0000000000<QQ><RR>` | Nagrody (`rewards`) w zadaniu `<QQ>` | `D100000000000101` (Reward #1 w Queście #1 Etapu 1) |

---

## 2. Mapa ID Żetonów Etapów do integracji z `dimension_gating.js` (Issue #4)

Każdy główny quest milowy (Etapy 1–5) ma dwa taski:
1. **`token_item_task_id`** (`type: "item"`, `consume_items: false`) — wykrywa zakup/posiadanie przedmiotu `kubejs:stage_X_token`.
2. **`stage_custom_task_id`** (`type: "custom"`) — **nie można go kliknąć ręcznie**; powinien być zaliczany automatycznie przez `kubejs/server_scripts/dimension_gating.js` w funkcji `grantStage(...)` komendą:
   ```mcfunction
   ftbquests change_progress <player.username> complete <stage_custom_task_id>
   ```

| Etap (`stageId`) | Przedmiot KubeJS | Rozdział (`chapter_id`) | Quest (`quest_id`) | Task przedmiotu (`item`) | Task aktywacji (`custom` -> dla `dimension_gating.js`) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `stage_1` | `kubejs:stage_1_token` | `A100000000000000` | `B100000000000001` | `C100000000000101` | **`C100000000000102`** |
| `stage_2` | `kubejs:stage_2_token` | `A200000000000000` | `B200000000000001` | `C200000000000101` | **`C200000000000102`** |
| `stage_3` | `kubejs:stage_3_token` | `A300000000000000` | `B300000000000001` | `C300000000000101` | **`C300000000000102`** |
| `stage_4` | `kubejs:stage_4_token` | `A400000000000000` | `B400000000000001` | `C400000000000101` | **`C400000000000102`** |
| `stage_5` | `kubejs:stage_5_token` | `A500000000000000` | `B500000000000001` | `C500000000000101` | **`C500000000000102`** |

> **Zasada balansu nagród:** Żadne zadanie w księdze **nie wypłaca monet `Lightman's Currency`**, aby nie omijać progów ekonomicznych (`10k / 50k / 100k / 250k / 1M`). Nagrody to wyłącznie XP, toasty awansu oraz drobne przedmioty startowe QoL w Etapie 0 (pochodnie, klucz Create, gogle, kilka kawałków szarlotki).

---

## 3. Weryfikacja ID przedmiotów na plikach `.jar` (`NeoForge 1.21.1`)

Wszystkie ID przedmiotów z addonów zostały **zweryfikowane bezpośrednio na prawdziwych plikach `.jar`** z naszego `packwiz/`:

- ✅ `create_mechanical_extruder:mechanical_extruder` (`stage_0_start.snbt`, `C000000000000202`)
- ✅ `sliceanddice:slicer` (`stage_1_trade.snbt`, `C100000000000201`)
- ✅ `lightmanscurrency:shelf_oak` oraz `lightmanscurrency:wallet_copper` (`stage_1_trade.snbt`, `C100000000000401`..`402`)
- ✅ `create_confectionery:bar_of_black_chocolate` (`stage_2_nether.snbt`, `C200000000000502`)
- ✅ `create_hypertube:hypertube_entrance` (`stage_2_nether.snbt`, `C200000000000603` — poprawiono namespace z `hypertubes:` na `create_hypertube:`!)
- ✅ `trading_floor:trading_depot` (`stage_3_industry.snbt`, `C300000000000401`)
- ✅ `create_enchantment_industry:blaze_enchanter` (`stage_3_industry.snbt`, `C300000000000402`)
- ✅ `create_sa:brass_jetpack_chestplate` (`stage_3_industry.snbt`, `C300000000000501`)
- ✅ `createappliedkinetics:me_proxy` (`stage_4_hightech_end.snbt`, `C400000000000303` — poprawiono z nieistniejącego `stress_generator` na prawdziwy blok `me_proxy`!)
- `[VERIFY ON 1.21.1 BOOT]` *(wymagany żywy klient — parsowanie SNBT na serwerze zweryfikowane w CI `server-boot`)*: Potwierdzić poprawne renderowanie księgi *FTB Quests* `2101.x` (`version: 13`) po stronie klienta (`icon: { id: "..." }`, `type: "custom"` oraz powiadomienia `type: "toast"`).
