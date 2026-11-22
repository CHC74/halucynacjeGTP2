// priority: 100
// ============================================================================
// HalucynacjeGTP2 — Wspólne stałe i pomocniki ekonomii (KubeJS 7.2 / Rhino 2101.2.7)
// Platforma: Minecraft 1.21.1 | NeoForge | Lightman's Currency 2.3.0.6
//
// Wszystkie skrypty w `kubejs/server_scripts/` współdzielą jeden zakres globalny.
// Ten plik ma `priority: 100`, więc ładuje się PRZED pozostałymi skryptami
// (`economy_market.js`, `economy_contracts.js`, `economy_anti_exploit.js`,
// `economy_tab_balance.js`, `dimension_gating.js`) i dostarcza pojedyncze definicje:
// - kluczy `persistentData` i ścieżki `prices.json`,
// - pełnej tabeli monet Lightman's Currency (`coin_*`, `coinpile_*` x9, `coinblock_*` x36),
// - `formatCoins`, `splitIntoCoinStacks`, `readPricesJson` (z cache),
// - `getCurrentUnlockedStage` (wspólny dla globalnych i indywidualnych etapów),
// - `sendCommandFeedback` (bezpieczne dla KubeJS 7.2 bez ArrowFunction(0)).
// ============================================================================

const HALUCYNACJE_PRICES_FILE = 'config/halucynacje_economy/prices.json';
const GLOBAL_STAGES_KEY = 'halucynacje_global_stages';
const PLAYER_STAGES_KEY = 'halucynacje_stages';

const LC_COINS = [
  { id: 'lightmanscurrency:coin_netherite', value: 100000 },
  { id: 'lightmanscurrency:coin_diamond', value: 10000 },
  { id: 'lightmanscurrency:coin_emerald', value: 1000 },
  { id: 'lightmanscurrency:coin_gold', value: 100 },
  { id: 'lightmanscurrency:coin_iron', value: 10 },
  { id: 'lightmanscurrency:coin_copper', value: 1 }
];

const LC_COIN_VALUES = {
  'lightmanscurrency:coin_netherite': 100000,
  'lightmanscurrency:coin_diamond': 10000,
  'lightmanscurrency:coin_emerald': 1000,
  'lightmanscurrency:coin_gold': 100,
  'lightmanscurrency:coin_iron': 10,
  'lightmanscurrency:coin_copper': 1
};

const LC_ALL_MONEY_ITEM_VALUES = {
  // Podstawowe monety (łańcuch "main": x10 między nominałami)
  'lightmanscurrency:coin_copper': 1,
  'lightmanscurrency:coin_iron': 10,
  'lightmanscurrency:coin_gold': 100,
  'lightmanscurrency:coin_emerald': 1000,
  'lightmanscurrency:coin_diamond': 10000,
  'lightmanscurrency:coin_netherite': 100000,
  // Stosy monet (coinpile = 9x moneta)
  'lightmanscurrency:coinpile_copper': 9,
  'lightmanscurrency:coinpile_iron': 90,
  'lightmanscurrency:coinpile_gold': 900,
  'lightmanscurrency:coinpile_emerald': 9000,
  'lightmanscurrency:coinpile_diamond': 90000,
  'lightmanscurrency:coinpile_netherite': 900000,
  // Bloki monet (coinblock = 4 stosy = 36x moneta)
  'lightmanscurrency:coinblock_copper': 36,
  'lightmanscurrency:coinblock_iron': 360,
  'lightmanscurrency:coinblock_gold': 3600,
  'lightmanscurrency:coinblock_emerald': 36000,
  'lightmanscurrency:coinblock_diamond': 360000,
  'lightmanscurrency:coinblock_netherite': 3600000
};

