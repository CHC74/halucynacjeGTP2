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
// [VERIFIED ON NEOFORGE 21.1.267 CI] (`server-boot`, #59):
// - Rejestracja komend z `Commands.argument(..., Arguments.STRING.create(event))`
//   i `Arguments.INTEGER.create(event)` oraz `/halucynacje_reload_economy` przeszły
//   z 0 błędów KubeJS na NeoForge 21.1.267; odczyt ekwipunku/portfela pokryty przez
//   `scripts/test_kubejs_logic.mjs` i `scripts/test_tab_balance.mjs` (interaktywne
//   kliknięcia GUI klienta w `docs/PLAYTEST_CHECKLIST.md`).
// ============================================================================

const MARKET_TEAM_LIMITS_KEY = 'halucynacje_team_buy_counts';
const MARKET_STATS_KEY = 'halucynacje_economy_stats';

let CACHED_MARKET = null;

/**
 * Wczytuje i indeksuje `config/halucynacje_economy/prices.json` (przez wspólny `readPricesJson` z `shared_economy.js`).
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
    buyById: {},
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
  var tierSellStage = 0;
  var tierItems = null;
  var parsedItems = null;
  var it = null;
  var parsed = null;
  var tok = null;
  var b = null;
  var buyCount = 1;
  var entry = null;

  try {
    parsedCfg = readPricesJson(Boolean(forceReload));
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
        tierSellStage = resolveItemSellStage(null, tierObj, t + 1);
        tierItems = (tierObj && tierObj.items) || [];
        parsedItems = [];
        for (j = 0; j < tierItems.length; j++) {
          it = tierItems[j];
          if (!it || !it.id) continue;
          parsed = {
            id: String(it.id),
            tierKey: tierKey,
            tierNum: t + 1,
            sellStage: resolveItemSellStage(it, tierObj, t + 1),
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
          sellStage: tierSellStage,
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
          category: 'etapy',
          stage: Number(tok.required_stage != null ? tok.required_stage : Math.max(0, Number(tok.stage) - 1)),
          unlocksStage: Number(tok.stage || i + 1),
          buyPrice: Number(tok.buy_price || 0),
          count: 1,
          teamLimit: 0,
          isStageToken: true,
          note: String(tok.name || tok.id)
        };
        catalog.stageTokens.push(entry);
        catalog.buyList.push(entry);
        catalog.buyById[entry.id] = entry;
        catalog.buyByKey[entry.alias.toLowerCase()] = entry;
        catalog.buyByKey[entry.id.toLowerCase()] = entry;
      }

      buyItems = parsedCfg.buy_catalog || [];
      for (i = 0; i < buyItems.length; i++) {
        b = buyItems[i];
        if (!b || !b.id) continue;
        buyCount = b.count != null && Number(b.count) > 1 ? Math.floor(Number(b.count)) : 1;
        entry = {
          id: String(b.id),
          alias: String(b.alias || String(b.id).split(':')[1] || b.id),
          category: String(b.category || 'inne'),
          stage: Number(b.stage || 0),
          buyPrice: Number(b.buy_price || 0),
          count: buyCount,
          teamLimit: Number(b.team_limit || 0),
          isStageToken: false,
          note: String(b.note || '')
        };
        catalog.buyList.push(entry);
        catalog.buyById[entry.id] = entry;
        catalog.buyByKey[entry.alias.toLowerCase()] = entry;
        catalog.buyByKey[entry.id.toLowerCase()] = entry;
      }
    }
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd wczytywania ${HALUCYNACJE_PRICES_FILE}: ${err}`);
  }

  CACHED_MARKET = catalog;
  return catalog;
}

function getInventoryCoinBalance(player) {
  return getInventoryCoinsCopper(player);
}

function chargePlayerCoins(player, cost) {
  return chargePlayerMoney(player, cost);
}

const TYCOON_MILESTONES_KEY = 'halucynacje_tycoon_milestones';
const TYCOON_EXPORT_BY_ITEM_KEY = 'halucynacje_export_by_item';
const TYCOON_EXPORT_BY_PLAYER_KEY = 'halucynacje_export_by_player';
const TYCOON_EXPORT_MILESTONES = [
  { threshold: 10000, title: 'Pierwsze 10 000 monet eksportu — Mała Manufaktura!' },
  { threshold: 50000, title: '50 000 monet eksportu — Rozpędzona Fabryka!' },
  { threshold: 100000, title: '100 000 monet eksportu — Zakład Przemysłowy!' },
  { threshold: 250000, title: '250 000 monet eksportu — Potęga Logistyczna!' },
  { threshold: 500000, title: '500 000 monet eksportu — Pół Miliona Tycoona!' },
  { threshold: 1000000, title: '1 000 000 monet eksportu — MILIONERZY HALUCYNACJEGTP2!' }
];

function readStatsJsonMap(server, key) {
  var raw = '';
  var parsed = null;
  if (!server || !server.persistentData) return {};
  try {
    raw = String(server.persistentData.getString(key) || '');
    if (raw) {
      parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (err) {
    // Ignoruj uszkodzony wpis
  }
  return {};
}

function writeStatsJsonMap(server, key, mapObj) {
  if (!server || !server.persistentData) return;
  try {
    server.persistentData.putString(key, JSON.stringify(mapObj || {}));
  } catch (err) {
    // Ignoruj błąd zapisu
  }
}

function checkAndBroadcastTycoonMilestones(server, newTotalEarned) {
  var reachedTag = null;
  var i = 0;
  var m = null;
  var flagKey = '';
  var triggered = [];

  if (!server || !server.persistentData || newTotalEarned <= 0) {
    return triggered;
  }

  reachedTag = server.persistentData.getCompound(TYCOON_MILESTONES_KEY);
  for (i = 0; i < TYCOON_EXPORT_MILESTONES.length; i++) {
    m = TYCOON_EXPORT_MILESTONES[i];
    flagKey = 'm_' + String(m.threshold);
    if (newTotalEarned >= m.threshold && !reachedTag.getBoolean(flagKey)) {
      reachedTag.putBoolean(flagKey, true);
      triggered.push(m);
      if (typeof server.tell === 'function') {
        server.tell(
          Text.gold('🏆 [KAMIEŃ MILOWY TYCOONA] ')
            .append(Text.aqua(m.title))
            .append(Text.gray(` (łącznie: ${formatCoins(newTotalEarned)} monet • zobacz /ekonomia top)`))
        );
      }
      if (typeof server.runCommandSilent === 'function') {
        try {
          server.runCommandSilent(
            'execute as @a at @s run playsound minecraft:entity.player.levelup master @s ~ ~ ~ 0.6 1.0'
          );
        } catch (errSnd) {
          // Dźwięk jest opcjonalny
        }
      }
    }
  }

  if (triggered.length > 0) {
    server.persistentData.put(TYCOON_MILESTONES_KEY, reachedTag);
  }
  return triggered;
}

function recordExportStats(server, earnedCoins, itemsCount, exporterLabel, itemBreakdown) {
  var stats = null;
  var prevEarned = 0;
  var prevItems = 0;
  var newEarned = 0;
  var byPlayer = null;
  var pKey = '';
  var pEntry = null;
  var byItem = null;
  var i = 0;
  var row = null;
  var iKey = '';
  var iEntry = null;

  if (!server || !server.persistentData) return [];

  stats = server.persistentData.getCompound(MARKET_STATS_KEY);
  prevEarned = Number(stats.getLong('total_earned') || 0);
  prevItems = Number(stats.getLong('total_items_sold') || 0);
  newEarned = prevEarned + Math.max(0, Math.floor(Number(earnedCoins) || 0));
  stats.putLong('total_earned', newEarned);
  stats.putLong('total_items_sold', prevItems + Math.max(0, Math.floor(Number(itemsCount) || 0)));
  server.persistentData.put(MARKET_STATS_KEY, stats);

  if (exporterLabel && earnedCoins > 0) {
    byPlayer = readStatsJsonMap(server, TYCOON_EXPORT_BY_PLAYER_KEY);
    pKey = String(exporterLabel);
    pEntry = byPlayer[pKey] || { coins: 0, items: 0 };
    pEntry.coins = Number(pEntry.coins || 0) + Math.floor(Number(earnedCoins) || 0);
    pEntry.items = Number(pEntry.items || 0) + Math.floor(Number(itemsCount) || 0);
    byPlayer[pKey] = pEntry;
    writeStatsJsonMap(server, TYCOON_EXPORT_BY_PLAYER_KEY, byPlayer);
  }

  if (Array.isArray(itemBreakdown) && itemBreakdown.length > 0) {
    byItem = readStatsJsonMap(server, TYCOON_EXPORT_BY_ITEM_KEY);
    for (i = 0; i < itemBreakdown.length; i++) {
      row = itemBreakdown[i];
      if (!row || !row.itemId) continue;
      iKey = String(row.itemId);
      iEntry = byItem[iKey] || { coins: 0, items: 0 };
      iEntry.coins = Number(iEntry.coins || 0) + Math.floor(Number(row.payout || 0));
      iEntry.items = Number(iEntry.items || 0) + Math.floor(Number(row.soldItems || 0));
      byItem[iKey] = iEntry;
    }
    writeStatsJsonMap(server, TYCOON_EXPORT_BY_ITEM_KEY, byItem);
  }

  return checkAndBroadcastTycoonMilestones(server, newEarned);
}

function handleShowEconomyTop(player, server) {
  var stats = server && server.persistentData ? server.persistentData.getCompound(MARKET_STATS_KEY) : null;
  var totalEarned = stats ? Number(stats.getLong('total_earned') || 0) : 0;
  var totalItems = stats ? Number(stats.getLong('total_items_sold') || 0) : 0;
  var cStats = server && server.persistentData ? server.persistentData.getCompound('halucynacje_contract_stats') : null;
  var contractsDone = cStats ? Number(cStats.getInt('completed') || 0) : 0;
  var bestStreak = cStats ? Number(cStats.getInt('best_streak') || 0) : 0;
  var docksCount = typeof readExportDocks === 'function' ? readExportDocks(server).length : 0;

  var nextMilestone = null;
  var mIdx = 0;
  var byItem = readStatsJsonMap(server, TYCOON_EXPORT_BY_ITEM_KEY);
  var itemRows = [];
  var itemKeys = Object.keys(byItem);
  var kIdx = 0;
  var byPlayer = readStatsJsonMap(server, TYCOON_EXPORT_BY_PLAYER_KEY);
  var playerRows = [];
  var playerKeys = Object.keys(byPlayer);
  var pIdx = 0;
  var rIdx = 0;
  var pct = 0;

  for (mIdx = 0; mIdx < TYCOON_EXPORT_MILESTONES.length; mIdx++) {
    if (totalEarned < TYCOON_EXPORT_MILESTONES[mIdx].threshold) {
      nextMilestone = TYCOON_EXPORT_MILESTONES[mIdx];
      break;
    }
  }

  for (kIdx = 0; kIdx < itemKeys.length; kIdx++) {
    itemRows.push({
      id: itemKeys[kIdx],
      coins: Number(byItem[itemKeys[kIdx]].coins || 0),
      items: Number(byItem[itemKeys[kIdx]].items || 0)
    });
  }
  itemRows.sort(function (a, b) {
    return b.coins - a.coins;
  });

  for (pIdx = 0; pIdx < playerKeys.length; pIdx++) {
    playerRows.push({
      name: playerKeys[pIdx],
      coins: Number(byPlayer[playerKeys[pIdx]].coins || 0),
      items: Number(byPlayer[playerKeys[pIdx]].items || 0)
    });
  }
  playerRows.sort(function (a, b) {
    return b.coins - a.coins;
  });

  player.tell(Text.gold('=== 🏆 Statystyki i Ranking Tycoona (/ekonomia top) ==='));
  player.tell(
    Text.white('• Łączny eksport drużyny: ')
      .append(Text.gold(`${formatCoins(totalEarned)} monet`))
      .append(Text.gray(` (${formatCoins(totalItems)} szt. | Kontrakty: ${contractsDone}, rekord serii: ${bestStreak} | Doki: ${docksCount}/${EXPORT_DOCK_MAX})`))
  );

  if (nextMilestone) {
    pct = Math.min(99, Math.floor((totalEarned / nextMilestone.threshold) * 100));
    player.tell(
      Text.white('• Kolejny kamień milowy: ')
        .append(Text.aqua(`${formatCoins(nextMilestone.threshold)} monet`))
        .append(Text.gray(` (${pct}% — brakuje ${formatCoins(nextMilestone.threshold - totalEarned)})`))
    );
  } else {
    player.tell(Text.gold('★ Wszystkie kamienie milowe eksportu (do 1 000 000 monet) zdobyte!'));
  }

  player.tell(Text.yellow('— TOP 5 eksportowanych produktów —'));
  if (itemRows.length === 0) {
    player.tell(Text.gray('  (Brak danych — sprzedaj pierwsze towary przez /sprzedaj lub /rynek_eksport)'));
  } else {
    for (rIdx = 0; rIdx < Math.min(5, itemRows.length); rIdx++) {
      player.tell(
        Text.white(`  ${rIdx + 1}. `)
          .append(Text.aqua(itemRows[rIdx].id))
          .append(Text.white(' — '))
          .append(Text.gold(`${formatCoins(itemRows[rIdx].coins)} monet`))
          .append(Text.gray(` (${formatCoins(itemRows[rIdx].items)} szt.)`))
      );
    }
  }

  player.tell(Text.yellow('— Ranking eksporterów (gracze + Automatyczne Doki) —'));
  if (playerRows.length === 0) {
    player.tell(Text.gray('  (Brak zapisanych transakcji)'));
  } else {
    for (rIdx = 0; rIdx < Math.min(5, playerRows.length); rIdx++) {
      player.tell(
        Text.white(`  ${rIdx + 1}. `)
          .append(Text.green(playerRows[rIdx].name))
          .append(Text.white(' — '))
          .append(Text.gold(`${formatCoins(playerRows[rIdx].coins)} monet`))
          .append(Text.gray(` (${formatCoins(playerRows[rIdx].items)} szt.)`))
      );
    }
  }
  return 1;
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

function buildSellStageDeniedMessage(itemId, requiredStage, currentStage) {
  return Text.red(`[Rynek] Sprzedaż odblokujesz na Etapie ${requiredStage} `)
    .append(Text.gray(`(${itemId}; obecny etap drużyny: ${currentStage}).`));
}

function buildBuyStageDeniedMessage(entry, currentStage) {
  return Text.red(
    `[Sklep] Ten towar wymaga odblokowanego Etapu ${entry.stage} (obecny etap drużyny: ${currentStage}).`
  );
}

function buildBuyLimitDeniedMessage(entry, bought) {
  return Text.red(
    `[Sklep] Limit drużynowy dla ${entry.alias} to ${entry.teamLimit} szt. (wykorzystano: ${bought}).`
  );
}

function sellSingleStack(stack, catalog, currentStage) {
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
  if (currentStage != null && def.sellStage > Number(currentStage)) {
    return {
      status: 'stage_locked',
      itemId: itemId,
      requiredStage: def.sellStage,
      currentStage: Number(currentStage)
    };
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

// ----------------------------------------------------------------------------
// Dynamiczny Rynek (Issue #50 + balans i twarde limity Issue #79):
// Wszystkie parametry premii czytane są centralnie z `prices.json` (`market_bonuses`)
// przez `getMarketBonusesConfig()` w `shared_economy.js` (wspólne z `validate_economy.mjs`).
// 1) Rotujący Boom Rynkowy (+30% co 20 minut na 1 towar dopasowany do Etapu).
// 2) Premia za Różnorodność Fabryk (+5% / +10% / +15% za 3 / 5 / 7+ różnych
//    towarów sprzedanych na Wyspie-Rynku za min. 250 monet każdy w oknie 30 min).
// 3) Twardy limit premii: maks. +25% bez Boomu, maks. +45% (x1.45) z Boomem.
// 4) Poza Wyspą-Rynkiem: zawsze sztywne 85% (-15% kurier, brak premii dynamicznych),
//    dzięki czemu sprzedaż zdalna jest zawsze poniżej cen NPC (+20%) na Rynku!
// ----------------------------------------------------------------------------
const MARKET_BOOM_KEY = 'halucynacje_market_boom';
const MARKET_BOOM_DURATION_MS = 1200000; // 20 minut
const MARKET_BOOM_TICK_INTERVAL = 1200; // sprawdzanie co 60 s (lekkie dla TPS)
const MARKET_DIVERSITY_KEY = 'halucynacje_diversity_window';
const MARKET_DIVERSITY_WINDOW_MS = 1800000; // 30 minut

// Zróżnicowanie marż i Automatyczny Dok Eksportowy na Wyspie-Rynku (Issue #48)
const EXPORT_DOCKS_KEY = 'halucynacje_export_docks';
const EXPORT_PENDING_KEY = 'halucynacje_export_pending';
const EXPORT_DOCK_MAX = 4;
const EXPORT_DOCK_TICK_INTERVAL = 600; // skan doków co 30 s (bezpieczne dla TPS Exaroton)

let MARKET_BOOM_TICK_COUNTER = 0;
let EXPORT_DOCK_TICK_COUNTER = 0;
const EXPORT_DOCK_LOGGED_ERRORS = {};
let EXPORT_DOCK_BLOCK_POS_CLASS = null;
let EXPORT_DOCK_BLOCK_POS_LOADED = false;

function getBoomEligibleItems(catalog, stage) {
  var allowedTierNums = [1];
  var pool = [];
  var i = 0;
  var t = null;
  var j = 0;
  var item = null;

  if (stage <= 0) allowedTierNums = [1];
  else if (stage === 1) allowedTierNums = [1, 2];
  else if (stage === 2) allowedTierNums = [2, 3];
  else if (stage === 3) allowedTierNums = [3, 4];
  else allowedTierNums = [4, 5];

  for (i = 0; i < catalog.tiersList.length; i++) {
    t = catalog.tiersList[i];
    if (allowedTierNums.indexOf(t.tierNum) === -1) continue;
    for (j = 0; j < t.items.length; j++) {
      item = t.items[j];
      if (item.sellStage > stage) continue;
      pool.push(item);
    }
  }

  if (pool.length === 0) {
    for (i = 0; i < catalog.tiersList.length; i++) {
      t = catalog.tiersList[i];
      for (j = 0; j < t.items.length; j++) {
        item = t.items[j];
        if (item.sellStage <= stage) {
          pool.push(item);
        }
      }
    }
  }
  return pool;
}

function rollMarketBoom(server, previousItemId, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var catalog = getMarketCatalog(false);
  var bonusCfg = getMarketBonusesConfig(false);
  var boomPct = Number(bonusCfg.market_boom_bonus_percent || 30);
  var boomMult = 1.0 + boomPct / 100.0;
  var stage = getCurrentUnlockedStage(null, server);
  var pool = getBoomEligibleItems(catalog, stage);
  var filtered = null;
  var pick = null;
  var boom = null;
  var tag = null;
  var boostedPrice = 0;

  if (pool.length === 0) {
    return null;
  }

  filtered =
    pool.length > 1 && previousItemId
      ? pool.filter(function (x) {
          return x.id !== previousItemId;
        })
      : pool;
  pick = filtered[Math.floor(Math.random() * filtered.length)];
  boostedPrice = Math.round(pick.wholesale * boomMult);

  boom = {
    itemId: pick.id,
    tierKey: pick.tierKey,
    basePrice: pick.wholesale,
    boostedPrice: boostedPrice,
    bonusPercent: boomPct,
    packSize: pick.packSize,
    expiresAtMs: now + MARKET_BOOM_DURATION_MS
  };

  if (server && server.persistentData) {
    tag = server.persistentData.getCompound(MARKET_BOOM_KEY);
    tag.putString('itemId', boom.itemId);
    tag.putString('tierKey', boom.tierKey);
    tag.putInt('basePrice', boom.basePrice);
    tag.putInt('boostedPrice', boom.boostedPrice);
    tag.putInt('bonusPercent', boom.bonusPercent);
    tag.putInt('packSize', boom.packSize);
    tag.putLong('expiresAtMs', boom.expiresAtMs);
    server.persistentData.put(MARKET_BOOM_KEY, tag);
  }

  if (server && typeof server.tell === 'function') {
    server.tell(
      Text.gold(`🔥 [BOOM RYNKOWY +${boomPct}% na Wyspie-Rynku] `)
        .append(Text.white('Przez 20 min gorący towar na giełdzie: '))
        .append(Text.aqua(`${boom.itemId}${boom.packSize > 1 ? ` (x${boom.packSize})` : ''}`))
        .append(Text.white(' — '))
        .append(Text.gold(`${formatCoins(boom.boostedPrice)} monet`))
        .append(Text.gray(` (zamiast ${formatCoins(boom.basePrice)}). Wpisz /boom`))
    );
  }

  return boom;
}

function getOrRollMarketBoom(server, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var bonusCfg = getMarketBonusesConfig(false);
  var defaultBoomPct = Number(bonusCfg.market_boom_bonus_percent || 30);
  var catalog = getMarketCatalog(false);
  var currentStage = getCurrentUnlockedStage(null, server);
  var tag = null;
  var itemId = '';
  var expiresAtMs = 0;
  var basePrice = 0;
  var storedPct = 0;
  var storedDef = null;

  if (server && server.persistentData) {
    tag = server.persistentData.getCompound(MARKET_BOOM_KEY);
    itemId = tag ? String(tag.getString('itemId') || '') : '';
    expiresAtMs = tag ? Number(tag.getLong('expiresAtMs') || 0) : 0;
    if (itemId && expiresAtMs > now) {
      storedDef = catalog && catalog.sellById ? catalog.sellById[itemId] : null;
      if (!storedDef || storedDef.sellStage <= currentStage) {
        basePrice = Number(tag.getInt('basePrice') || 0);
        storedPct = Number(tag.getInt('bonusPercent') || 0);
        return {
          itemId: itemId,
          tierKey: String(tag.getString('tierKey') || ''),
          basePrice: basePrice,
          boostedPrice: Math.round(basePrice * (1.0 + (storedPct > 0 ? storedPct : defaultBoomPct) / 100.0)),
          bonusPercent: storedPct > 0 ? storedPct : defaultBoomPct,
          packSize: Number(tag.getInt('packSize') || 1),
          expiresAtMs: expiresAtMs
        };
      }
    }
  }

  return rollMarketBoom(server, itemId || null, now);
}

function readDiversityMap(server, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var result = {};
  var raw = '';
  var parsed = null;
  var keys = null;
  var i = 0;
  var k = '';
  var entry = null;
  var ts = 0;
  var val = 0;

  if (!server || !server.persistentData) {
    return result;
  }

  try {
    raw = String(server.persistentData.getString(MARKET_DIVERSITY_KEY) || '');
    if (raw) {
      parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        keys = Object.keys(parsed);
        for (i = 0; i < keys.length; i++) {
          k = keys[i];
          entry = parsed[k];
          if (entry && typeof entry === 'object') {
            ts = Number(entry.ts || 0);
            val = Math.max(0, Number(entry.value || 0));
          } else {
            // Migracja ze starego formatu (sam timestamp bez wartości): wartość 0 nie kwalifikuje się do progu
            ts = Number(entry || 0);
            val = 0;
          }
          if (ts > 0 && now - ts <= MARKET_DIVERSITY_WINDOW_MS) {
            result[k] = { ts: ts, value: val };
          }
        }
      }
    }
  } catch (err) {
    // Uszkodzony JSON nie blokuje sprzedaży
  }

  return result;
}

function getDiversityBonusForCount(qualifiedCount, trackedCount) {
  var bonusCfg = getMarketBonusesConfig(false);
  var tiers = bonusCfg.diversity_tiers || [];
  var minItemValue = Number(bonusCfg.diversity_min_item_value || 250);
  var bestPct = 0;
  var i = 0;
  var t = null;

  for (i = 0; i < tiers.length; i++) {
    t = tiers[i];
    if (t && qualifiedCount >= Number(t.min_items || 0) && Number(t.bonus_percent || 0) > bestPct) {
      bestPct = Number(t.bonus_percent || 0);
    }
  }

  return {
    uniqueCount: qualifiedCount,
    trackedCount: trackedCount != null ? trackedCount : qualifiedCount,
    minItemValue: minItemValue,
    bonusPercent: bestPct,
    multiplier: 1.0 + bestPct / 100.0
  };
}

function summarizeDiversityMap(map) {
  var bonusCfg = getMarketBonusesConfig(false);
  var minItemValue = Number(bonusCfg.diversity_min_item_value || 250);
  var keys = Object.keys(map || {});
  var qualified = 0;
  var i = 0;
  var entry = null;

  for (i = 0; i < keys.length; i++) {
    entry = map[keys[i]];
    if (entry && Number(entry.value || 0) >= minItemValue) {
      qualified++;
    }
  }
  return getDiversityBonusForCount(qualified, keys.length);
}

function getCurrentDiversityStatus(server, nowMs) {
  var map = readDiversityMap(server, nowMs);
  return summarizeDiversityMap(map);
}

/**
 * Rejestruje sprzedaże z Wyspy-Rynku / Doków w 30-minutowym oknie Różnorodności.
 * `salesEntries` to tablica `{ itemId, value }` (wartość bazowa w monetach) — każdy unikalny
 * towar musi osiągnąć co najmniej `diversity_min_item_value` (domyślnie 250 monet) w oknie,
 * aby liczyć się do premii (ochrona przed cheesem 1 najtańszego przedmiotu — #79).
 */
