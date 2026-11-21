// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Silnik Rynku Hurtowego i Katalogu Progresji (Lightman's Currency)
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7
//
// Jedna spójna waluta (RFC #5): wszystkie transakcje używają wyłącznie fizycznych
// monet `lightmanscurrency:coin_*` (1 copper -> 10 iron -> 100 gold -> 1k emerald
// -> 10k diamond -> 100k netherite) i czytają jedno źródło prawdy:
//   `config/halucynacje_economy/prices.json`
//
// Komendy dostępne dla wszystkich graczy:
// - `/sprzedaj`             — sprzedaż hurtowa przedmiotu z głównej ręki (Tier 1–5)
// - `/sprzedaj all`         — hurtowa sprzedaż wszystkich towarów Tier 1–5 z ekwipunku
// - `/kup <alias> [ilość]`  — zakup starterów, Żetonów Etapów (`stage_1`..`stage_5`)
//                             oraz `creative_motor` (limit drużynowy)
// - `/sklep`                — otwiera prawdziwe, graficzne GUI Trading Terminala LC
// - `/sklep lista [0-5]`    — tekstowy katalog zakupowy (również `/sklep <0-5>`)
// - `/cennik [tier 1-5]`    — tabela skupu hurtowego i marży +20% na Wyspie-Rynku
// - `/ekonomia`             — panel Tycoona (etap, gotówka, statystyki eksportu)
//
// UWAGA DO WERYFIKACJI NA PIERWSZYM URUCHOMIENIU SERWERA 1.21.1:
// - [VERIFY ON 1.21.1 BOOT] Potwierdzić `Commands.argument('...', Arguments.STRING.create(event))`
//   / `Arguments.INTEGER.create(event)` w KubeJS 7 (NeoForge 1.21.1) oraz odczyt
//   `player.inventory.getContainerSize()` / `getItem(i)`.
// ============================================================================

const MARKET_PRICES_FILE = 'config/halucynacje_economy/prices.json';
const MARKET_GLOBAL_STAGES_KEY = 'halucynacje_global_stages';
const MARKET_PLAYER_STAGES_KEY = 'halucynacje_stages';
const MARKET_TEAM_LIMITS_KEY = 'halucynacje_team_buy_counts';
const MARKET_STATS_KEY = 'halucynacje_economy_stats';

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

let CACHED_MARKET = null;