const LC_ALL_MONEY_ITEMS_ASC = [
  { id: 'lightmanscurrency:coin_copper', value: 1 },
  { id: 'lightmanscurrency:coinpile_copper', value: 9 },
  { id: 'lightmanscurrency:coin_iron', value: 10 },
  { id: 'lightmanscurrency:coinblock_copper', value: 36 },
  { id: 'lightmanscurrency:coinpile_iron', value: 90 },
  { id: 'lightmanscurrency:coin_gold', value: 100 },
  { id: 'lightmanscurrency:coinblock_iron', value: 360 },
  { id: 'lightmanscurrency:coinpile_gold', value: 900 },
  { id: 'lightmanscurrency:coin_emerald', value: 1000 },
  { id: 'lightmanscurrency:coinblock_gold', value: 3600 },
  { id: 'lightmanscurrency:coinpile_emerald', value: 9000 },
  { id: 'lightmanscurrency:coin_diamond', value: 10000 },
  { id: 'lightmanscurrency:coinblock_emerald', value: 36000 },
  { id: 'lightmanscurrency:coinpile_diamond', value: 90000 },
  { id: 'lightmanscurrency:coin_netherite', value: 100000 },
  { id: 'lightmanscurrency:coinblock_diamond', value: 360000 },
  { id: 'lightmanscurrency:coinpile_netherite', value: 900000 },
  { id: 'lightmanscurrency:coinblock_netherite', value: 3600000 }
];

const SCOREBOARD_MAX_BALANCE = 2147483647; // Limit 32-bit int w Minecraft Scoreboard

let SHARED_PRICES_JSON_CACHE = null;
let SHARED_LC_API_CLASSES = null;
let SHARED_LC_API_LOADED = false;

/**
 * Formatuje dodatnią liczbę monet z odstępem co 3 cyfry (np. "1 000 000").
 */
function formatCoins(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/**
 * Ogranicza wynik do bezpiecznego zakresu 32-bitowego scoreboarda Minecrafta [0 .. 2 147 483 647].
 */
function clampScoreboardBalance(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= SCOREBOARD_MAX_BALANCE) return SCOREBOARD_MAX_BALANCE;
  return Math.floor(n);
}

/**
 * Rozbija kwotę w monetach bazowych (copper) na optymalne stacki monet LC (<= 64 szt.).
 */
function splitIntoCoinStacks(amount) {
  let remaining = Math.floor(Number(amount) || 0);
  const stacks = [];
  if (remaining <= 0) {
    return stacks;
  }

  for (let i = 0; i < LC_COINS.length; i++) {
    const coin = LC_COINS[i];
    if (remaining >= coin.value) {
      let count = Math.floor(remaining / coin.value);
      remaining = remaining % coin.value;
      while (count > 0) {
        const chunk = Math.min(64, count);
        stacks.push({ id: coin.id, count: chunk });
        count -= chunk;
      }
    }
  }
  return stacks;
}

/**
 * Wypłaca graczowi dokładnie `amount` monet LC w optymalnych stackach.
 */
function giveCoinsToPlayer(player, amount) {
  if (!player || typeof player.give !== 'function') return;
  const stacks = splitIntoCoinStacks(amount);
  for (let i = 0; i < stacks.length; i++) {
    player.give(Item.of(stacks[i].id, stacks[i].count));
  }
}

/**
 * Leniwie ładuje klasy API Lightman's Currency 2.3.0.6 (jednorazowo).
 */
function getLightmansApiClasses() {
  var loaded = null;

  if (SHARED_LC_API_LOADED) {
    return SHARED_LC_API_CLASSES;
  }
  SHARED_LC_API_LOADED = true;

  if (typeof Java === 'undefined' || typeof Java.loadClass !== 'function') {
    SHARED_LC_API_CLASSES = null;
    return null;
  }

  loaded = {
    MoneyAPI: null,
    CoinValue: null,
    PlayerBankReference: null,
    TeamAPI: null
  };

  try {
    loaded.MoneyAPI = Java.loadClass('io.github.lightman314.lightmanscurrency.api.money.MoneyAPI');
  } catch (err1) {
    console.warn(`[HalucynacjeGTP2/LC] Nie załadowano MoneyAPI: ${err1}`);
  }
  try {
    loaded.CoinValue = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.api.money.value.builtin.CoinValue'
    );
  } catch (err2) {
    console.warn(`[HalucynacjeGTP2/LC] Nie załadowano CoinValue: ${err2}`);
  }
  try {
    loaded.PlayerBankReference = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.api.money.bank.reference.builtin.PlayerBankReference'
    );
  } catch (err3) {
    console.warn(`[HalucynacjeGTP2/LC] Nie załadowano PlayerBankReference: ${err3}`);
  }
  try {
    loaded.TeamAPI = Java.loadClass('io.github.lightman314.lightmanscurrency.api.teams.TeamAPI');
  } catch (err4) {
    console.warn(`[HalucynacjeGTP2/LC] Nie załadowano TeamAPI: ${err4}`);
  }

  SHARED_LC_API_CLASSES = loaded;
  return loaded;
}