function recordDiversitySales(server, salesEntries, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var map = readDiversityMap(server, now);
  var i = 0;
  var row = null;
  var id = '';
  var addVal = 0;
  var prev = null;

  for (i = 0; i < (salesEntries || []).length; i++) {
    row = salesEntries[i];
    if (!row) continue;
    if (typeof row === 'string') {
      id = row;
      addVal = 0;
    } else if (row.itemId) {
      id = String(row.itemId);
      addVal = Math.max(0, Number(row.value || 0));
    } else {
      continue;
    }
    prev = map[id] || { ts: now, value: 0 };
    map[id] = { ts: now, value: Number(prev.value || 0) + addVal };
  }

  if (server && server.persistentData) {
    try {
      server.persistentData.putString(MARKET_DIVERSITY_KEY, JSON.stringify(map));
    } catch (err) {
      // Ignoruj ewentualny błąd zapisu
    }
  }

  return summarizeDiversityMap(map);
}

function getEffectiveExportDockLimit(server) {
  var st = typeof getCurrentUnlockedStage === 'function' ? getCurrentUnlockedStage(null, server) : 0;
  var perks = typeof getStagePerks === 'function' ? getStagePerks(st) : null;
  return perks && perks.maxExportDocks > 0 ? perks.maxExportDocks : EXPORT_DOCK_MAX;
}