function formatCoins(amount) {
  const n = Math.floor(Number(amount) || 0);
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

function readMarketPricesJson(filePath) {
  var rawText = null;
  if (typeof JsonIO !== 'undefined') {
    if (typeof JsonIO.readString === 'function') {
      rawText = JsonIO.readString(filePath);
      if (rawText) {
        return JSON.parse(String(rawText));
      }
    }
    if (typeof JsonIO.read === 'function') {
      return JsonIO.read(filePath);
    }
  }
  return null;
}

/**
 * Wczytuje i indeksuje `config/halucynacje_economy/prices.json`.
 * Używa `JsonIO.readString` + `JSON.parse` oraz pojedynczych deklaracji `var` na początku
 * funkcji, aby uniknąć błędu Rhino `TypeError: redeclaration of var cfg` oraz konwersji
 * Javowej `java.util.Map` w KubeJS 7.2 (Issue #31).
 */
function getMarketCatalog(forceReload) {
  if (CACHED_MARKET && !forceReload) {
    return CACHED_MARKET;
  }

  var catalog = {
    tier0: {},
    sellById: {},
    tiersList: [],
    buyByKey: {},
    buyList: [],
    stageTokens: []
  };
  var parsedCfg = null;
  var tier0 = null;
  var sellTiers = null;
  var tierKeys = null;
  var tokens = null;
  var buyItems = null;
  var i = 0;
  var t = 0;
  var j = 0;
  var tierKey = '';
  var tierObj = null;
  var tierItems = null;
  var parsedItems = null;
  var it = null;
  var parsed = null;
  var tok = null;
  var b = null;
  var entry = null;

  try {
    parsedCfg = readMarketPricesJson(MARKET_PRICES_FILE);
    if (parsedCfg) {
      tier0 = parsedCfg.tier_0_blocked || [];
      for (i = 0; i < tier0.length; i++) {
        entry = tier0[i];
        if (entry && entry.id) {
          catalog.tier0[String(entry.id)] = String(entry.reason || 'Surowiec zablokowany (Tier 0)');
        }
      }

      sellTiers = parsedCfg.sell_tiers || {};
      tierKeys = Object.keys(sellTiers);
      for (t = 0; t < tierKeys.length; t++) {
        tierKey = tierKeys[t];
        tierObj = sellTiers[tierKey];
        tierItems = (tierObj && tierObj.items) || [];
        parsedItems = [];
        for (j = 0; j < tierItems.length; j++) {
          it = tierItems[j];
          if (!it || !it.id) continue;
          parsed = {
            id: String(it.id),
            tierKey: tierKey,
            tierNum: t + 1,
            packSize: it.pack_size && Number(it.pack_size) > 1 ? Number(it.pack_size) : 1,
            wholesale: Number(it.wholesale_gui || 0),
            npc: Number(it.npc_shoppers || 0)
          };
          catalog.sellById[parsed.id] = parsed;
          parsedItems.push(parsed);
        }
        catalog.tiersList.push({
          tierNum: t + 1,
          key: tierKey,
          description: String((tierObj && tierObj.description) || tierKey),
          items: parsedItems
        });
      }

      tokens = parsedCfg.stage_tokens || [];
      for (i = 0; i < tokens.length; i++) {
        tok = tokens[i];
        if (!tok || !tok.id) continue;
        entry = {
          id: String(tok.id),
          alias: String(tok.alias || `stage_${tok.stage}`),
          stage: Number(tok.required_stage != null ? tok.required_stage : Math.max(0, Number(tok.stage) - 1)),
          unlocksStage: Number(tok.stage || i + 1),
          buyPrice: Number(tok.buy_price || 0),
          teamLimit: 0,
          isStageToken: true,
          note: String(tok.name || tok.id)
        };
        catalog.stageTokens.push(entry);
        catalog.buyList.push(entry);
        catalog.buyByKey[entry.alias.toLowerCase()] = entry;
        catalog.buyByKey[entry.id.toLowerCase()] = entry;
      }

      buyItems = parsedCfg.buy_catalog || [];
      for (i = 0; i < buyItems.length; i++) {
        b = buyItems[i];
        if (!b || !b.id) continue;
        entry = {
          id: String(b.id),
          alias: String(b.alias || String(b.id).split(':')[1] || b.id),
          stage: Number(b.stage || 0),
          buyPrice: Number(b.buy_price || 0),
          teamLimit: Number(b.team_limit || 0),
          isStageToken: false,
          note: String(b.note || '')
        };
        catalog.buyList.push(entry);
        catalog.buyByKey[entry.alias.toLowerCase()] = entry;
        catalog.buyByKey[entry.id.toLowerCase()] = entry;
      }
    }
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd wczytywania ${MARKET_PRICES_FILE}: ${err}`);
  }

  CACHED_MARKET = catalog;
  return catalog;
}

function getCurrentUnlockedStage(player, server) {
  let highest = 0;
  for (let s = 1; s <= 5; s++) {
    const key = `stage_${s}`;
    let unlocked = false;
    if (server && server.persistentData) {
      const gs = server.persistentData.getCompound(MARKET_GLOBAL_STAGES_KEY);
      if (gs && gs.getBoolean(key)) unlocked = true;
    }
    if (!unlocked && player && player.persistentData) {
      const ps = player.persistentData.getCompound(MARKET_PLAYER_STAGES_KEY);
      if (ps && ps.getBoolean(key)) unlocked = true;
    }
    if (unlocked) highest = s;
  }
  return highest;
}

function getInventoryCoinBalance(player) {
  if (!player || !player.inventory) return 0;
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
  let total = 0;
  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty()) continue;
    const val = LC_COIN_VALUES[String(stack.id)];
    if (val) {
      total += val * stack.count;
    }
  }
  return total;
}

function giveCoinsToPlayer(player, amount) {
  const stacks = splitIntoCoinStacks(amount);
  for (let i = 0; i < stacks.length; i++) {
    player.give(Item.of(stacks[i].id, stacks[i].count));
  }
}

/**
 * Pobiera dokładnie `cost` monet LC z ekwipunku gracza i automatycznie wydaje resztę.
 * Zwraca true po sukcesie lub false, gdy gracz ma za mało monet w ekwipunku.
 */
function chargePlayerCoins(player, cost) {
  const balance = getInventoryCoinBalance(player);
  if (balance < cost) {
    return false;
  }

  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
  let collected = 0;

  // Zbieramy monety od najmniejszych nominałów, aż uzbieramy >= cost
  const ascCoins = LC_COINS.slice().reverse();
  for (let c = 0; c < ascCoins.length && collected < cost; c++) {
    const coinId = ascCoins[c].id;
    const coinVal = ascCoins[c].value;
    for (let i = 0; i < size && collected < cost; i++) {
      const stack = inv.getItem(i);
      if (!stack || stack.isEmpty() || String(stack.id) !== coinId) continue;
      const needed = Math.ceil((cost - collected) / coinVal);
      const take = Math.min(stack.count, needed);
      stack.shrink(take);
      collected += take * coinVal;
    }
  }

  const change = collected - cost;
  if (change > 0) {
    giveCoinsToPlayer(player, change);
  }
  return true;
}

function recordExportStats(server, earnedCoins, itemsCount) {
  if (!server || !server.persistentData) return;
  const stats = server.persistentData.getCompound(MARKET_STATS_KEY);
  const prevEarned = Number(stats.getLong('total_earned') || 0);
  const prevItems = Number(stats.getLong('total_items_sold') || 0);
  stats.putLong('total_earned', prevEarned + earnedCoins);
  stats.putLong('total_items_sold', prevItems + itemsCount);
  server.persistentData.put(MARKET_STATS_KEY, stats);
}

function getTeamBuyCount(server, itemId) {
  if (!server || !server.persistentData) return 0;
  const counts = server.persistentData.getCompound(MARKET_TEAM_LIMITS_KEY);
  return Number(counts.getInt(itemId) || 0);
}

function addTeamBuyCount(server, itemId, delta) {
  if (!server || !server.persistentData) return;
  const counts = server.persistentData.getCompound(MARKET_TEAM_LIMITS_KEY);
  counts.putInt(itemId, Number(counts.getInt(itemId) || 0) + delta);
  server.persistentData.put(MARKET_TEAM_LIMITS_KEY, counts);
}

function sellSingleStack(stack, catalog) {
  if (!stack || stack.isEmpty()) {
    return { status: 'empty' };
  }
  const itemId = String(stack.id);
  if (catalog.tier0[itemId]) {
    return { status: 'blocked', itemId: itemId, reason: catalog.tier0[itemId] };
  }
  const def = catalog.sellById[itemId];
  if (!def || def.wholesale <= 0) {
    return { status: 'not_buyable', itemId: itemId };
  }

  const packs = Math.floor(stack.count / def.packSize);
  if (packs <= 0) {
    return {
      status: 'too_few',
      itemId: itemId,
      packSize: def.packSize,
      have: stack.count
    };
  }

  const soldItems = packs * def.packSize;
  const payout = packs * def.wholesale;
  stack.shrink(soldItems);
  return {
    status: 'sold',
    itemId: itemId,
    soldItems: soldItems,
    packs: packs,
    payout: payout,
    npcBonusPotential: packs * (def.npc - def.wholesale)
  };
}

function handleSellHand(player, server) {
  const catalog = getMarketCatalog(false);
  const hand = player.mainHandItem;
  const res = sellSingleStack(hand, catalog);

  if (res.status === 'empty') {
    player.tell(Text.yellow('[Rynek] Trzymaj w głównej ręce towar fabryczny (Tier 1–5) albo wpisz /sprzedaj all.'));
    return 0;
  }
  if (res.status === 'blocked') {
    player.tell(
      Text.red(`[Ochrona Ekonomii] ${res.itemId} to surowiec Tier 0 (${res.reason}) — skup wynosi 0 monet. `)
        .append(Text.gray('Przetwórz surowce w fabryce Create!'))
    );
    return 0;
  }
  if (res.status === 'not_buyable') {
    player.tell(
      Text.yellow(`[Rynek] ${res.itemId} nie znajduje się na liście skupu hurtowego. Sprawdź /cennik [1-5].`)
    );
    return 0;
  }
  if (res.status === 'too_few') {
    player.tell(
      Text.yellow(
        `[Rynek] ${res.itemId} skupowane jest w pakietach po ${res.packSize} szt. (masz ${res.have}).`
      )
    );
    return 0;
  }

  giveCoinsToPlayer(player, res.payout);
  recordExportStats(server, res.payout, res.soldItems);

  player.tell(
    Text.green(`[Rynek Hurtowy] Sprzedano ${res.soldItems}x ${res.itemId} za `)
      .append(Text.gold(`${formatCoins(res.payout)} monet`))
      .append(Text.green('! '))
      .append(
        Text.gray(
          `(Na Wyspie-Rynku w sklepach NPC zarobiłbyś ok. +${formatCoins(res.npcBonusPotential)} monet więcej!)`
        )
      )
  );
  return 1;
}

function handleSellAll(player, server) {
  const catalog = getMarketCatalog(false);
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;

  let totalPayout = 0;
  let totalItems = 0;
  let totalBonusPotential = 0;
  let blockedSkipped = 0;

  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty()) continue;
    const res = sellSingleStack(stack, catalog);
    if (res.status === 'sold') {
      totalPayout += res.payout;
      totalItems += res.soldItems;
      totalBonusPotential += res.npcBonusPotential;
    } else if (res.status === 'blocked') {
      blockedSkipped++;
    }
  }

  if (totalPayout <= 0) {
    player.tell(
      Text.yellow(
        `[Rynek Hurtowy] Brak przetworzonych towarów Tier 1–5 do sprzedaży w ekwipunku${blockedSkipped > 0 ? ' (surowce Tier 0 zostały pominięte)' : ''}. Sprawdź /cennik 1.`
      )
    );
    return 0;
  }

  giveCoinsToPlayer(player, totalPayout);
  recordExportStats(server, totalPayout, totalItems);

  player.tell(
    Text.green(`[Rynek Hurtowy] Wyeksportowano łącznie ${totalItems} szt. towarów za `)
      .append(Text.gold(`${formatCoins(totalPayout)} monet`))
      .append(Text.green('! '))
      .append(Text.gray(`(Premia na Wyspie-Rynku NPC: +${formatCoins(totalBonusPotential)} monet)`))
  );
  return totalItems;
}

function handleBuy(player, server, rawKey, rawQty) {
  const catalog = getMarketCatalog(false);
  const key = String(rawKey || '').trim().toLowerCase();
  const qty = Math.max(1, Math.min(64, Math.floor(Number(rawQty) || 1)));
  const entry = catalog.buyByKey[key];

  if (!entry) {
    player.tell(
      Text.red(`[Sklep] Nieznany towar "${rawKey}". Wpisz `)
        .append(Text.aqua('/sklep'))
        .append(Text.red(' aby zobaczyć dostępne aliasy.'))
    );
    return 0;
  }

  const currentStage = getCurrentUnlockedStage(player, server);
  if (currentStage < entry.stage) {
    player.tell(
      Text.red(
        `[Sklep] Ten towar wymaga odblokowanego Etapu ${entry.stage} (obecny etap drużyny: ${currentStage}).`
      )
    );
    return 0;
  }

  if (entry.teamLimit > 0) {
    const bought = getTeamBuyCount(server, entry.id);
    if (bought + qty > entry.teamLimit) {
      player.tell(
        Text.red(
          `[Sklep] Limit drużynowy dla ${entry.alias} to ${entry.teamLimit} szt. (wykorzystano: ${bought}).`
        )
      );
      return 0;
    }
  }

  const totalCost = entry.buyPrice * qty;
  const balance = getInventoryCoinBalance(player);
  if (balance < totalCost) {
    player.tell(
      Text.red(
        `[Sklep] Za mało monet w ekwipunku! Koszt: ${formatCoins(totalCost)} monet, masz: ${formatCoins(balance)} monet. `
      ).append(Text.gray('(Wypłać monety z bankomatu ATM lub portfela Lightman\'s Currency do ekwipunku.)'))
    );
    return 0;
  }

  if (!chargePlayerCoins(player, totalCost)) {
    player.tell(Text.red('[Sklep] Błąd pobierania monet z ekwipunku — transakcja anulowana.'));
    return 0;
  }

  player.give(Item.of(entry.id, qty));
  if (entry.teamLimit > 0) {
    addTeamBuyCount(server, entry.id, qty);
  }

  player.tell(
    Text.green(`[Sklep] Kupiono ${qty}x `)
      .append(Text.aqua(entry.alias))
      .append(Text.green(' za '))
      .append(Text.gold(`${formatCoins(totalCost)} monet`))
      .append(Text.green('!'))
  );
  return qty;
}

let CACHED_TERMINAL_CLASSES = null;
let CACHED_TERMINAL_CLASSES_LOADED = false;

function getTerminalGuiClasses() {
  if (CACHED_TERMINAL_CLASSES_LOADED) {
    return CACHED_TERMINAL_CLASSES;
  }
  CACHED_TERMINAL_CLASSES_LOADED = true;

  if (typeof Java === 'undefined' || typeof Java.loadClass !== 'function') {
    CACHED_TERMINAL_CLASSES = null;
    return null;
  }

  const loaded = { TerminalMenuProvider: null, SimpleValidator: null };
  try {
    loaded.TerminalMenuProvider = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.common.menus.providers.TerminalMenuProvider'
    );
    loaded.SimpleValidator = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.common.menus.validation.types.SimpleValidator'
    );
  } catch (err) {
    console.warn(`[HalucynacjeGTP2] Nie udało się załadować klas Trading Terminala LC: ${err}`);
  }

  CACHED_TERMINAL_CLASSES = loaded;
  return loaded;
}

function safeTellPlayer(player, component) {
  if (!player || typeof player.tell !== 'function') {
    return;
  }
  try {
    player.tell(component);
  } catch (err) {
    console.warn(`[HalucynacjeGTP2] safeTellPlayer nie powiódł się: ${err}`);
  }
}

/**
 * Otwiera natywne graficzne GUI Trading Terminala Lightman's Currency (1.21-2.3.0.6)
 * z sieciowymi sklepami z `config/lightmanscurrency/PersistentTraders.json`.
 *
 * Zweryfikowane w bajtkodzie `CommandTerminal`, `TerminalMenuProvider` i `MinecraftServerKJS`:
 *   1) Bezpośrednio: `TerminalMenuProvider.OpenMenu(player, SimpleValidator.NULL)`
 *   2) Fallback przez natywny dispatcher Brigadiera `/lcterminal` (zwracający prawdziwy `int`,
 *      ponieważ `server.runCommandSilent(...)` w KubeJS 7.2 zwraca `void`!).
 */
function openTradingTerminalGui(player, server, source) {
  try {
    const classes = getTerminalGuiClasses();
    if (
      classes &&
      classes.TerminalMenuProvider &&
      classes.SimpleValidator &&
      classes.TerminalMenuProvider.OpenMenu &&
      classes.SimpleValidator.NULL
    ) {
      classes.TerminalMenuProvider.OpenMenu(player, classes.SimpleValidator.NULL);
      return true;
    }
  } catch (err) {
    console.warn(`[HalucynacjeGTP2] TerminalMenuProvider.OpenMenu nie powiodło się: ${err}`);
  }

  try {
    const dispatcher =
      server && server.commands && typeof server.commands.getDispatcher === 'function'
        ? server.commands.getDispatcher()
        : server && server.commands && server.commands.dispatcher
          ? server.commands.dispatcher
          : null;
    if (dispatcher && typeof dispatcher.execute === 'function') {
      let cmdSource = null;
      if (source && typeof source.withPermission === 'function') {
        cmdSource = source.withPermission(2);
      } else if (player && typeof player.createCommandSourceStack === 'function') {
        cmdSource = player.createCommandSourceStack().withPermission(2);
      }
      if (cmdSource && typeof cmdSource.withSuppressedOutput === 'function') {
        cmdSource = cmdSource.withSuppressedOutput();
      }
      if (cmdSource) {
        const res = Number(dispatcher.execute('lcterminal', cmdSource) || 0);
        if (res > 0) {
          return true;
        }
      }
    }
  } catch (err2) {
    console.warn(`[HalucynacjeGTP2] Fallback Brigadier /lcterminal nie powiódł się: ${err2}`);
  }

  return false;
}

function handleOpenShopGui(player, server, source) {
  try {
    if (openTradingTerminalGui(player, server, source)) {
      return 1;
    }
    safeTellPlayer(
      player,
      Text.yellow(
        '[Sklep] Nie udało się otworzyć GUI Trading Terminala — wpisz /lcterminal, /sklep lista albo użyj Trading Terminala na Wyspie-Rynku.'
      )
    );
    return 1;
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd podczas wykonywania /sklep: ${err}`);
    safeTellPlayer(
      player,
      Text.red('[Sklep] Wystąpił błąd otwierania sklepu — spróbuj /lcterminal lub /sklep lista.')
    );
    return 0;
  }
}