/**
 * Wyciąga łączną wartość monet bazowych (łańcuch `"main"`) z obiektu `MoneyView`.
 */
function extractMainChainCopper(moneyView) {
  if (!moneyView || typeof moneyView.allValues !== 'function') {
    return 0;
  }

  var total = 0;
  var values = null;
  var len = 0;
  var i = 0;
  var mv = null;
  var isMainCoinChain = false;
  var uniq = '';
  var coreVal = 0;

  try {
    values = moneyView.allValues();
    if (!values) return 0;

    len = typeof values.size === 'function' ? values.size() : values.length || 0;
    for (i = 0; i < len; i++) {
      mv = typeof values.get === 'function' ? values.get(i) : values[i];
      if (!mv) continue;
      if (typeof mv.isEmpty === 'function' && mv.isEmpty()) continue;
      if (typeof mv.isFree === 'function' && mv.isFree()) continue;

      isMainCoinChain = false;
      if (typeof mv.getChain === 'function') {
        isMainCoinChain = String(mv.getChain()) === 'main';
      } else if (typeof mv.getUniqueName === 'function') {
        uniq = String(mv.getUniqueName());
        isMainCoinChain =
          uniq === 'lightmanscurrency:coins;main' ||
          uniq === 'lightmanscurrency:coins_main' ||
          (uniq.indexOf('lightmanscurrency:coins') === 0 && uniq.indexOf('main') !== -1);
      }

      if (isMainCoinChain && typeof mv.getCoreValue === 'function') {
        coreVal = Number(mv.getCoreValue());
        if (Number.isFinite(coreVal) && coreVal > 0) {
          total += coreVal;
        }
      }
    }
  } catch (err) {
    // Bezpieczny fallback
  }

  return total;
}

/**
 * 1. Fizyczne monety, stosy (`coinpile_*` x9) i bloki monet (`coinblock_*` x36) w ekwipunku gracza.
 */
function getInventoryCoinsCopper(player) {
  if (!player || !player.inventory) return 0;
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
  let total = 0;

  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || (typeof stack.isEmpty === 'function' && stack.isEmpty())) continue;
    const val = LC_ALL_MONEY_ITEM_VALUES[String(stack.id)];
    if (val) {
      total += val * Number(stack.count || 0);
    }
  }
  return total;
}

/**
 * 2. Monety w wyposażonym portfelu LC (`MoneyAPI -> CoinPlayerMoneyHandler -> WalletHandler`).
 */
function getEquippedWalletCopper(player) {
  var api = null;
  var moneyApi = null;
  var handler = null;
  try {
    api = getLightmansApiClasses();
    if (!api || !api.MoneyAPI || typeof api.MoneyAPI.getApi !== 'function') return 0;
    moneyApi = api.MoneyAPI.getApi();
    if (!moneyApi || typeof moneyApi.GetPlayersMoneyHandler !== 'function') return 0;
    handler = moneyApi.GetPlayersMoneyHandler(player);
    if (!handler || typeof handler.getStoredMoney !== 'function') return 0;
    return extractMainChainCopper(handler.getStoredMoney());
  } catch (err) {
    return 0;
  }
}

/**
 * 3. Osobiste konto bankowe gracza (`PlayerBankReference.of(player).get()`).
 */
function getPersonalBankCopper(player) {
  var api = null;
  var ref = null;
  var account = null;
  var storage = null;
  try {
    api = getLightmansApiClasses();
    if (!api || !api.PlayerBankReference || typeof api.PlayerBankReference.of !== 'function') {
      return 0;
    }
    ref = api.PlayerBankReference.of(player);
    if (!ref || typeof ref.get !== 'function') return 0;
    account = ref.get();
    if (!account || typeof account.getMoneyStorage !== 'function') return 0;
    storage = account.getMoneyStorage();
    if (!storage || typeof storage.getStoredMoney !== 'function') return 0;
    return extractMainChainCopper(storage.getStoredMoney());
  } catch (err) {
    return 0;
  }
}

/**
 * 4. Konta bankowe drużyn LC dostępnych dla gracza (deduplikowane po `team.getID()`).
 */