/**
 * Oblicza końcową wypłatę z uwzględnieniem lokalizacji (Wyspa-Rynek / Dok / zdalnie),
 * Boomu Rynkowego, Różnorodności, Perków Etapu oraz twardych limitów z `prices.json` (#79).
 *
 * `options`:
 *   - `onMarket` (domyślnie `true`): czy transakcja odbywa się na Wyspie-Rynku
 *   - `isExportDock` (domyślnie `false`): czy pochodzi z Automatycznego Doku Eksportowego (+5%)
 */
function applyDynamicMarketBonuses(server, basePayout, itemId, diversityStatus, boom, options) {
  var cfg = getMarketBonusesConfig(false);
  var opts = options || {};
  var onMarket = opts.onMarket !== false;
  var isExportDock = Boolean(opts.isExportDock);
  var remoteMult = Number(cfg.remote_sell_multiplier || 0.85);
  var allowRemoteBonuses = Boolean(cfg.remote_allows_dynamic_bonuses);
  var st = 0;
  var perks = null;
  var stageBonusPct = 0;
  var divBonusPct = 0;
  var dockBonusPct = 0;
  var isBoom = false;
  var boomBonusPct = 0;
  var rawNonBoomPct = 0;
  var cappedNonBoomPct = 0;
  var rawCombinedPct = 0;
  var effectiveBonusPct = 0;
  var totalMult = 1.0;
  var finalPayout = 0;

  if (!onMarket && !allowRemoteBonuses) {
    finalPayout = Math.max(1, Math.round(basePayout * remoteMult));
    return {
      finalPayout: finalPayout,
      bonusCoins: 0,
      effectiveMultiplier: remoteMult,
      isRemote: true,
      isBoom: false,
      dockBonusPercent: 0,
      stageBonusPercent: 0,
      diversityPercent: 0,
      diversityCount: diversityStatus ? diversityStatus.uniqueCount : 0,
      totalBonusPercent: 0,
      capped: false
    };
  }

  isBoom = Boolean(boom && boom.itemId === itemId);
  st = typeof getCurrentUnlockedStage === 'function' ? getCurrentUnlockedStage(null, server) : 0;
  perks = typeof getStagePerks === 'function' ? getStagePerks(st) : null;
  stageBonusPct = perks && perks.tradeBonusPercent > 0 ? Number(perks.tradeBonusPercent) : 0;
  divBonusPct = diversityStatus && diversityStatus.bonusPercent > 0 ? Number(diversityStatus.bonusPercent) : 0;
  dockBonusPct = isExportDock ? Number(cfg.export_dock_bonus_percent || 5) : 0;
  boomBonusPct = isBoom ? Number(cfg.market_boom_bonus_percent || 30) : 0;

  rawNonBoomPct = dockBonusPct + divBonusPct + stageBonusPct;
  cappedNonBoomPct = Math.min(Number(cfg.max_non_boom_bonus_percent || 25), rawNonBoomPct);
  rawCombinedPct = cappedNonBoomPct + boomBonusPct;
  effectiveBonusPct = isBoom
    ? Math.min(Number(cfg.max_combined_bonus_percent || 45), rawCombinedPct)
    : cappedNonBoomPct;

  totalMult = 1.0 + effectiveBonusPct / 100.0;
  if (!onMarket) {
    totalMult = totalMult * remoteMult;
  }

  finalPayout = Math.max(1, Math.round(basePayout * totalMult));
  return {
    finalPayout: finalPayout,
    bonusCoins: Math.max(0, finalPayout - basePayout),
    effectiveMultiplier: totalMult,
    isRemote: !onMarket,
    isBoom: isBoom,
    dockBonusPercent: dockBonusPct,
    stageBonusPercent: stageBonusPct,
    diversityPercent: divBonusPct,
    diversityCount: diversityStatus ? diversityStatus.uniqueCount : 0,
    totalBonusPercent: effectiveBonusPct,
    capped: rawNonBoomPct > cappedNonBoomPct || (isBoom && rawCombinedPct > effectiveBonusPct)
  };
}

function handleShowMarketBoom(player, server) {
  var now = Date.now();
  var cfg = getMarketBonusesConfig(false);
  var boom = getOrRollMarketBoom(server, now);
  var div = getCurrentDiversityStatus(server, now);
  var minsLeft = 0;

  player.tell(Text.gold('=== Giełda Dynamiczna HalucynacjeGTP2 (tylko na Wyspie-Rynku) ==='));
  if (boom) {
    minsLeft = Math.max(1, Math.ceil((boom.expiresAtMs - now) / 60000));
    player.tell(
      Text.white(`• 🔥 Boom Rynkowy (+${boom.bonusPercent}%): `)
        .append(Text.aqua(`${boom.itemId}${boom.packSize > 1 ? ` (x${boom.packSize})` : ''}`))
        .append(Text.white(' — '))
        .append(Text.gold(`${formatCoins(boom.boostedPrice)} monet`))
        .append(Text.gray(` (zamiast ${formatCoins(boom.basePrice)}, zostało ~${minsLeft} min)`))
    );
  }
  player.tell(
    Text.white('• 🏭 Premia za Różnorodność Fabryk (ostatnie 30 min): ')
      .append(
        div.bonusPercent > 0
          ? Text.green(`+${div.bonusPercent}% (${div.uniqueCount} kwalifikujących się towarów)`)
          : Text.gray(`0% (${div.uniqueCount}/3 towarów >= ${formatCoins(div.minItemValue)} monet do +5%)`)
      )
      .append(
        Text.gray(
          ` | progi: 3 -> +5%, 5 -> +10%, 7+ -> +15% (min. ${formatCoins(div.minItemValue)} monet/towar)`
        )
      )
  );
  player.tell(
    Text.gray(
      `• Limity premii: maks. +${cfg.max_non_boom_bonus_percent}% bez Boomu, maks. +${cfg.max_combined_bonus_percent}% z Boomem (sprzedaż zdalna poza Rynkiem = sztywne ${Math.round(cfg.remote_sell_multiplier * 100)}%).`
    )
  );
  return 1;
}

function handleSellHand(player, server) {
  const catalog = getMarketCatalog(false);
  const currentStage = getCurrentUnlockedStage(player, server);
  const hand = player.mainHandItem;
  const res = sellSingleStack(hand, catalog, currentStage);

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
  if (res.status === 'stage_locked') {
    player.tell(buildSellStageDeniedMessage(res.itemId, res.requiredStage, res.currentStage));
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

  const onMarket = typeof isPlayerOnMarketIsland === 'function' ? isPlayerOnMarketIsland(player) : true;
  const now = Date.now();
  const boom = onMarket ? getOrRollMarketBoom(server, now) : null;
  const div = onMarket
    ? recordDiversitySales(server, [{ itemId: res.itemId, value: res.payout }], now)
    : getCurrentDiversityStatus(server, now);
  const dyn = applyDynamicMarketBonuses(server, res.payout, res.itemId, div, boom, {
    onMarket: onMarket,
    isExportDock: false
  });

  giveCoinsToPlayer(player, dyn.finalPayout);
  recordExportStats(server, dyn.finalPayout, res.soldItems, player.username || 'Gracz', [
    { itemId: res.itemId, soldItems: res.soldItems, payout: dyn.finalPayout }
  ]);
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  let bonusTags = '';
  if (!onMarket) bonusTags += ' 📦-15% kurier poza Rynkiem (brak premii)';
  if (dyn.isBoom) bonusTags += ` 🔥+${boom.bonusPercent}% Boom`;
  if (dyn.diversityPercent > 0) bonusTags += ` 🏭+${dyn.diversityPercent}% Różnorodność`;
  if (dyn.stageBonusPercent > 0) bonusTags += ` ★+${dyn.stageBonusPercent}% Etap`;
  if (dyn.capped) bonusTags += ` (limit +${dyn.totalBonusPercent}%)`;

  player.tell(
    Text.green(`[Rynek Hurtowy] Sprzedano ${res.soldItems}x ${res.itemId} za `)
      .append(Text.gold(`${formatCoins(dyn.finalPayout)} monet`))
      .append(bonusTags ? Text.aqua(` (${bonusTags.trim()})`) : Text.green(''))
      .append(Text.green('! '))
      .append(
        Text.gray(
          onMarket
            ? `(Dok Eksportowy /rynek_eksport płaci +5%, a sklepy NPC ok. +${formatCoins(res.npcBonusPotential)} monet więcej!)`
            : `(Na Wyspie-Rynku 152,64,0 dostajesz 100% + Boom/Różnorodność/Etap, a w Doku /rynek_eksport dodatkowo +5%!)`
        )
      )
  );
  return 1;
}

function handleSellAll(player, server) {
  const catalog = getMarketCatalog(false);
  const currentStage = getCurrentUnlockedStage(player, server);
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;

  const soldLines = [];
  const diversityEntries = [];
  let totalItems = 0;
  let totalBonusPotential = 0;
  let blockedSkipped = 0;
  let stageLockedSkipped = 0;

  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty()) continue;
    const res = sellSingleStack(stack, catalog, currentStage);
    if (res.status === 'sold') {
      soldLines.push(res);
      diversityEntries.push({ itemId: res.itemId, value: res.payout });
      totalItems += res.soldItems;
      totalBonusPotential += res.npcBonusPotential;
    } else if (res.status === 'blocked') {
      blockedSkipped++;
    } else if (res.status === 'stage_locked') {
      stageLockedSkipped++;
    }
  }

  if (soldLines.length === 0) {
    const skipParts = [];
    if (blockedSkipped > 0) skipParts.push('surowce Tier 0');
    if (stageLockedSkipped > 0) skipParts.push('towary wymagające wyższego Etapu');
    const skipNote = skipParts.length > 0 ? ` (pominięto: ${skipParts.join(' oraz ')})` : '';
    player.tell(
      Text.yellow(
        `[Rynek Hurtowy] Brak odblokowanych towarów Tier 1–5 do sprzedaży w ekwipunku${skipNote}. Sprawdź /cennik 1.`
      )
    );
    return 0;
  }

  const onMarket = typeof isPlayerOnMarketIsland === 'function' ? isPlayerOnMarketIsland(player) : true;
  const now = Date.now();
  const boom = onMarket ? getOrRollMarketBoom(server, now) : null;
  const div = onMarket
    ? recordDiversitySales(server, diversityEntries, now)
    : getCurrentDiversityStatus(server, now);

  let totalPayout = 0;
  let boomHit = false;
  let anyCapped = false;
  let stageBonusHit = 0;
  const statBreakdown = [];
  for (let j = 0; j < soldLines.length; j++) {
    const dyn = applyDynamicMarketBonuses(server, soldLines[j].payout, soldLines[j].itemId, div, boom, {
      onMarket: onMarket,
      isExportDock: false
    });
    totalPayout += dyn.finalPayout;
    statBreakdown.push({
      itemId: soldLines[j].itemId,
      soldItems: soldLines[j].soldItems,
      payout: dyn.finalPayout
    });
    if (dyn.isBoom) boomHit = true;
    if (dyn.capped) anyCapped = true;
    if (dyn.stageBonusPercent > stageBonusHit) stageBonusHit = dyn.stageBonusPercent;
  }

  giveCoinsToPlayer(player, totalPayout);
  recordExportStats(server, totalPayout, totalItems, player.username || 'Gracz', statBreakdown);
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  let bonusTags = '';
  if (!onMarket) bonusTags += ' 📦-15% kurier poza Rynkiem (brak premii)';
  if (boomHit) bonusTags += ` 🔥+${boom.bonusPercent}% Boom`;
  if (onMarket && div.bonusPercent > 0) bonusTags += ` 🏭+${div.bonusPercent}% Różnorodność (${div.uniqueCount} tow.)`;
  if (onMarket && stageBonusHit > 0) bonusTags += ` ★+${stageBonusHit}% Etap`;
  if (anyCapped) bonusTags += ' (limit premii)';

  player.tell(
    Text.green(`[Rynek Hurtowy] Wyeksportowano łącznie ${totalItems} szt. towarów za `)
      .append(Text.gold(`${formatCoins(totalPayout)} monet`))
      .append(bonusTags ? Text.aqua(` (${bonusTags.trim()})`) : Text.green(''))
      .append(Text.green('! '))
      .append(
        Text.gray(
          onMarket
            ? `(Dok /rynek_eksport daje +5%, a sklepy NPC +${formatCoins(totalBonusPotential)} monet!)`
            : `(Na Wyspie-Rynku 152,64,0 dostajesz 100% + Boom/Różnorodność/Etap, a przez pociąg + /rynek_eksport dodatkowo +5%!)`
        )
      )
  );
  return totalItems;
}