function handleShowShop(player, server, requestedStage) {
  try {
    const catalog = getMarketCatalog(false);
    const currentStage = getCurrentUnlockedStage(player, server);
    const filterStage = requestedStage != null ? Number(requestedStage) : null;

    safeTellPlayer(
      player,
      Text.gold(
        `=== Katalog Sklepu (Twój Etap: ${currentStage}${filterStage != null ? `, widok Etapu ${filterStage}` : ''}) ===`
      )
    );

    let shown = 0;
    for (let i = 0; i < catalog.buyList.length; i++) {
      const entry = catalog.buyList[i];
      if (filterStage != null) {
        if (entry.stage !== filterStage) continue;
      } else if (entry.stage > currentStage) {
        continue;
      }

      const prefix = entry.stage > currentStage ? `[Wymaga Stage ${entry.stage}] ` : `[S${entry.stage}] `;
      const lockTag = entry.stage > currentStage ? Text.red(prefix) : Text.green(prefix);
      const limitNote = entry.teamLimit > 0 ? ` (limit ${entry.teamLimit})` : '';
      const aliasStr = String(entry.alias || entry.id || '?');
      const noteStr = String(entry.note || '');
      safeTellPlayer(
        player,
        lockTag
          .append(Text.aqua(`/kup ${aliasStr}`))
          .append(Text.white(` — ${formatCoins(entry.buyPrice)} monet`))
          .append(Text.gray(` | ${noteStr}${limitNote}`))
      );
      shown++;
    }

    if (shown === 0) {
      safeTellPlayer(player, Text.gray('Brak pozycji dla tego etapu. Sprawdź /sklep 0..5.'));
    }
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd w handleShowShop: ${err}`);
    safeTellPlayer(player, Text.red('[Sklep] Błąd wyświetlania katalogu tekstowego.'));
  }
}

function handleShowPrices(player, requestedTier) {
  const catalog = getMarketCatalog(false);
  const tierNum = Math.max(1, Math.min(5, Number(requestedTier) || 1));
  const tier = catalog.tiersList[tierNum - 1];

  if (!tier) {
    player.tell(Text.red('[Cennik] Wybierz Tier od 1 do 5: /cennik 1 .. /cennik 5'));
    return;
  }

  player.tell(Text.gold(`=== Cennik Skupu — Tier ${tier.tierNum} (${tier.description}) ===`));
  for (let i = 0; i < tier.items.length; i++) {
    const it = tier.items[i];
    const packLabel = it.packSize > 1 ? ` (pakiet x${it.packSize})` : '';
    player.tell(
      Text.white(`• ${it.id}${packLabel}: `)
        .append(Text.yellow(`hurt ${formatCoins(it.wholesale)}`))
        .append(Text.gray(' | '))
        .append(Text.green(`Rynek NPC ~${formatCoins(it.npc)} (+20%)`))
    );
  }
  player.tell(Text.gray('Użyj /sprzedaj (ręka) lub /sprzedaj all (ekwipunek). Surowce Tier 0 = 0 monet.'));
}

function handleShowEconomyStatus(player, server) {
  const catalog = getMarketCatalog(false);
  const currentStage = getCurrentUnlockedStage(player, server);
  const cash = getInventoryCoinBalance(player);
  const stats = server && server.persistentData ? server.persistentData.getCompound(MARKET_STATS_KEY) : null;
  const totalEarned = stats ? Number(stats.getLong('total_earned') || 0) : 0;
  const totalItems = stats ? Number(stats.getLong('total_items_sold') || 0) : 0;

  const nextToken = catalog.stageTokens[currentStage] || null;
  player.tell(Text.gold('=== Panel Ekonomii HalucynacjeGTP2 (Tycoon) ==='));
  player.tell(Text.white(`• Aktualny Etap drużyny: `).append(Text.aqua(`Stage ${currentStage} / 5`)));
  player.tell(Text.white(`• Gotówka LC w ekwipunku: `).append(Text.gold(`${formatCoins(cash)} monet`)));
  player.tell(
    Text.white(`• Eksport hurtowy drużyny: `)
      .append(Text.green(`${formatCoins(totalEarned)} monet`))
      .append(Text.gray(` (${formatCoins(totalItems)} szt. towarów)`))
  );
  if (nextToken) {
    const missing = Math.max(0, nextToken.buyPrice - cash);
    player.tell(
      Text.white(`• Kolejny cel: `)
        .append(Text.aqua(`${nextToken.note}`))
        .append(Text.white(` — koszt `))
        .append(Text.gold(`${formatCoins(nextToken.buyPrice)} monet`))
        .append(Text.gray(` (komenda: /kup ${nextToken.alias}, w kieszeni brakuje ${formatCoins(missing)})`))
    );
  } else {
    player.tell(
      Text.gold('★ Osiągnięto Stage 5! Opcjonalny cel flex: /kup creative_motor (2 000 000 monet, limit 2 szt.).')
    );
  }
  player.tell(
    Text.gray(
      'Komendy: /sklep (GUI) | /sklep lista [0-5] | /lcterminal | /sprzedaj [all] | /kup <alias> [ilość] | /cennik [1-5]'
    )
  );
}

// ----------------------------------------------------------------------------
// Rejestracja komend ekonomicznych (KubeJS 7 / NeoForge 1.21.1)
// ----------------------------------------------------------------------------
ServerEvents.commandRegistry((event) => {
  const { commands: Commands, arguments: Arguments } = event;

  event.register(
    Commands.literal('sprzedaj')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        return handleSellHand(player, ctx.source.server);
      })
      .then(
        Commands.literal('all').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleSellAll(player, ctx.source.server);
        })
      )
  );

  event.register(
    Commands.literal('kup').then(
      Commands.argument('towar', Arguments.STRING.create(event))
        .executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          const key = Arguments.STRING.getResult(ctx, 'towar');
          return handleBuy(player, ctx.source.server, key, 1);
        })
        .then(
          Commands.argument('ilosc', Arguments.INTEGER.create(event)).executes((ctx) => {
            const player = ctx.source.player;
            if (!player) return 0;
            const key = Arguments.STRING.getResult(ctx, 'towar');
            const qty = Arguments.INTEGER.getResult(ctx, 'ilosc');
            return handleBuy(player, ctx.source.server, key, qty);
          })
        )
    )
  );

  event.register(
    Commands.literal('sklep')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        return handleOpenShopGui(player, ctx.source.server, ctx.source);
      })
      .then(
        Commands.literal('lista')
          .executes((ctx) => {
            const player = ctx.source.player;
            if (!player) return 0;
            handleShowShop(player, ctx.source.server, null);
            return 1;
          })
          .then(
            Commands.argument('etap', Arguments.INTEGER.create(event)).executes((ctx) => {
              const player = ctx.source.player;
              if (!player) return 0;
              const stage = Arguments.INTEGER.getResult(ctx, 'etap');
              handleShowShop(player, ctx.source.server, stage);
              return 1;
            })
          )
      )
      .then(
        Commands.literal('cennik')
          .executes((ctx) => {
            const player = ctx.source.player;
            if (!player) return 0;
            handleShowPrices(player, 1);
            return 1;
          })
          .then(
            Commands.argument('tier', Arguments.INTEGER.create(event)).executes((ctx) => {
              const player = ctx.source.player;
              if (!player) return 0;
              const tier = Arguments.INTEGER.getResult(ctx, 'tier');
              handleShowPrices(player, tier);
              return 1;
            })
          )
      )
      .then(
        Commands.argument('etap', Arguments.INTEGER.create(event)).executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          const stage = Arguments.INTEGER.getResult(ctx, 'etap');
          handleShowShop(player, ctx.source.server, stage);
          return 1;
        })
      )
  );

  event.register(
    Commands.literal('cennik')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        handleShowPrices(player, 1);
        return 1;
      })
      .then(
        Commands.argument('tier', Arguments.INTEGER.create(event)).executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          const tier = Arguments.INTEGER.getResult(ctx, 'tier');
          handleShowPrices(player, tier);
          return 1;
        })
      )
  );

  event.register(
    Commands.literal('ekonomia').executes((ctx) => {
      const player = ctx.source.player;
      if (!player) return 0;
      handleShowEconomyStatus(player, ctx.source.server);
      return 1;
    })
  );

  // Komenda OP do przeładowania cennika z pliku JSON bez restartu serwera
  event.register(
    Commands.literal('halucynacje_reload_economy')
      .requires((src) => src.hasPermission(2))
      .executes((ctx) => {
        const cat = getMarketCatalog(true);
        const msg = Text.green(
          `[HalucynacjeGTP2] Przeładowano prices.json (${Object.keys(cat.sellById).length} skup, ${cat.buyList.length} sklep, ${Object.keys(cat.tier0).length} blokad Tier 0).`
        );
        try {
          if (ctx && ctx.source && typeof ctx.source.sendSuccess === 'function') {
            ctx.source.sendSuccess(msg, true);
          } else if (ctx && ctx.source && ctx.source.player) {
            ctx.source.player.tell(msg);
          }
        } catch (e) {
          if (ctx && ctx.source && ctx.source.player) ctx.source.player.tell(msg);
        }
        return 1;
      })
  );
});