function getTeamBanksCopper(player) {
  var api = null;
  var teamApi = null;
  var teams = null;
  var seenTeamIds = {};
  var total = 0;
  var len = 0;
  var i = 0;
  var team = null;
  var teamId = '';
  var account = null;
  var storage = null;

  try {
    api = getLightmansApiClasses();
    if (!api || !api.TeamAPI || typeof api.TeamAPI.getApi !== 'function') return 0;
    teamApi = api.TeamAPI.getApi();
    if (!teamApi || typeof teamApi.GetAllTeamsForPlayer !== 'function') return 0;
    teams = teamApi.GetAllTeamsForPlayer(player);
    if (!teams) return 0;

    len = typeof teams.size === 'function' ? teams.size() : teams.length || 0;

    for (i = 0; i < len; i++) {
      team = typeof teams.get === 'function' ? teams.get(i) : teams[i];
      if (!team) continue;

      teamId = typeof team.getID === 'function' ? String(team.getID()) : String(i);
      if (seenTeamIds[teamId]) continue;
      seenTeamIds[teamId] = true;

      if (typeof team.hasBankAccount === 'function' && !team.hasBankAccount()) continue;
      if (typeof team.canAccessBankAccount === 'function' && !team.canAccessBankAccount(player)) {
        continue;
      }

      account = typeof team.getBankAccount === 'function' ? team.getBankAccount() : null;
      if (!account || typeof account.getMoneyStorage !== 'function') continue;
      storage = account.getMoneyStorage();
      if (!storage || typeof storage.getStoredMoney !== 'function') continue;
      total += extractMainChainCopper(storage.getStoredMoney());
    }

    return total;
  } catch (err) {
    return 0;
  }
}

/**
 * Jedyne źródło prawdy dla salda gracza — używane przez TAB, `/saldo`, `/ekonomia` oraz `/kup`.
 */
function computePlayerBalanceBreakdown(player) {
  const inventory = getInventoryCoinsCopper(player);
  const wallet = getEquippedWalletCopper(player);
  const personalBank = getPersonalBankCopper(player);
  const teamBank = getTeamBanksCopper(player);
  const total = inventory + wallet + personalBank + teamBank;
  return {
    inventory: inventory,
    wallet: wallet,
    personalBank: personalBank,
    teamBank: teamBank,
    total: total,
    clampedScore: clampScoreboardBalance(total)
  };
}

function collectPlayerMoneyHandlers(player, api) {
  var handlers = [];
  var moneyApi = null;
  var walletHandler = null;
  var ref = null;
  var account = null;
  var storage = null;
  var teamApi = null;
  var teams = null;
  var seenTeamIds = {};
  var len = 0;
  var i = 0;
  var team = null;
  var teamId = '';
  var teamAccount = null;
  var teamStorage = null;

  if (!api || !api.CoinValue || typeof api.CoinValue.fromNumber !== 'function') {
    return handlers;
  }

  // 1. Wyposażony portfel LC
  try {
    if (api.MoneyAPI && typeof api.MoneyAPI.getApi === 'function') {
      moneyApi = api.MoneyAPI.getApi();
      if (moneyApi && typeof moneyApi.GetPlayersMoneyHandler === 'function') {
        walletHandler = moneyApi.GetPlayersMoneyHandler(player);
        if (walletHandler && typeof walletHandler.extractMoney === 'function') {
          handlers.push(walletHandler);
        }
      }
    }
  } catch (e1) {
    // Portfel niedostępny
  }

  // 2. Osobiste konto bankowe gracza
  try {
    if (api.PlayerBankReference && typeof api.PlayerBankReference.of === 'function') {
      ref = api.PlayerBankReference.of(player);
      account = ref && typeof ref.get === 'function' ? ref.get() : null;
      storage = account && typeof account.getMoneyStorage === 'function' ? account.getMoneyStorage() : null;
      if (storage && typeof storage.extractMoney === 'function') {
        handlers.push(storage);
      }
    }
  } catch (e2) {
    // Bank osobisty niedostępny
  }

  // 3. Dostępne konta bankowe drużyn (deduplikowane po team.getID())
  try {
    if (api.TeamAPI && typeof api.TeamAPI.getApi === 'function') {
      teamApi = api.TeamAPI.getApi();
      teams = teamApi && typeof teamApi.GetAllTeamsForPlayer === 'function'
        ? teamApi.GetAllTeamsForPlayer(player)
        : null;
      if (teams) {
        len = typeof teams.size === 'function' ? teams.size() : teams.length || 0;
        for (i = 0; i < len; i++) {
          team = typeof teams.get === 'function' ? teams.get(i) : teams[i];
          if (!team) continue;
          teamId = typeof team.getID === 'function' ? String(team.getID()) : String(i);
          if (seenTeamIds[teamId]) continue;
          seenTeamIds[teamId] = true;
          if (typeof team.hasBankAccount === 'function' && !team.hasBankAccount()) continue;
          if (typeof team.canAccessBankAccount === 'function' && !team.canAccessBankAccount(player)) {
            continue;
          }
          teamAccount = typeof team.getBankAccount === 'function' ? team.getBankAccount() : null;
          teamStorage =
            teamAccount && typeof teamAccount.getMoneyStorage === 'function'
              ? teamAccount.getMoneyStorage()
              : null;
          if (teamStorage && typeof teamStorage.extractMoney === 'function') {
            handlers.push(teamStorage);
          }
        }
      }
    }
  } catch (e3) {
    // Konta drużynowe niedostępne
  }

  return handlers;
}