function getItemMaxStackSize(itemId) {
  var probe = null;
  var maxSz = 64;
  try {
    probe = Item.of(itemId, 1);
    if (probe) {
      if (typeof probe.getMaxStackSize === 'function') {
        maxSz = Number(probe.getMaxStackSize() || 64);
      } else if (typeof probe.maxStackSize === 'number') {
        maxSz = Number(probe.maxStackSize || 64);
      }
    }
  } catch (e) {
    maxSz = 64;
  }
  if (!Number.isFinite(maxSz) || maxSz < 1) maxSz = 64;
  return Math.min(64, Math.floor(maxSz));
}

function giveItemStacksToPlayer(player, itemId, totalCount) {
  var remaining = Math.max(0, Math.floor(Number(totalCount) || 0));
  var maxStack = getItemMaxStackSize(itemId);
  var chunk = 0;
  if (!player || typeof player.give !== 'function' || remaining <= 0) {
    return 0;
  }
  while (remaining > 0) {
    chunk = Math.min(maxStack, remaining);
    player.give(Item.of(itemId, chunk));
    remaining -= chunk;
  }
  return Math.max(0, Math.floor(Number(totalCount) || 0));
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
    player.tell(buildBuyStageDeniedMessage(entry, currentStage));
    return 0;
  }

  if (entry.teamLimit > 0) {
    const bought = getTeamBuyCount(server, entry.id);
    if (bought + qty > entry.teamLimit) {
      player.tell(buildBuyLimitDeniedMessage(entry, bought));
      return 0;
    }
  }

  const totalCost = entry.buyPrice * qty;
  const breakdown = computePlayerBalanceBreakdown(player);
  const balance = breakdown.total;
  if (balance < totalCost) {
    player.tell(
      Text.red(
        `[Sklep] Za mało monet! Koszt: ${formatCoins(totalCost)} monet, łączne saldo (EQ + portfel + bank): ${formatCoins(balance)} monet.`
      )
    );
    return 0;
  }

  if (!chargePlayerMoney(player, totalCost)) {
    player.tell(Text.red('[Sklep] Błąd pobierania monet — transakcja anulowana (nie pobrano żadnych monet).'));
    return 0;
  }

  const packCount = entry.count && entry.count > 1 ? entry.count : 1;
  const totalItems = qty * packCount;
  giveItemStacksToPlayer(player, entry.id, totalItems);
  if (entry.teamLimit > 0) {
    addTeamBuyCount(server, entry.id, qty);
  }
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  const packSuffix = packCount > 1 ? ` (${totalItems} szt.)` : '';
  player.tell(
    Text.green(`[Sklep] Kupiono ${qty}x `)
      .append(Text.aqua(`${entry.alias}${packSuffix}`))
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

  var loaded = { TerminalMenuProvider: null, EntityValidator: null, SimpleValidator: null };
  try {
    loaded.TerminalMenuProvider = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.common.menus.providers.TerminalMenuProvider'
    );
    loaded.EntityValidator = Java.loadClass(
      'io.github.lightman314.lightmanscurrency.common.menus.validation.types.EntityValidator'
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
 * Zweryfikowane w bajtkodzie `lightmanscurrency-1.21-2.3.0.6.jar` (`CommandTerminal`,
 * `TerminalMenuProvider`, `EntityValidator`, `CPacketOpenNetworkTerminal$H`):
 *   1) Ścieżka główna: `TerminalMenuProvider.OpenMenu(player, EntityValidator.of(player))`
 *      — w przeciwieństwie do natywnego `/lcterminal` (który przekazuje `SimpleValidator.NULL`),
 *      `EntityValidator.of(player)` zwraca `isNull() == false` i `stillValid(player) == true`,
 *      dzięki czemu przycisk **"Back to Network Terminal"** w GUI sklepu przechodzi warunek
 *      `!validator.isNull()` w `CPacketOpenNetworkTerminal$H.handle` i wraca do listy sklepów!
 *   2) Fallback 1: `player.runCommandSilent('lcterminal')`.
 *   3) Fallback 2: `server.runCommandSilent('execute as <gracz> run lcterminal')`.
 */
function openTradingTerminalGui(player, server, source) {
  var classes = null;
  var validator = null;

  try {
    classes = getTerminalGuiClasses();
    if (classes && classes.TerminalMenuProvider && classes.TerminalMenuProvider.OpenMenu) {
      if (classes.EntityValidator && classes.EntityValidator.of && player) {
        validator = classes.EntityValidator.of(player);
      } else if (classes.SimpleValidator && classes.SimpleValidator.NULL) {
        validator = classes.SimpleValidator.NULL;
      }
      if (validator) {
        classes.TerminalMenuProvider.OpenMenu(player, validator);
        return true;
      }
    }
  } catch (err0) {
    console.warn(`[HalucynacjeGTP2] TerminalMenuProvider.OpenMenu nie powiodło się: ${err0}`);
  }

  try {
    if (player && typeof player.runCommandSilent === 'function') {
      player.runCommandSilent('lcterminal');
      return true;
    }
  } catch (err1) {
    console.warn(`[HalucynacjeGTP2] player.runCommandSilent('lcterminal') nie powiodło się: ${err1}`);
  }

  try {
    if (server && typeof server.runCommandSilent === 'function' && player && player.username) {
      server.runCommandSilent(`execute as ${player.username} run lcterminal`);
      return true;
    }
  } catch (err2) {
    console.warn(`[HalucynacjeGTP2] server.runCommandSilent('execute as ... run lcterminal') nie powiodło się: ${err2}`);
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

function getBuyCategoryLabel(category) {
  if (category === 'etapy' || category === 'prestige') return 'Etapy';
  if (category === 'plants') return 'Rośliny';
  if (category === 'livestock') return 'Hodowla';
  if (category === 'skyblock') return 'Skyblock';
  if (category === 'tech') return 'Tech';
  if (category === 'machines') return 'Maszyny';
  if (category === 'materials') return 'Surowce';
  if (category === 'decor') return 'Dekoracje';
  if (category === 'tools') return 'Narzędzia';
  return 'Inne';
}

function handleShowShop(player, server, requestedStage) {
  var catalog = null;
  var currentStage = 0;
  var filterStage = null;
  var shown = 0;
  var i = 0;
  var entry = null;
  var catLabel = '';
  var prefix = '';
  var lockTag = null;
  var packNote = '';
  var limitNote = '';
  var aliasStr = '';
  var noteStr = '';

  try {
    catalog = getMarketCatalog(false);
    currentStage = getCurrentUnlockedStage(player, server);
    filterStage = requestedStage != null ? Number(requestedStage) : null;

    safeTellPlayer(
      player,
      Text.gold(
        `=== Katalog Sklepu (Twój Etap: ${currentStage}${filterStage != null ? `, widok Etapu ${filterStage}` : ''}) ===`
      )
    );

    for (i = 0; i < catalog.buyList.length; i++) {
      entry = catalog.buyList[i];
      if (filterStage != null) {
        if (entry.stage !== filterStage) continue;
      } else if (entry.stage > currentStage) {
        continue;
      }

      catLabel = getBuyCategoryLabel(entry.category);
      prefix =
        entry.stage > currentStage
          ? `[Wymaga S${entry.stage} • ${catLabel}] `
          : `[S${entry.stage} • ${catLabel}] `;
      lockTag = entry.stage > currentStage ? Text.red(prefix) : Text.green(prefix);
      packNote = entry.count && entry.count > 1 ? ` (${entry.count} szt.)` : '';
      limitNote = entry.teamLimit > 0 ? ` (limit ${entry.teamLimit})` : '';
      aliasStr = String(entry.alias || entry.id || '?');
      noteStr = String(entry.note || '');
      safeTellPlayer(
        player,
        lockTag
          .append(Text.aqua(`/kup ${aliasStr}`))
          .append(Text.white(`${packNote} — ${formatCoins(entry.buyPrice)} monet`))
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

function handleShowPrices(player, requestedTier, server) {
  const catalog = getMarketCatalog(false);
  const currentStage = getCurrentUnlockedStage(player, server || (player && player.server));
  const tierNum = Math.max(1, Math.min(5, Number(requestedTier) || 1));
  const tier = catalog.tiersList[tierNum - 1];

  if (!tier) {
    player.tell(Text.red('[Cennik] Wybierz Tier od 1 do 5: /cennik 1 .. /cennik 5'));
    return;
  }

  const tierLockedNote = tier.sellStage > currentStage ? ` 🔒 [Wymaga Etapu ${tier.sellStage}]` : '';
  player.tell(Text.gold(`=== Cennik Skupu — Tier ${tier.tierNum} (${tier.description})${tierLockedNote} ===`));
  for (let i = 0; i < tier.items.length; i++) {
    const it = tier.items[i];
    const packLabel = it.packSize > 1 ? ` (pakiet x${it.packSize})` : '';
    const isLocked = it.sellStage > currentStage;
    if (isLocked) {
      player.tell(
        Text.red(`🔒 [Etap ${it.sellStage}] `)
          .append(Text.gray(`${it.id}${packLabel}: `))
          .append(Text.yellow(`hurt ${formatCoins(it.wholesale)}`))
          .append(Text.gray(' | '))
          .append(Text.green(`Rynek NPC ~${formatCoins(it.npc)} (+20%)`))
      );
    } else {
      player.tell(
        Text.white(`• ${it.id}${packLabel}: `)
          .append(Text.yellow(`hurt ${formatCoins(it.wholesale)}`))
          .append(Text.gray(' | '))
          .append(Text.green(`Rynek NPC ~${formatCoins(it.npc)} (+20%)`))
      );
    }
  }
  player.tell(Text.gray('Użyj /sprzedaj (ręka) lub /sprzedaj all (ekwipunek). Surowce Tier 0 = 0 monet.'));
}

function handleShowEconomyStatus(player, server) {
  const catalog = getMarketCatalog(false);
  const currentStage = getCurrentUnlockedStage(player, server);
  const breakdown = computePlayerBalanceBreakdown(player);
  const cash = breakdown.total;
  const stats = server && server.persistentData ? server.persistentData.getCompound(MARKET_STATS_KEY) : null;
  const totalEarned = stats ? Number(stats.getLong('total_earned') || 0) : 0;
  const totalItems = stats ? Number(stats.getLong('total_items_sold') || 0) : 0;
  const now = Date.now();
  const boom = getOrRollMarketBoom(server, now);
  const diversity = getCurrentDiversityStatus(server, now);

  const nextToken = catalog.stageTokens[currentStage] || null;
  const stagePerks = typeof getStagePerks === 'function' ? getStagePerks(currentStage) : null;
  const titleBadge = stagePerks && stagePerks.title ? ` ${stagePerks.title}` : '';
  player.tell(Text.gold(`=== Panel Ekonomii HalucynacjeGTP2${titleBadge || ' (Tycoon)'} ===`));
  player.tell(
    Text.white(`• Aktualny Etap drużyny: `)
      .append(Text.aqua(`Stage ${currentStage} / 5`))
      .append(
        stagePerks
          ? Text.gray(
              ` (Perki: +${stagePerks.tradeBonusPercent}% skup | +${stagePerks.extraForceChunks} FTB Chunks | maks. ${stagePerks.maxExportDocks} Doków)`
            )
          : Text.gray('')
      )
  );
  player.tell(
    Text.white(`• Łączne saldo LC (TAB / /kup): `)
      .append(Text.gold(`${formatCoins(cash)} monet`))
      .append(
        Text.gray(
          ` (EQ: ${formatCoins(breakdown.inventory)} | Portfel: ${formatCoins(breakdown.wallet)} | Bank: ${formatCoins(breakdown.personalBank + breakdown.teamBank)})`
        )
      )
  );
  player.tell(
    Text.white(`• Eksport hurtowy drużyny: `)
      .append(Text.green(`${formatCoins(totalEarned)} monet`))
      .append(Text.gray(` (${formatCoins(totalItems)} szt. towarów)`))
  );
  if (boom) {
    const minsLeft = Math.max(1, Math.ceil((boom.expiresAtMs - now) / 60000));
    player.tell(
      Text.white(`• Boom Rynkowy (+${boom.bonusPercent}% na Rynku): `)
        .append(Text.aqua(boom.itemId))
        .append(Text.gold(` (${formatCoins(boom.boostedPrice)} monet)`))
        .append(Text.gray(` • zostało ~${minsLeft} min`))
    );
  }
  player.tell(
    Text.white(`• Różnorodność fabryki (30 min): `)
      .append(
        diversity.bonusPercent > 0
          ? Text.green(`+${diversity.bonusPercent}%`)
          : Text.gray(`0% (sprzedaj na Rynku 3/5/7 towarów >= ${formatCoins(diversity.minItemValue)} monet)`)
      )
      .append(Text.gray(` (${diversity.uniqueCount} kwalifikujących się towarów)`))
  );
  if (nextToken) {
    const missing = Math.max(0, nextToken.buyPrice - cash);
    player.tell(
      Text.white(`• Kolejny cel: `)
        .append(Text.aqua(`${nextToken.note}`))
        .append(Text.white(` — koszt `))
        .append(Text.gold(`${formatCoins(nextToken.buyPrice)} monet`))
        .append(Text.gray(` (komenda: /kup ${nextToken.alias}, brakuje ${formatCoins(missing)})`))
    );
  } else {
    player.tell(
      Text.gold('★ Osiągnięto Stage 5! Ostateczny cel survivalowy: /kontrakt final (Wielki Finał -> Trofeum Imperium + 750 000 monet jednorazowo)!')
    );
  }
  player.tell(
    Text.gray(
      'Komendy: /sklep (GUI) | /boom | /kontrakt | /saldo | /sprzedaj [all] | /kup <alias> [ilość] | /cennik [1-5]'
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
            handleShowPrices(player, 1, ctx.source.server);
            return 1;
          })
          .then(
            Commands.argument('tier', Arguments.INTEGER.create(event)).executes((ctx) => {
              const player = ctx.source.player;
              if (!player) return 0;
              const tier = Arguments.INTEGER.getResult(ctx, 'tier');
              handleShowPrices(player, tier, ctx.source.server);
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
        handleShowPrices(player, 1, ctx.source.server);
        return 1;
      })
      .then(
        Commands.argument('tier', Arguments.INTEGER.create(event)).executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          const tier = Arguments.INTEGER.getResult(ctx, 'tier');
          handleShowPrices(player, tier, ctx.source.server);
          return 1;
        })
      )
  );

  event.register(
    Commands.literal('ekonomia')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        handleShowEconomyStatus(player, ctx.source.server);
        return 1;
      })
      .then(
        Commands.literal('top').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleShowEconomyTop(player, ctx.source.server);
        })
      )
  );

  event.register(
    Commands.literal('boom').executes((ctx) => {
      const player = ctx.source.player;
      if (!player) return 0;
      handleShowMarketBoom(player, ctx.source.server);
      return 1;
    })
  );

  event.register(
    Commands.literal('gielda').executes((ctx) => {
      const player = ctx.source.player;
      if (!player) return 0;
      handleShowMarketBoom(player, ctx.source.server);
      return 1;
    })
  );

  // Automatyczny Dok Eksportowy na Wyspie-Rynku (Issue #48 — Opcja 2)
  event.register(
    Commands.literal('rynek_eksport')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        return handleAddExportDock(player, ctx.source.server);
      })
      .then(
        Commands.literal('dodaj').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleAddExportDock(player, ctx.source.server);
        })
      )
      .then(
        Commands.literal('lista').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleListExportDocks(player, ctx.source.server);
        })
      )
      .then(
        Commands.literal('odbierz').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleClaimExportPending(player, ctx.source.server);
        })
      )
      .then(
        Commands.literal('usun')
          .executes((ctx) => {
            const player = ctx.source.player;
            if (!player) return 0;
            return handleRemoveExportDock(player, ctx.source.server, null);
          })
          .then(
            Commands.argument('numer', Arguments.INTEGER.create(event)).executes((ctx) => {
              const player = ctx.source.player;
              if (!player) return 0;
              const num = Arguments.INTEGER.getResult(ctx, 'numer');
              return handleRemoveExportDock(player, ctx.source.server, num);
            })
          )
      )
  );

  // Komenda OP do przeładowania cennika z pliku JSON bez restartu serwera
  // (odświeża zarówno rynek hurtowy/sklep, jak i ceny NPC Shoppers — Issue #62)
  event.register(
    Commands.literal('halucynacje_reload_economy')
      .requires((src) => src.hasPermission(2))
      .executes((ctx) => {
        var reloadRes = handleReloadEconomy(ctx.source.server);
        var shoppersNote = reloadRes.shoppers
          ? reloadRes.shoppers.viaJavaApi
            ? ` | Shoppers: ${reloadRes.shoppers.total} cen (${reloadRes.shoppers.tier0} Tier 0 + ${reloadRes.shoppers.stageLocked || 0} zablok. Etapem + ${reloadRes.shoppers.npc} NPC)`
            : ` | Shoppers (fallback): ${reloadRes.shoppers.npc} cen NPC`
          : '';
        sendCommandFeedback(
          ctx,
          Text.green(
            `[HalucynacjeGTP2] Przeładowano prices.json (${reloadRes.marketSell} skup, ${reloadRes.marketBuy} sklep, ${reloadRes.marketTier0} blokad Tier 0${shoppersNote}).`
          )
        );
        return 1;
      })
  );

  // Komenda OP do smoke-testu Doku Eksportowego na żywym serwerze (CI `server-boot`, #89)
  event.register(
    Commands.literal('halucynacje_test_export_dock')
      .requires((src) => src.hasPermission(2))
      .then(
        Commands.literal('forceload_on').executes((ctx) => {
          var ok = setExportDockChunkForceload(ctx.source.server, 152, 0, true);
          if (!ok) {
            console.error('[HalucynacjeGTP2] [ExportDockTest] FAIL: błąd dodania forceload dla (152, 0).');
            return 0;
          }
          sendCommandFeedback(
            ctx,
            Text.green('[HalucynacjeGTP2] [ExportDockTest] Forceload dodany dla (152, 0).')
          );
          return 1;
        })
      )
      .then(
        Commands.literal('run').executes((ctx) => {
          var res = handleRunExportDockSmokeTest(ctx.source.server);
          if (!res || !res.ok) {
            console.error(
              `[HalucynacjeGTP2] [ExportDockTest] FAIL: ${res && res.error ? res.error : 'nieznany błąd'}`
            );
            return 0;
          }
          sendCommandFeedback(ctx, Text.green(res.summary));
          return 1;
        })
      )
  );
});

