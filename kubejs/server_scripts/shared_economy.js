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

let SHARED_PRICES_JSON_CACHE = null;

/**
 * Formatuje dodatnią liczbę monet z odstępem co 3 cyfry (np. "1 000 000").
 */
function formatCoins(amount) {
  const n = Math.max(0, Math.floor(Number(amount) || 0));
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
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