function tryExtractCopperFromHandler(handler, api, copperAmount, simulate) {
  var reqVal = null;
  var remVal = null;
  var remCopper = 0;
  var extracted = 0;

  if (!handler || !api || !api.CoinValue || copperAmount <= 0) {
    return 0;
  }

  try {
    reqVal = api.CoinValue.fromNumber('main', Math.floor(copperAmount));
    if (!reqVal) return 0;
    remVal = handler.extractMoney(reqVal, Boolean(simulate));
    if (!remVal || (typeof remVal.isEmpty === 'function' && remVal.isEmpty())) {
      return Math.floor(copperAmount);
    }
    remCopper = typeof remVal.getCoreValue === 'function' ? Number(remVal.getCoreValue() || 0) : copperAmount;
    extracted = Math.floor(copperAmount) - Math.max(0, Math.floor(remCopper));
    return extracted > 0 ? extracted : 0;
  } catch (err) {
    return 0;
  }
}

/**
 * Atomowo pobiera dokładnie `cost` monet LC gracza w kolejności:
 *   1) wyposażony portfel LC (`MoneyAPI -> WalletHandler.extractMoney`),
 *   2) bank osobisty (`PlayerBankReference -> MoneyStorage.extractMoney`),
 *   3) dostępne konta bankowe drużyn (`TeamAPI -> MoneyStorage.extractMoney`),
 *   4) fizyczne monety, stosy (`coinpile_*`) i bloki (`coinblock_*`) w ekwipunku z wydaniem reszty.
 *
 * Przed pobraniem czegokolwiek wykonuje pełną symulację (`simulation = true`) + weryfikację
 * salda — nieudany zakup NIGDY nie pobiera ani jednej monety.
 */
function chargePlayerMoney(player, cost) {
  var target = Math.floor(Number(cost) || 0);
  var api = null;
  var handlers = null;
  var simRemaining = 0;
  var i = 0;
  var taken = 0;
  var invAvailable = 0;
  var remaining = 0;
  var inv = null;
  var size = 0;
  var collected = 0;
  var c = 0;
  var itemId = '';
  var itemVal = 0;
  var stack = null;
  var needed = 0;
  var take = 0;
  var change = 0;

  if (target <= 0) {
    return true;
  }
  if (!player) {
    return false;
  }

  api = getLightmansApiClasses();
  handlers = collectPlayerMoneyHandlers(player, api);

  // Faza 1: Symulacja (ZERO mutacji przed potwierdzeniem pełnego pokrycia kwoty)
  simRemaining = target;
  for (i = 0; i < handlers.length && simRemaining > 0; i++) {
    taken = tryExtractCopperFromHandler(handlers[i], api, simRemaining, true);
    simRemaining -= taken;
  }
  invAvailable = getInventoryCoinsCopper(player);
  if (simRemaining > invAvailable) {
    return false;
  }

  // Faza 2: Faktyczne pobranie (gwarantowane pełne pokrycie)
  remaining = target;
  for (i = 0; i < handlers.length && remaining > 0; i++) {
    taken = tryExtractCopperFromHandler(handlers[i], api, remaining, false);
    remaining -= taken;
  }

  if (remaining > 0 && player.inventory) {
    inv = player.inventory;
    size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
    collected = 0;

    for (c = 0; c < LC_ALL_MONEY_ITEMS_ASC.length && collected < remaining; c++) {
      itemId = LC_ALL_MONEY_ITEMS_ASC[c].id;
      itemVal = LC_ALL_MONEY_ITEMS_ASC[c].value;
      for (i = 0; i < size && collected < remaining; i++) {
        stack = inv.getItem(i);
        if (!stack || (typeof stack.isEmpty === 'function' && stack.isEmpty()) || String(stack.id) !== itemId) {
          continue;
        }
        needed = Math.ceil((remaining - collected) / itemVal);
        take = Math.min(Number(stack.count || 0), needed);
        if (take > 0) {
          stack.shrink(take);
          collected += take * itemVal;
        }
      }
    }

    change = collected - remaining;
    if (change > 0) {
      giveCoinsToPlayer(player, change);
    }
    remaining = Math.max(0, remaining - collected);
  }

  return remaining === 0;
}

