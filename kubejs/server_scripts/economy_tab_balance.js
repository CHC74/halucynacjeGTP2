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

let TAB_BALANCE_OBJECTIVE_READY = false;
let TAB_BALANCE_TICK_COUNTER = 0;
let TAB_BALANCE_LAST_SCORES = {};

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
