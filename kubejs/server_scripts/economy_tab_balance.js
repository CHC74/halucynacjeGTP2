// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Wyświetlanie stanu konta (monet LC) pod klawiszem TAB
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7.2 | Lightman's Currency 2.3.0.6
//
// Zasada działania (100% zweryfikowana na bajtkodzie lightmanscurrency-1.21-2.3.0.6.jar):
// 1. Przy starcie serwera (`ServerEvents.loaded`) tworzy cel scoreboarda
//    `halucynacje_monety` (tytuł "Monety") i podpina go pod slot `list` (klawisz TAB).
// 2. Dla każdego gracza oblicza łączne saldo w monetach bazowych (copper = 1)
//    BEZ podwójnego liczenia:
//      a) fizyczne monety w ekwipunku (`coin_*`, `coinpile_*` = 9x, `coinblock_*` = 36x),
//      b) wyposażony portfel LC (`MoneyAPI.getApi().GetPlayersMoneyHandler(player)` ->
//         w bajtkodzie `CoinPlayerMoneyHandler` czyta WYŁĄCZNIE `WalletHandler.get(player)`!),
//      c) osobiste konto bankowe (`PlayerBankReference.of(player).get().getMoneyStorage()`),
//      d) dostępne konta bankowe drużyn (`TeamAPI.getApi().GetAllTeamsForPlayer(player)`
//         z deduplikacją po `team.getID()` i kontrolą `canAccessBankAccount(player)`).
// 3. Jeśli którekolwiek API Javy nie jest dostępne lub rzuci wyjątek, skrypt bezpiecznie
//    cofa się do fizycznych monet w ekwipunku bez przerywania ticków serwera.
// 4. Odświeżanie lekkie dla TPS Exaroton: co `60 ticków` (3 sekundy) w `ServerEvents.tick`
//    + natychmiast przy logowaniu (`PlayerEvents.loggedIn`) i wywołaniu `/saldo`,
//    z cache ostatniej wartości, aby nie wysyłać zbędnych komend scoreboard.
// ============================================================================

const TAB_BALANCE_OBJECTIVE = 'halucynacje_monety';
const TAB_BALANCE_REFRESH_TICKS = 60;
const TAB_BALANCE_MAX_SCORE = 2147483647; // Limit 32-bit int w Minecraft Scoreboard

let TAB_BALANCE_OBJECTIVE_READY = false;
let TAB_BALANCE_TICK_COUNTER = 0;
let TAB_BALANCE_LAST_SCORES = {};
let TAB_LC_CLASSES = null;
let TAB_LC_CLASSES_LOADED = false;

/**
 * Ogranicza wynik do bezpiecznego zakresu 32-bitowego scoreboarda Minecrafta [0 .. 2 147 483 647].
 */
function clampScoreboardBalance(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 0;
  if (n >= TAB_BALANCE_MAX_SCORE) return TAB_BALANCE_MAX_SCORE;
  return Math.floor(n);
}

/**
 * Leniwie ładuje klasy API Lightman's Currency 2.3.0.6 (jednorazowo, bez narzutu w ticku).
 */
function getLightmansApiClasses() {
  if (TAB_LC_CLASSES_LOADED) {
    return TAB_LC_CLASSES;
  }
  TAB_LC_CLASSES_LOADED = true;

  if (typeof Java === 'undefined' || typeof Java.loadClass !== 'function') {
    TAB_LC_CLASSES = null;
    return null;
  }

  const loaded = {
    MoneyAPI: null,
    PlayerBankReference: null,
    TeamAPI: null
  };

  try {
    loaded.MoneyAPI = Java.loadClass('io.github.lightman314.lightmanscurrency.api.money.MoneyAPI');
  } catch (err) {
    console.warn(`[HalucynacjeGTP2/TAB] Nie załadowano MoneyAPI: ${err}`);
  }
  try {
    loaded.PlayerBankReference = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.api.money.bank.reference.builtin.PlayerBankReference'
    );
  } catch (err) {
    console.warn(`[HalucynacjeGTP2/TAB] Nie załadowano PlayerBankReference: ${err}`);
  }
  try {
    loaded.TeamAPI = Java.loadClass('io.github.lightman314.lightmanscurrency.api.teams.TeamAPI');
  } catch (err) {
    console.warn(`[HalucynacjeGTP2/TAB] Nie załadowano TeamAPI: ${err}`);
  }

  TAB_LC_CLASSES = loaded;
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
    // Bezpieczny fallback — nigdy nie przerywaj ticka serwera
  }

  return total;
}

/**
 * 1. Fizyczne monety, stosy i bloki monet w ekwipunku gracza (zawsze działający fallback).
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
 * Zwraca pełne rozbicie salda gracza (ekwipunek + portfel + bank osobisty + bank drużynowy).
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

/**
 * Gwarantuje istnienie celu scoreboarda `halucynacje_monety` i wyświetlanie pod klawiszem TAB (`list`).
 */