/**
 * Czyta surową treść `config/halucynacje_economy/prices.json` (string lub null).
 */
function readPricesRawText(filePath) {
  var path = filePath || HALUCYNACJE_PRICES_FILE;
  var rawText = null;
  if (typeof JsonIO !== 'undefined' && typeof JsonIO.readString === 'function') {
    rawText = JsonIO.readString(path);
    if (rawText != null) {
      return String(rawText);
    }
  }
  return null;
}

/**
 * Czyści globalny cache `prices.json` (używane przy przeładowaniu ekonomii).
 */
function clearPricesJsonCache() {
  SHARED_PRICES_JSON_CACHE = null;
}

/**
 * Wczytuje i buforuje `config/halucynacje_economy/prices.json` jako czysty obiekt JS.
 * Używa `JsonIO.readString` + `JSON.parse`, aby uniknąć konwersji `java.util.Map` w KubeJS 7.2.
 */
function readPricesJson(forceReload) {
  var rawText = null;
  var parsed = null;

  if (SHARED_PRICES_JSON_CACHE && !forceReload) {
    return SHARED_PRICES_JSON_CACHE;
  }

  try {
    rawText = readPricesRawText(HALUCYNACJE_PRICES_FILE);
    if (rawText) {
      parsed = JSON.parse(rawText);
    } else if (typeof JsonIO !== 'undefined' && typeof JsonIO.read === 'function') {
      parsed = JsonIO.read(HALUCYNACJE_PRICES_FILE);
    }
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd wczytywania ${HALUCYNACJE_PRICES_FILE}: ${err}`);
    parsed = null;
  }

  if (parsed) {
    SHARED_PRICES_JSON_CACHE = parsed;
  }
  return parsed;
}

/**
 * Zwraca najwyższy odblokowany Etap (0..5), łącząc zapis globalny serwera (co-op)
 * oraz indywidualny zapis gracza (jeśli `player` został przekazany).
 */
function getCurrentUnlockedStage(player, server) {
  let highest = 0;
  for (let s = 1; s <= 5; s++) {
    const key = `stage_${s}`;
    let unlocked = false;
    if (server && server.persistentData) {
      const gs = server.persistentData.getCompound(GLOBAL_STAGES_KEY);
      if (gs && gs.getBoolean(key)) unlocked = true;
    }
    if (!unlocked && player && player.persistentData) {
      const ps = player.persistentData.getCompound(PLAYER_STAGES_KEY);
      if (ps && ps.getBoolean(key)) unlocked = true;
    }
    if (unlocked) highest = s;
  }
  return highest;
}

/**
 * Wysyła odpowiedź komendy OP/gracza w KubeJS 7.2 bez pułapki `ArrowFunction(0)`.
 */
function sendCommandFeedback(ctx, component) {
  try {
    if (ctx && ctx.source && typeof ctx.source.sendSuccess === 'function') {
      ctx.source.sendSuccess(component, true);
      return;
    }
  } catch (e) {
    // Fallback na player.tell poniżej
  }
  if (ctx && ctx.source && ctx.source.player && typeof ctx.source.player.tell === 'function') {
    ctx.source.player.tell(component);
  }
}