// ----------------------------------------------------------------------------
// Automatyczny Dok Eksportowy na Wyspie-Rynku (Issue #48)
// Obsługuje skrzynie, beczki oraz Create Item Vault zasilane pociągiem / Frogportem.
// Co 30 s (600 ticków) opróżnia wyłącznie przetworzone towary Tier 1–5 z premią
// +5% logistyczną (+ Boom +40% + Różnorodność +10/15/20%) i przelewa środki
// prosto na konto bankowe drużyny LC (lub do skarbca /rynek_eksport odbierz).
// ----------------------------------------------------------------------------
function readExportDocks(server) {
  var raw = '';
  var parsed = null;
  if (!server || !server.persistentData) return [];
  try {
    raw = String(server.persistentData.getString(EXPORT_DOCKS_KEY) || '');
    if (raw) {
      parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    // Ignoruj uszkodzony wpis
  }
  return [];
}

function writeExportDocks(server, docks) {
  if (!server || !server.persistentData) return;
  try {
    server.persistentData.putString(EXPORT_DOCKS_KEY, JSON.stringify(docks || []));
  } catch (err) {
    console.warn(`[HalucynacjeGTP2] Błąd zapisu listy doków eksportowych: ${err}`);
  }
}

function getExportDockBlockPosClass() {
  if (EXPORT_DOCK_BLOCK_POS_LOADED) {
    return EXPORT_DOCK_BLOCK_POS_CLASS;
  }
  EXPORT_DOCK_BLOCK_POS_LOADED = true;
  if (typeof Java === 'undefined' || typeof Java.loadClass !== 'function') {
    EXPORT_DOCK_BLOCK_POS_CLASS = null;
    return null;
  }
  try {
    EXPORT_DOCK_BLOCK_POS_CLASS = Java.loadClass('net.minecraft.core.BlockPos');
  } catch (err) {
    console.warn(`[HalucynacjeGTP2] Błąd ładowania net.minecraft.core.BlockPos: ${err}`);
    EXPORT_DOCK_BLOCK_POS_CLASS = null;
  }
  return EXPORT_DOCK_BLOCK_POS_CLASS;
}

function logExportDockErrorOnce(key, label, err) {
  var k = String(key || '__generic__');
  if (EXPORT_DOCK_LOGGED_ERRORS[k]) {
    return false;
  }
  EXPORT_DOCK_LOGGED_ERRORS[k] = true;
  console.warn(`[HalucynacjeGTP2] Błąd Doku Eksportowego ${label}: ${err}`);
  return true;
}

/**
 * Sprawdza bez wymuszania ładowania, czy chunk doku jest załadowany w Overworldzie (MC 1.21.1).
 * Używa `LevelReader.hasChunk(chunkX, chunkZ)` (bezpośrednie API 1.21.1), a w razie jego braku
 * bezpiecznego `Level.isLoaded(new BlockPos(x, y, z))` — nigdy nieistniejącego `isLoaded(x, y, z)`.
 */
function isExportDockChunkLoaded(overworld, x, y, z) {
  var bx = Math.floor(Number(x));
  var by = Math.floor(Number(y));
  var bz = Math.floor(Number(z));
  var cx = bx >> 4;
  var cz = bz >> 4;
  var BlockPosCls = null;

  if (!overworld) return false;
  if (typeof overworld.hasChunk === 'function') {
    return Boolean(overworld.hasChunk(cx, cz));
  }
  if (typeof overworld.isLoaded === 'function') {
    BlockPosCls = getExportDockBlockPosClass();
    if (BlockPosCls) {
      return Boolean(overworld.isLoaded(new BlockPosCls(bx, by, bz)));
    }
    throw new Error(
      'Overworld nie udostępnia hasChunk(cx, cz), a klasa net.minecraft.core.BlockPos jest niedostępna'
    );
  }
  return true;
}

function getDockChunkCoords(x, z) {
  return {
    cx: Math.floor(Number(x)) >> 4,
    cz: Math.floor(Number(z)) >> 4
  };
}

function hasOtherExportDockInChunk(docks, x, z) {
  var target = getDockChunkCoords(x, z);
  var i = 0;
  var cur = null;
  if (!Array.isArray(docks)) return false;
  for (i = 0; i < docks.length; i++) {
    if (!docks[i]) continue;
    cur = getDockChunkCoords(docks[i].x, docks[i].z);
    if (cur.cx === target.cx && cur.cz === target.cz) {
      return true;
    }
  }
  return false;
}

function setExportDockChunkForceload(server, x, z, enable) {
  var bx = Math.floor(Number(x));
  var bz = Math.floor(Number(z));
  var action = enable ? 'add' : 'remove';
  var cmd = `execute in minecraft:overworld run forceload ${action} ${bx} ${bz}`;
  if (!server || typeof server.runCommandSilent !== 'function') {
    return false;
  }
  try {
    server.runCommandSilent(cmd);
    return true;
  } catch (err) {
    logExportDockErrorOnce(
      `forceload:${action}:${bx >> 4},${bz >> 4}`,
      `(${bx}, ${bz}, forceload ${action})`,
      err
    );
    return false;
  }
}

function syncExportDocksForceload(server) {
  var docks = readExportDocks(server);
  var seen = {};
  var count = 0;
  var i = 0;
  var c = null;
  var key = '';
  if (!server || docks.length === 0) return 0;
  for (i = 0; i < docks.length; i++) {
    if (!docks[i]) continue;
    c = getDockChunkCoords(docks[i].x, docks[i].z);
    key = `${c.cx},${c.cz}`;
    if (seen[key]) continue;
    seen[key] = true;
    if (setExportDockChunkForceload(server, docks[i].x, docks[i].z, true)) {
      count++;
    }
  }
  return count;
}

function getExportPendingCoins(server) {
  if (!server || !server.persistentData) return 0;
  return Math.max(0, Number(server.persistentData.getLong(EXPORT_PENDING_KEY) || 0));
}

function setExportPendingCoins(server, amount) {
  if (!server || !server.persistentData) return;
  server.persistentData.putLong(EXPORT_PENDING_KEY, Math.max(0, Math.floor(Number(amount) || 0)));
}

function findPlayerFirstTeamId(player) {
  var api = null;
  var teamApi = null;
  var teams = null;
  var len = 0;
  var i = 0;
  var t = null;
  if (!player) return -1;
  try {
    api = getLightmansApiClasses();
    if (api && api.TeamAPI && typeof api.TeamAPI.getApi === 'function') {
      teamApi = api.TeamAPI.getApi();
      teams =
        teamApi && typeof teamApi.GetAllTeamsForPlayer === 'function'
          ? teamApi.GetAllTeamsForPlayer(player)
          : null;
      if (teams) {
        len = typeof teams.size === 'function' ? teams.size() : teams.length || 0;
        for (i = 0; i < len; i++) {
          t = typeof teams.get === 'function' ? teams.get(i) : teams[i];
          if (!t) continue;
          if (typeof t.hasBankAccount === 'function' && !t.hasBankAccount()) continue;
          if (typeof t.getID === 'function') return Number(t.getID());
        }
      }
    }
  } catch (err) {
    // Brak drużyny LC
  }
  return -1;
}

function resolveExportBlockInventory(blk) {
  var inv = null;
  if (!blk) return null;
  try {
    if (blk.inventory) {
      inv = blk.inventory;
    }
  } catch (e1) {
    inv = null;
  }
  if (!inv && typeof blk.getInventory === 'function') {
    try {
      inv = blk.getInventory();
    } catch (e2) {
      inv = null;
    }
    if (!inv) {
      try {
        inv = blk.getInventory(null);
      } catch (e3) {
        inv = null;
      }
    }
  }
  if (!inv && blk.entity) {
    if (
      (typeof blk.entity.getSlots === 'function' && typeof blk.entity.getStackInSlot === 'function') ||
      (typeof blk.entity.getContainerSize === 'function' && typeof blk.entity.getItem === 'function')
    ) {
      inv = blk.entity;
    }
  }
  return inv;
}

function resolveTargetExportContainer(player) {
  var hit = null;
  var blk = null;
  var dim = '';
  if (!player) return null;
  try {
    if (typeof player.rayTrace === 'function') {
      hit = player.rayTrace(6);
      if (hit && hit.block && resolveExportBlockInventory(hit.block)) {
        blk = hit.block;
      }
    }
    if (!blk && player.level && typeof player.level.getBlock === 'function') {
      var under = player.level.getBlock(Math.floor(player.x), Math.floor(player.y) - 1, Math.floor(player.z));
      if (under && resolveExportBlockInventory(under)) {
        blk = under;
      }
    }
    if (!blk) return null;
    dim = player.level && player.level.dimension != null ? String(player.level.dimension) : 'minecraft:overworld';
    return {
      x: Math.floor(Number(blk.x != null ? blk.x : blk.pos ? blk.pos.x : 0)),
      y: Math.floor(Number(blk.y != null ? blk.y : blk.pos ? blk.pos.y : 0)),
      z: Math.floor(Number(blk.z != null ? blk.z : blk.pos ? blk.pos.z : 0)),
      blockId: String(blk.id || 'container'),
      dimension: dim
    };
  } catch (err) {
    return null;
  }
}

function handleAddExportDock(player, server) {
  var target = resolveTargetExportContainer(player);
  var docks = null;
  var i = 0;
  var teamId = -1;

  if (!target) {
    player.tell(
      Text.yellow(
        '[Dok Eksportowy] Spójrz (max 6 bloków) na skrzynię, beczkę lub Create Item Vault na Wyspie-Rynku i wpisz /rynek_eksport dodaj.'
      )
    );
    return 0;
  }

  if (!isCoordsOnMarketIsland(target.x, target.z, target.dimension)) {
    player.tell(
      Text.red(
        `[Dok Eksportowy] Automatyczny Dok Eksportowy można zarejestrować wyłącznie na Wyspie-Rynku (${MARKET_ISLAND_CENTER.x}, ${MARKET_ISLAND_CENTER.y}, ${MARKET_ISLAND_CENTER.z}, promień ${MARKET_ISLAND_RADIUS} bloków)!`
      )
    );
    return 0;
  }

  docks = readExportDocks(server);
  for (i = 0; i < docks.length; i++) {
    if (docks[i].x === target.x && docks[i].y === target.y && docks[i].z === target.z) {
      player.tell(Text.yellow('[Dok Eksportowy] Ten kontener jest już zarejestrowany jako Dok Eksportowy!'));
      return 0;
    }
  }

  var dockLimit = getEffectiveExportDockLimit(server);
  if (docks.length >= dockLimit) {
    player.tell(
      Text.red(
        `[Dok Eksportowy] Osiągnięto limit ${dockLimit} doków eksportowych dla obecnego Etapu (rośnie w Stage 3/4/5 do 8!). Usuń stary dok przez /rynek_eksport usun <nr>.`
      )
    );
    return 0;
  }

  teamId = findPlayerFirstTeamId(player);
  docks.push({
    x: target.x,
    y: target.y,
    z: target.z,
    blockId: target.blockId,
    owner: String(player.username || ''),
    teamId: teamId
  });
  writeExportDocks(server, docks);
  setExportDockChunkForceload(server, target.x, target.z, true);

  var bonusCfg = getMarketBonusesConfig(false);
  var chunkCoords = getDockChunkCoords(target.x, target.z);
  player.tell(
    Text.green(`✅ [Dok Eksportowy #${docks.length}/${dockLimit}] Zarejestrowano ${target.blockId} na (${target.x}, ${target.y}, ${target.z})! `)
      .append(
        Text.gold(
          `Premia logistyczna: +${bonusCfg.export_dock_bonus_percent}% (+ Boom +${bonusCfg.market_boom_bonus_percent}% + Różnorodność + Perki Etapu, limit +${bonusCfg.max_combined_bonus_percent}%)`
        )
      )
      .append(
        Text.gray(
          teamId >= 0
            ? ' • Przelewy automatycznie trafią na Bank Drużyny LC co 30 s.'
            : ' • Przelewy trafią na Twój Bank LC (lub /rynek_eksport odbierz) co 30 s.'
        )
      )
      .append(
        Text.aqua(
          ` • Chunk doku (${chunkCoords.cx}, ${chunkCoords.cz}) jest automatycznie trzymany w pamięci (forceload).`
        )
      )
  );
  return 1;
}

function handleListExportDocks(player, server) {
  var docks = readExportDocks(server);
  var dockLimit = getEffectiveExportDockLimit(server);
  var pending = getExportPendingCoins(server);
  var i = 0;
  var d = null;

  player.tell(Text.gold(`=== Automatyczne Doki Eksportowe Wyspy-Rynku (${docks.length}/${dockLimit}) ===`));
  if (docks.length === 0) {
    player.tell(
      Text.gray('Brak zarejestrowanych doków. Spójrz na skrzynię/Item Vault na Wyspie-Rynku i wpisz /rynek_eksport dodaj.')
    );
  } else {
    for (i = 0; i < docks.length; i++) {
      d = docks[i];
      player.tell(
        Text.white(`• #${i + 1}: `)
          .append(Text.aqua(`${d.blockId}`))
          .append(Text.white(` (${d.x}, ${d.y}, ${d.z})`))
          .append(Text.gray(` | właściciel: ${d.owner || '?'}${d.teamId >= 0 ? ` (Team #${d.teamId})` : ''}`))
      );
    }
  }
  if (pending > 0) {
    player.tell(
      Text.yellow(`💰 Nieodebrane środki z doków: `)
        .append(Text.gold(`${formatCoins(pending)} monet`))
        .append(Text.gray(' — wpisz /rynek_eksport odbierz'))
    );
  }
  return 1;
}

function handleRemoveExportDock(player, server, indexArg) {
  var docks = readExportDocks(server);
  var target = null;
  var removeIdx = -1;
  var i = 0;
  var removed = null;

  if (docks.length === 0) {
    player.tell(Text.yellow('[Dok Eksportowy] Brak zarejestrowanych doków do usunięcia.'));
    return 0;
  }

  if (indexArg != null) {
    removeIdx = Math.floor(Number(indexArg)) - 1;
    if (removeIdx < 0 || removeIdx >= docks.length) {
      player.tell(Text.red(`[Dok Eksportowy] Niepoprawny numer doku (1..${docks.length}). Sprawdź /rynek_eksport lista.`));
      return 0;
    }
  } else {
    target = resolveTargetExportContainer(player);
    if (target) {
      for (i = 0; i < docks.length; i++) {
        if (docks[i].x === target.x && docks[i].y === target.y && docks[i].z === target.z) {
          removeIdx = i;
          break;
        }
      }
    }
    if (removeIdx === -1) {
      player.tell(Text.yellow('[Dok Eksportowy] Spójrz na zarejestrowany dok albo podaj numer: /rynek_eksport usun <nr>.'));
      return 0;
    }
  }

  removed = docks.splice(removeIdx, 1)[0];
  writeExportDocks(server, docks);
  delete EXPORT_DOCK_LOGGED_ERRORS[`${removed.x},${removed.y},${removed.z}`];
  var keepChunkLoaded = hasOtherExportDockInChunk(docks, removed.x, removed.z);
  var dockLimit = getEffectiveExportDockLimit(server);
  var removedChunk = getDockChunkCoords(removed.x, removed.z);
  if (!keepChunkLoaded) {
    setExportDockChunkForceload(server, removed.x, removed.z, false);
  }
  player.tell(
    Text.green(
      `[Dok Eksportowy] Usunięto dok (${removed.x}, ${removed.y}, ${removed.z}). Pozostało: ${docks.length}/${dockLimit}.`
    ).append(
      Text.gray(
        keepChunkLoaded
          ? ` Chunk (${removedChunk.cx}, ${removedChunk.cz}) pozostaje w pamięci (inny dok w tym chunku).`
          : ` Zwolniono forceload chunku (${removedChunk.cx}, ${removedChunk.cz}).`
      )
    )
  );
  return 1;
}

function handleClaimExportPending(player, server) {
  var pending = getExportPendingCoins(server);
  if (pending <= 0) {
    player.tell(Text.gray('[Dok Eksportowy] Brak nieodebranych monet (wszystkie wpływy trafiły bezpośrednio na Bank LC).'));
    return 0;
  }
  setExportPendingCoins(server, 0);
  giveCoinsToPlayer(player, pending);
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }
  player.tell(
    Text.green('[Dok Eksportowy] Odebrano zaległe wpływy z automatycznego eksportu: ')
      .append(Text.gold(`${formatCoins(pending)} monet`))
      .append(Text.green('!'))
  );
  return 1;
}

function extractExportFromInventory(inv, catalog, currentStage) {
  var soldLines = [];
  var soldIds = [];
  var totalItems = 0;
  var size = 0;
  var useItemHandler = false;
  var s = 0;
  var stack = null;
  var itemId = '';
  var entry = null;
  var have = 0;
  var packs = 0;
  var toRemove = 0;
  var extracted = null;

  if (!inv) {
    return { soldLines: soldLines, soldIds: soldIds, totalItems: 0 };
  }

  if (typeof inv.getSlots === 'function' && typeof inv.getStackInSlot === 'function' && typeof inv.extractItem === 'function') {
    useItemHandler = true;
    size = Number(inv.getSlots() || 0);
  } else if (typeof inv.getContainerSize === 'function' && typeof inv.getItem === 'function') {
    size = Number(inv.getContainerSize() || 0);
  } else if (typeof inv.slots === 'number' && typeof inv.getStackInSlot === 'function') {
    useItemHandler = typeof inv.extractItem === 'function';
    size = inv.slots;
  }

  for (s = 0; s < size; s++) {
    stack = useItemHandler ? inv.getStackInSlot(s) : inv.getItem(s);
    if (!stack || (typeof stack.isEmpty === 'function' && stack.isEmpty())) continue;
    itemId = String(stack.id || '');
    if (!itemId || catalog.tier0[itemId]) continue;
    entry = catalog.sellById[itemId];
    if (!entry) continue;
    if (currentStage != null && entry.sellStage > Number(currentStage)) continue;

    have = Number(stack.count || 0);
    packs = Math.floor(have / entry.packSize);
    if (packs <= 0) continue;

    toRemove = packs * entry.packSize;
    if (useItemHandler) {
      extracted = inv.extractItem(s, toRemove, false);
      toRemove = extracted && !extracted.isEmpty() ? Number(extracted.count || 0) : 0;
      packs = Math.floor(toRemove / entry.packSize);
      if (packs <= 0) continue;
    } else {
      stack.shrink(toRemove);
      if (typeof inv.setChanged === 'function') {
        inv.setChanged();
      }
    }

    soldLines.push({
      itemId: itemId,
      soldItems: packs * entry.packSize,
      payout: packs * entry.wholesale
    });
    soldIds.push(itemId);
    totalItems += packs * entry.packSize;
  }

  return { soldLines: soldLines, soldIds: soldIds, totalItems: totalItems };
}

function processExportDocksTick(server, nowMs) {
  var docks = readExportDocks(server);
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var overworld = null;
  var catalog = null;
  var currentStage = 0;
  var boom = null;
  var totalDeposited = 0;
  var totalPendingAdded = 0;
  var totalItemsSold = 0;
  var i = 0;
  var d = null;
  var blk = null;
  var ex = null;
  var div = null;
  var j = 0;
  var dockPayout = 0;
  var logBase = 0;
  var dyn = null;
  var depRes = null;

  if (!server || docks.length === 0) {
    return { itemsSold: 0, deposited: 0, pendingAdded: 0 };
  }

  try {
    overworld =
      typeof server.overworld === 'function' ? server.overworld() : server.overworld || server.level || null;
  } catch (errOw) {
    logExportDockErrorOnce('__overworld__', '(Overworld)', errOw);
    return { itemsSold: 0, deposited: 0, pendingAdded: 0 };
  }
  if (!overworld || typeof overworld.getBlock !== 'function') {
    return { itemsSold: 0, deposited: 0, pendingAdded: 0 };
  }

  catalog = getMarketCatalog(false);
  currentStage = getCurrentUnlockedStage(null, server);
  boom = getOrRollMarketBoom(server, now);

  for (i = 0; i < docks.length; i++) {
    d = docks[i];
    if (!d || !isCoordsOnMarketIsland(Number(d.x), Number(d.z), 'minecraft:overworld')) continue;
    try {
      // Nie wymuszaj ładowania niezaładowanych chunków (ochrona TPS Exaroton)
      // MC 1.21.1: `LevelReader.hasChunk(cx, cz)` / `Level.isLoaded(BlockPos)` (#89)
      if (!isExportDockChunkLoaded(overworld, d.x, d.y, d.z)) {
        continue;
      }
      blk = overworld.getBlock(d.x, d.y, d.z);
      var dockInv = resolveExportBlockInventory(blk);
      if (!dockInv) continue;

      ex = extractExportFromInventory(dockInv, catalog, currentStage);
      if (ex.totalItems <= 0) continue;

      var dockDiversityEntries = [];
      for (j = 0; j < ex.soldLines.length; j++) {
        dockDiversityEntries.push({
          itemId: ex.soldLines[j].itemId,
          value: ex.soldLines[j].payout
        });
      }
      div = recordDiversitySales(server, dockDiversityEntries, now);
      dockPayout = 0;
      var dockBreakdown = [];
      for (j = 0; j < ex.soldLines.length; j++) {
        dyn = applyDynamicMarketBonuses(server, ex.soldLines[j].payout, ex.soldLines[j].itemId, div, boom, {
          onMarket: true,
          isExportDock: true
        });
        dockPayout += dyn.finalPayout;
        dockBreakdown.push({
          itemId: ex.soldLines[j].itemId,
          soldItems: ex.soldLines[j].soldItems,
          payout: dyn.finalPayout
        });
      }

      if (dockPayout <= 0) continue;
      recordExportStats(server, dockPayout, ex.totalItems, '[Dok Eksportowy]', dockBreakdown);
      totalItemsSold += ex.totalItems;

      depRes = depositCoinsToBank(server, d.owner, d.teamId, dockPayout);
      if (depRes && depRes.deposited) {
        totalDeposited += dockPayout;
      } else {
        setExportPendingCoins(server, getExportPendingCoins(server) + dockPayout);
        totalPendingAdded += dockPayout;
      }
    } catch (errDock) {
      // Pojedynczy błędny dok nie przerywa reszty, ale błąd zawsze trafia do logu (raz na dok do restartu, #89)
      logExportDockErrorOnce(`${d.x},${d.y},${d.z}`, `(${d.x}, ${d.y}, ${d.z})`, errDock);
    }
  }

  if (totalDeposited > 0 && typeof syncAllPlayersTabBalance === 'function') {
    try {
      syncAllPlayersTabBalance(server);
    } catch (errTab) {
      // Ignoruj
    }
  }

  return {
    itemsSold: totalItemsSold,
    deposited: totalDeposited,
    pendingAdded: totalPendingAdded
  };
}

function countItemInExportInventory(inv, targetId) {
  var total = 0;
  var size = 0;
  var useItemHandler = false;
  var s = 0;
  var stack = null;
  if (!inv) return 0;
  if (typeof inv.getSlots === 'function' && typeof inv.getStackInSlot === 'function') {
    useItemHandler = true;
    size = Number(inv.getSlots() || 0);
  } else if (typeof inv.getContainerSize === 'function' && typeof inv.getItem === 'function') {
    size = Number(inv.getContainerSize() || 0);
  }
  for (s = 0; s < size; s++) {
    stack = useItemHandler ? inv.getStackInSlot(s) : inv.getItem(s);
    if (!stack || (typeof stack.isEmpty === 'function' && stack.isEmpty())) continue;
    if (String(stack.id || '') === targetId) {
      total += Number(stack.count || 0);
    }
  }
  return total;
}

function putExportSmokeTestItem(inv, slot, itemStack) {
  if (!inv) return false;
  if (typeof inv.insertItem === 'function') {
    inv.insertItem(slot, itemStack, false);
    return true;
  }
  if (typeof inv.setItem === 'function') {
    inv.setItem(slot, itemStack);
    return true;
  }
  return false;
}

/**
 * End-to-end smoke-test Doku Eksportowego na żywym serwerze NeoForge 1.21.1 (CI `server-boot`, #89).
 * Sprawdza bez graczy online:
 * 1) czy chunk [9, 0] po `forceload add 152 0` jest załadowany według `isExportDockChunkLoaded` (`hasChunk`),
 * 2) ekstrakcję i wypłatę 16x `minecraft:bread` z prawdziwej skrzyni `minecraft:chest` (z zachowaniem 32x cobble),
 * 3) ekstrakcję i wypłatę 16x `minecraft:bread` z prawdziwego `create:item_vault`,
 * 4) pełne posprzątanie bloków, stanu persistentData i zdjęcie `forceload`.
 */
function handleRunExportDockSmokeTest(server) {
  var overworld = null;
  var hasChunkMethod = false;
  var chunkLoaded = false;
  var savedDocksRaw = '';
  var savedPending = 0;
  var savedDiversityRaw = '';
  var savedByPlayerRaw = '';
  var savedByItemRaw = '';
  var savedStatsEarned = 0;
  var savedStatsItems = 0;
  var savedDocksArr = [];
  var statsTag = null;
  var chestRes = null;
  var chestBlk = null;
  var chestInv = null;
  var chestInvAfter = null;
  var chestDiag = '';
  var breadLeft = -1;
  var cobbleLeft = -1;
  var vaultBlk = null;
  var vaultInv = null;
  var vaultInvAfter = null;
  var vaultRes = null;
  var vaultBreadLeft = -1;
  var hadSavedDockInChunk = false;

  if (!server || !server.persistentData) {
    return { ok: false, error: 'Brak obiektu serwera lub persistentData' };
  }

  overworld =
    typeof server.overworld === 'function' ? server.overworld() : server.overworld || server.level || null;
  if (!overworld || typeof overworld.getBlock !== 'function') {
    return { ok: false, error: 'Brak Overworld lub metody getBlock' };
  }

  hasChunkMethod = typeof overworld.hasChunk === 'function';
  chunkLoaded = isExportDockChunkLoaded(overworld, 150, 65, 2);
  if (!hasChunkMethod || !chunkLoaded) {
    return {
      ok: false,
      error: `Oczekiwano hasChunk=true i chunkLoaded=true dla (150, 65, 2), otrzymano hasChunk=${hasChunkMethod}, chunkLoaded=${chunkLoaded}`
    };
  }

  savedDocksRaw = String(server.persistentData.getString(EXPORT_DOCKS_KEY) || '');
  savedDocksArr = readExportDocks(server);
  hadSavedDockInChunk = hasOtherExportDockInChunk(savedDocksArr, 152, 0);
  savedPending = getExportPendingCoins(server);
  savedDiversityRaw = String(server.persistentData.getString(MARKET_DIVERSITY_KEY) || '');
  savedByPlayerRaw = String(server.persistentData.getString(TYCOON_EXPORT_BY_PLAYER_KEY) || '');
  savedByItemRaw = String(server.persistentData.getString(TYCOON_EXPORT_BY_ITEM_KEY) || '');
  statsTag = server.persistentData.getCompound(MARKET_STATS_KEY);
  savedStatsEarned = Number(statsTag.getLong('total_earned') || 0);
  savedStatsItems = Number(statsTag.getLong('total_items_sold') || 0);

  try {
    // 1) Test skrzyni `minecraft:chest` na wolnym polu placu (150, 65, 2) w chunku [9, 0]
    overworld.getBlock(150, 65, 2).set('minecraft:chest');
    chestBlk = overworld.getBlock(150, 65, 2);
    chestInv = resolveExportBlockInventory(chestBlk);
    chestDiag = `blkId=${chestBlk ? chestBlk.id : 'null'}, hasEntity=${Boolean(chestBlk && chestBlk.entity)}, hasPropInv=${Boolean(chestBlk && chestBlk.inventory)}, hasResolvedInv=${Boolean(chestInv)}`;
    if (!chestInv) {
      return { ok: false, error: `Skrzynia nie udostępnia inventory (${chestDiag})` };
    }
    putExportSmokeTestItem(chestInv, 0, Item.of('minecraft:bread', 16));
    putExportSmokeTestItem(chestInv, 1, Item.of('minecraft:cobblestone', 32));

    writeExportDocks(server, [
      { x: 150, y: 65, z: 2, blockId: 'minecraft:chest', owner: '__boot_test__', teamId: -1 }
    ]);
    chestRes = processExportDocksTick(server, Date.now());
    chestBlk = overworld.getBlock(150, 65, 2);
    chestInvAfter = resolveExportBlockInventory(chestBlk);
    breadLeft = chestInvAfter ? countItemInExportInventory(chestInvAfter, 'minecraft:bread') : -1;
    cobbleLeft = chestInvAfter ? countItemInExportInventory(chestInvAfter, 'minecraft:cobblestone') : -1;

    if (!chestRes || chestRes.itemsSold !== 16 || chestRes.pendingAdded <= 0 || breadLeft !== 0 || cobbleLeft !== 32) {
      return {
        ok: false,
        error: `Test skrzyni nieudany: itemsSold=${chestRes && chestRes.itemsSold}, pendingAdded=${chestRes && chestRes.pendingAdded}, breadLeft=${breadLeft}, cobbleLeft=${cobbleLeft}, diag=(${chestDiag})`
      };
    }

    // 2) Test `create:item_vault` na wolnym polu placu (150, 65, 4) w tym samym chunku [9, 0]
    overworld.getBlock(150, 65, 4).set('create:item_vault');
    vaultBlk = overworld.getBlock(150, 65, 4);
    vaultInv = resolveExportBlockInventory(vaultBlk);
    if (!vaultInv) {
      return {
        ok: false,
        error: `create:item_vault nie udostępnia inventory (blkId=${vaultBlk ? vaultBlk.id : 'null'}, hasEntity=${Boolean(vaultBlk && vaultBlk.entity)}, hasPropInv=${Boolean(vaultBlk && vaultBlk.inventory)})`
      };
    }
    putExportSmokeTestItem(vaultInv, 0, Item.of('minecraft:bread', 16));

    writeExportDocks(server, [
      { x: 150, y: 65, z: 4, blockId: 'create:item_vault', owner: '__boot_test__', teamId: -1 }
    ]);
    vaultRes = processExportDocksTick(server, Date.now());
    vaultBlk = overworld.getBlock(150, 65, 4);
    vaultInvAfter = resolveExportBlockInventory(vaultBlk);
    vaultBreadLeft = vaultInvAfter ? countItemInExportInventory(vaultInvAfter, 'minecraft:bread') : -1;

    if (!vaultRes || vaultRes.itemsSold !== 16 || vaultRes.pendingAdded <= 0 || vaultBreadLeft !== 0) {
      return {
        ok: false,
        error: `Test create:item_vault nieudany: itemsSold=${vaultRes && vaultRes.itemsSold}, pendingAdded=${vaultRes && vaultRes.pendingAdded}, vaultBreadLeft=${vaultBreadLeft}`
      };
    }

    return {
      ok: true,
      summary: `[HalucynacjeGTP2] [ExportDockTest] PASS: hasChunk=true, chestSold=${chestRes.itemsSold} (+${chestRes.pendingAdded} monet), vaultSold=${vaultRes.itemsSold} (+${vaultRes.pendingAdded} monet), cobbleUntouched=${cobbleLeft}, forceload=removed (${chestDiag}).`
    };
  } catch (errTest) {
    return { ok: false, error: String(errTest) };
  } finally {
    try {
      overworld.getBlock(150, 65, 2).set('minecraft:air');
      overworld.getBlock(150, 65, 4).set('minecraft:air');
    } catch (errCleanBlk) {
      // Ignoruj przy sprzątaniu
    }
    server.persistentData.putString(EXPORT_DOCKS_KEY, savedDocksRaw);
    setExportPendingCoins(server, savedPending);
    server.persistentData.putString(MARKET_DIVERSITY_KEY, savedDiversityRaw);
    server.persistentData.putString(TYCOON_EXPORT_BY_PLAYER_KEY, savedByPlayerRaw);
    server.persistentData.putString(TYCOON_EXPORT_BY_ITEM_KEY, savedByItemRaw);
    statsTag = server.persistentData.getCompound(MARKET_STATS_KEY);
    statsTag.putLong('total_earned', savedStatsEarned);
    statsTag.putLong('total_items_sold', savedStatsItems);
    server.persistentData.put(MARKET_STATS_KEY, statsTag);
    if (!hadSavedDockInChunk) {
      setExportDockChunkForceload(server, 152, 0, false);
    }
  }
}

// Przywrócenie forceload dla zapisanych Doków Eksportowych po starcie serwera (#89)
if (typeof ServerEvents !== 'undefined' && typeof ServerEvents.loaded === 'function') {
  ServerEvents.loaded((event) => {
    var srv = event && event.server ? event.server : null;
    if (!srv) return;
    var forced = syncExportDocksForceload(srv);
    if (forced > 0) {
      console.info(`[HalucynacjeGTP2] Przywrócono forceload dla ${forced} chunków Doków Eksportowych.`);
    }
  });
}

// Lekka rotacja Boomu Rynkowego (60 s) + skan Automatycznych Doków Eksportowych (30 s)
if (typeof ServerEvents !== 'undefined' && typeof ServerEvents.tick === 'function') {
  ServerEvents.tick((event) => {
    var srv = event && event.server ? event.server : null;
    if (!srv) return;

    MARKET_BOOM_TICK_COUNTER++;
    if (MARKET_BOOM_TICK_COUNTER >= MARKET_BOOM_TICK_INTERVAL) {
      MARKET_BOOM_TICK_COUNTER = 0;
      try {
        getOrRollMarketBoom(srv, Date.now());
      } catch (errBoom) {
        // Nie przerywaj pętli serwera
      }
    }

    EXPORT_DOCK_TICK_COUNTER++;
    if (EXPORT_DOCK_TICK_COUNTER >= EXPORT_DOCK_TICK_INTERVAL) {
      EXPORT_DOCK_TICK_COUNTER = 0;
      try {
        processExportDocksTick(srv, Date.now());
      } catch (errExport) {
        logExportDockErrorOnce('__tick__', '(cykl tick)', errExport);
      }
    }
  });
}

function handleReloadEconomy(server) {
  var cat = null;
  var shoppersRes = null;

  clearPricesJsonCache();
  cat = getMarketCatalog(true);

  if (typeof applyShoppersTier0ZeroWorth === 'function' && server) {
    try {
      shoppersRes = applyShoppersTier0ZeroWorth(server, true);
    } catch (err) {
      console.error(`[HalucynacjeGTP2] Błąd synchronizacji Shoppers podczas reloadu ekonomii: ${err}`);
    }
  }

  return {
    catalog: cat,
    marketSell: Object.keys(cat.sellById).length,
    marketBuy: cat.buyList.length,
    marketTier0: Object.keys(cat.tier0).length,
    shoppers: shoppersRes
  };
}

// ----------------------------------------------------------------------------
// Gating Terminala Lightman's Currency (RFC #83 Część B pkt 5)
// Zweryfikowane w bajtkodzie `lightmanscurrency-1.21-2.3.0.6.jar`:
// - `TradeEvent$PreTradeEvent` (ICancellableEvent): `addDenial(MutableComponent)`
//   dodaje alert błędu i anuluje transakcję (`FAIL_TRADE_RULE_DENIAL`).
// - `TradeEvent$PostTradeEvent`: inkrementuje wspólny licznik drużynowy
//   `halucynacje_team_buy_counts` identyczny z `/kup`.
// - `TraderData.isPersistent()` + `TraderData.getPersistentID()`: filtruje
//   wyłącznie sklepy sieciowe `halucynacje_kup_*` i `halucynacje_skup_*`.
// ----------------------------------------------------------------------------
const TERMINAL_DENIAL_COOLDOWN_MS = 500;
const TERMINAL_DENIAL_LAST_BY_PLAYER = {};

function notifyTerminalDenial(player, component) {
  var key = '';
  var now = Date.now();
  var prev = 0;
  if (!player || typeof player.tell !== 'function' || !component) {
    return;
  }
  key = String(player.username || 'player');
  prev = Number(TERMINAL_DENIAL_LAST_BY_PLAYER[key] || 0);
  if (prev > 0 && now - prev < TERMINAL_DENIAL_COOLDOWN_MS) {
    return;
  }
  TERMINAL_DENIAL_LAST_BY_PLAYER[key] = now;
  safeTellPlayer(player, component);
}

function getTerminalTraderPersistentId(trader) {
  var pid = '';
  if (!trader) return '';
  try {
    if (typeof trader.isPersistent === 'function' && !trader.isPersistent()) {
      return '';
    }
    if (typeof trader.getPersistentID === 'function') {
      pid = String(trader.getPersistentID() || '');
    } else if (trader.persistentID != null) {
      pid = String(trader.persistentID || '');
    }
  } catch (e) {
    pid = '';
  }
  return pid;
}

function isTerminalTradeSale(trade) {
  if (!trade) return false;
  try {
    if (typeof trade.isSale === 'function') return Boolean(trade.isSale());
    if (typeof trade.getTradeDirection === 'function') return String(trade.getTradeDirection()) === 'SALE';
  } catch (e) {
    return false;
  }
  return false;
}

function isTerminalTradePurchase(trade) {
  if (!trade) return false;
  try {
    if (typeof trade.isPurchase === 'function') return Boolean(trade.isPurchase());
    if (typeof trade.getTradeDirection === 'function') return String(trade.getTradeDirection()) === 'PURCHASE';
  } catch (e) {
    return false;
  }
  return false;
}

function extractStackItemId(stack) {
  var rawItem = null;
  var builtIn = null;
  var key = null;
  if (!stack) return '';
  try {
    if (typeof stack.isEmpty === 'function' && stack.isEmpty()) return '';
    if (stack.id) return String(stack.id);
    if (typeof stack.getItem === 'function') {
      rawItem = stack.getItem();
      if (rawItem) {
        if (rawItem.id) return String(rawItem.id);
        if (typeof rawItem.kjs$getId === 'function') return String(rawItem.kjs$getId());
        if (typeof Java !== 'undefined' && typeof Java.loadClass === 'function') {
          builtIn = Java.loadClass('net.minecraft.core.registries.BuiltInRegistries');
          if (builtIn && builtIn.ITEM && typeof builtIn.ITEM.getKey === 'function') {
            key = builtIn.ITEM.getKey(rawItem);
            if (key) return String(key);
          }
        }
      }
    }
  } catch (e) {
    return '';
  }
  return '';
}

function getTerminalTradeItemId(trade) {
  var stack = null;
  var id = '';
  if (!trade) return '';
  try {
    if (typeof trade.getSellItem === 'function') {
      stack = trade.getSellItem(0);
      id = extractStackItemId(stack);
      if (id) return id;
      stack = trade.getSellItem(1);
      id = extractStackItemId(stack);
      if (id) return id;
    }
  } catch (e) {
    return '';
  }
  return '';
}

function resolveTradeEventContext(event) {
  var context = null;
  var player = null;
  var server = null;
  var hooks = null;
  if (!event) return { context: null, player: null, server: null };
  try {
    context = typeof event.getContext === 'function' ? event.getContext() : event.context;
    if (context) {
      if (typeof context.hasPlayer === 'function') {
        if (context.hasPlayer() && typeof context.getPlayer === 'function') {
          player = context.getPlayer();
        }
      } else if (typeof context.getPlayer === 'function') {
        player = context.getPlayer();
      } else if (context.player) {
        player = context.player;
      }
    }
    if (player) {
      server = player.server || (player.level && player.level.server) || null;
    }
    if (!server && event.server) {
      server = event.server;
    }
    if (!server && typeof Java !== 'undefined' && typeof Java.loadClass === 'function') {
      hooks = Java.loadClass('net.neoforged.neoforge.server.ServerLifecycleHooks');
      if (hooks && typeof hooks.getCurrentServer === 'function') {
        server = hooks.getCurrentServer();
      }
    }
  } catch (e) {
    // Bezpieczny fallback
  }
  return { context: context, player: player, server: server };
}

function applyTerminalTradeDenial(event, player, msg) {
  if (event && typeof event.addDenial === 'function') {
    event.addDenial(msg);
  } else if (event && typeof event.setCanceled === 'function') {
    event.setCanceled(true);
  }
  notifyTerminalDenial(player, msg);
}

function handleTerminalPreTrade(event) {
  var trader = null;
  var trade = null;
  var pid = '';
  var isBuyShop = false;
  var isSellShop = false;
  var resolved = null;
  var context = null;
  var player = null;
  var server = null;
  var itemId = '';
  var catalog = null;
  var currentStage = 0;
  var buyEntry = null;
  var bought = 0;
  var sellDef = null;

  if (!event) return false;
  trader = typeof event.getTrader === 'function' ? event.getTrader() : event.trader;
  if (!trader) return false;
  if (typeof trader.isClient === 'function' && trader.isClient()) return false;

  pid = getTerminalTraderPersistentId(trader);
  if (!pid) return false;

  isBuyShop = pid.indexOf('halucynacje_kup_') === 0;
  isSellShop = pid.indexOf('halucynacje_skup_') === 0;
  if (!isBuyShop && !isSellShop) return false;

  trade = typeof event.getTrade === 'function' ? event.getTrade() : event.trade;
  if (!trade) return false;

  resolved = resolveTradeEventContext(event);
  context = resolved.context;
  player = resolved.player;
  server = resolved.server;
  if (context && context.isStorageMode) return false;
  if (player && player.level && typeof player.level.isClientSide === 'function' && player.level.isClientSide()) {
    return false;
  }

  itemId = getTerminalTradeItemId(trade);
  if (!itemId) return false;

  catalog = getMarketCatalog(false);
  currentStage = getCurrentUnlockedStage(player, server);

  if (isBuyShop && isTerminalTradeSale(trade)) {
    buyEntry = catalog.buyById[itemId] || catalog.buyByKey[itemId.toLowerCase()];
    if (!buyEntry) return false;
    if (currentStage < buyEntry.stage) {
      applyTerminalTradeDenial(event, player, buildBuyStageDeniedMessage(buyEntry, currentStage));
      return true;
    }
    if (buyEntry.teamLimit > 0) {
      bought = getTeamBuyCount(server, buyEntry.id);
      if (bought + 1 > buyEntry.teamLimit) {
        applyTerminalTradeDenial(event, player, buildBuyLimitDeniedMessage(buyEntry, bought));
        return true;
      }
    }
    return false;
  }

  if (isSellShop && isTerminalTradePurchase(trade)) {
    sellDef = catalog.sellById[itemId];
    if (!sellDef) return false;
    if (sellDef.sellStage > currentStage) {
      applyTerminalTradeDenial(event, player, buildSellStageDeniedMessage(sellDef.id, sellDef.sellStage, currentStage));
      return true;
    }
  }

  return false;
}

function handleTerminalPostTrade(event) {
  var trader = null;
  var trade = null;
  var pid = '';
  var resolved = null;
  var player = null;
  var server = null;
  var itemId = '';
  var catalog = null;
  var buyEntry = null;

  if (!event) return false;
  trader = typeof event.getTrader === 'function' ? event.getTrader() : event.trader;
  if (!trader) return false;
  if (typeof trader.isClient === 'function' && trader.isClient()) return false;

  pid = getTerminalTraderPersistentId(trader);
  if (!pid || pid.indexOf('halucynacje_kup_') !== 0) return false;

  trade = typeof event.getTrade === 'function' ? event.getTrade() : event.trade;
  if (!trade || !isTerminalTradeSale(trade)) return false;

  resolved = resolveTradeEventContext(event);
  player = resolved.player;
  server = resolved.server;
  if (player && player.level && typeof player.level.isClientSide === 'function' && player.level.isClientSide()) {
    return false;
  }

  itemId = getTerminalTradeItemId(trade);
  if (!itemId) return false;

  catalog = getMarketCatalog(false);
  buyEntry = catalog.buyById[itemId] || catalog.buyByKey[itemId.toLowerCase()];
  if (buyEntry && buyEntry.teamLimit > 0 && server) {
    addTeamBuyCount(server, buyEntry.id, 1);
  }
  if (player && server && typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }
  return true;
}

if (typeof NativeEvents !== 'undefined' && typeof NativeEvents.onEvent === 'function') {
  try {
    NativeEvents.onEvent(
      'io.github.lightman314.lightmanscurrency.api.events.TradeEvent$PreTradeEvent',
      function (event) {
        handleTerminalPreTrade(event);
      }
    );
    NativeEvents.onEvent(
      'io.github.lightman314.lightmanscurrency.api.events.TradeEvent$PostTradeEvent',
      function (event) {
        handleTerminalPostTrade(event);
      }
    );
    console.info(
      '[HalucynacjeGTP2] Zarejestrowano gating Terminala Lightman\'s Currency (PreTradeEvent / PostTradeEvent).'
    );
  } catch (errTradeEvents) {
    console.warn(`[HalucynacjeGTP2] Błąd rejestracji TradeEvent Lightman's Currency: ${errTradeEvents}`);
  }
}