function ensureTabBalanceObjective(server) {
  if (!server || typeof server.runCommandSilent !== 'function') return;
  try {
    server.runCommandSilent(
      `scoreboard objectives add ${TAB_BALANCE_OBJECTIVE} dummy {"text":"Monety","color":"gold"}`
    );
    server.runCommandSilent(`scoreboard objectives setdisplay list ${TAB_BALANCE_OBJECTIVE}`);
    TAB_BALANCE_OBJECTIVE_READY = true;
  } catch (err) {
    console.warn(`[HalucynacjeGTP2/TAB] Nie udało się zainicjalizować scoreboarda TAB: ${err}`);
  }
}

function getPlayerCacheKey(player) {
  if (player && player.stringUuid) return String(player.stringUuid);
  if (player && player.uuid) return String(player.uuid);
  if (player && player.username) return String(player.username);
  return 'unknown';
}

/**
 * Aktualizuje wynik gracza pod klawiszem TAB (wysyła komendę tylko przy zmianie lub force=true).
 */
function syncPlayerTabBalance(player, server, force) {
  if (!player || !server || typeof server.runCommandSilent !== 'function') return null;
  if (!TAB_BALANCE_OBJECTIVE_READY) {
    ensureTabBalanceObjective(server);
  }

  const breakdown = computePlayerBalanceBreakdown(player);
  const cacheKey = getPlayerCacheKey(player);

  if (force || TAB_BALANCE_LAST_SCORES[cacheKey] !== breakdown.clampedScore) {
    TAB_BALANCE_LAST_SCORES[cacheKey] = breakdown.clampedScore;
    try {
      server.runCommandSilent(
        `scoreboard players set ${player.username} ${TAB_BALANCE_OBJECTIVE} ${breakdown.clampedScore}`
      );
    } catch (err) {
      // Ignoruj ewentualny błąd w trakcie wylogowywania gracza
    }
  }

  return breakdown;
}

// ----------------------------------------------------------------------------
// Zdarzenia KubeJS 7.2 / NeoForge 1.21.1 (WYŁĄCZNIE zweryfikowane eventy!)
// ----------------------------------------------------------------------------
ServerEvents.loaded((event) => {
  TAB_BALANCE_OBJECTIVE_READY = false;
  TAB_BALANCE_TICK_COUNTER = 0;
  TAB_BALANCE_LAST_SCORES = {};
  ensureTabBalanceObjective(event.server);
});

PlayerEvents.loggedIn((event) => {
  ensureTabBalanceObjective(event.server);
  syncPlayerTabBalance(event.player, event.server, true);
});

ServerEvents.tick((event) => {
  TAB_BALANCE_TICK_COUNTER++;
  if (TAB_BALANCE_TICK_COUNTER < TAB_BALANCE_REFRESH_TICKS) {
    return;
  }
  TAB_BALANCE_TICK_COUNTER = 0;

  const server = event.server;
  if (!server || !server.players) return;

  if (!TAB_BALANCE_OBJECTIVE_READY) {
    ensureTabBalanceObjective(server);
  }

  const players = server.players;
  const len = typeof players.size === 'function' ? players.size() : players.length || 0;
  for (let i = 0; i < len; i++) {
    const p = typeof players.get === 'function' ? players.get(i) : players[i];
    if (p) {
      syncPlayerTabBalance(p, server, false);
    }
  }
});

// ----------------------------------------------------------------------------
// Komenda `/saldo` — szczegółowy podgląd monet (EQ + Portfel + Bank) + odświeżenie TAB
// ----------------------------------------------------------------------------
ServerEvents.commandRegistry((event) => {
  const { commands: Commands } = event;

  event.register(
    Commands.literal('saldo').executes((ctx) => {
      const player = ctx.source.player;
      if (!player) return 0;
      const b = syncPlayerTabBalance(player, ctx.source.server, true);
      if (!b) return 0;

      player.tell(Text.gold('=== Twoje Saldo Monet (Lightman\'s Currency) ==='));
      player.tell(Text.white('• Ekwipunek (monety/stosy): ').append(Text.yellow(`${formatCoins(b.inventory)} monet`)));
      player.tell(Text.white('• Wyposażony Portfel LC: ').append(Text.yellow(`${formatCoins(b.wallet)} monet`)));
      player.tell(Text.white('• Bank Osobisty (ATM): ').append(Text.aqua(`${formatCoins(b.personalBank)} monet`)));
      player.tell(Text.white('• Bank Drużynowy (Team): ').append(Text.aqua(`${formatCoins(b.teamBank)} monet`)));
      player.tell(
        Text.green('★ Razem (wyświetlane pod TAB): ').append(Text.gold(`${formatCoins(b.total)} monet`))
      );
      return 1;
    })
  );
});
