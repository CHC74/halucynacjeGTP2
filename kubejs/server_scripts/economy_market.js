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
          category: 'etapy',
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
          category: String(b.category || 'inne'),
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

// ----------------------------------------------------------------------------
// Dynamiczny Rynek (Issue #50):
// 1) Rotujący Boom Rynkowy (+40% co 20 minut na 1 towar dopasowany do Etapu).
// 2) Premia za Różnorodność Fabryk (+10% / +15% / +20% za 3 / 5 / 7+ różnych
//    towarów sprzedanych przez drużynę w oknie ostatnich 30 minut).
// ----------------------------------------------------------------------------
const MARKET_BOOM_KEY = 'halucynacje_market_boom';
const MARKET_BOOM_MULTIPLIER = 1.4; // +40%
const MARKET_BOOM_DURATION_MS = 1200000; // 20 minut
const MARKET_BOOM_TICK_INTERVAL = 1200; // sprawdzanie co 60 s (lekkie dla TPS)
const MARKET_DIVERSITY_KEY = 'halucynacje_diversity_window';
const MARKET_DIVERSITY_WINDOW_MS = 1800000; // 30 minut

// Zróżnicowanie marż i Automatyczny Dok Eksportowy na Wyspie-Rynku (Issue #48)
const REMOTE_SELL_MULTIPLIER = 0.85; // -15% opłaty kurierskiej poza Wyspą-Rynkiem
const EXPORT_DOCK_LOGISTICS_MULTIPLIER = 1.05; // +5% premii za zautomatyzowaną logistykę Create
const EXPORT_DOCKS_KEY = 'halucynacje_export_docks';
const EXPORT_PENDING_KEY = 'halucynacje_export_pending';
const EXPORT_DOCK_MAX = 4;
const EXPORT_DOCK_TICK_INTERVAL = 600; // skan doków co 30 s (bezpieczne dla TPS Exaroton)

let MARKET_BOOM_TICK_COUNTER = 0;
let EXPORT_DOCK_TICK_COUNTER = 0;

function getBoomEligibleItems(catalog, stage) {
  var allowedTierNums = [1];
  var pool = [];
  var i = 0;
  var t = null;
  var j = 0;

  if (stage <= 0) allowedTierNums = [1];
  else if (stage === 1) allowedTierNums = [1, 2];
  else if (stage === 2) allowedTierNums = [2, 3];
  else if (stage === 3) allowedTierNums = [3, 4];
  else allowedTierNums = [4, 5];

  for (i = 0; i < catalog.tiersList.length; i++) {
    t = catalog.tiersList[i];
    if (allowedTierNums.indexOf(t.tierNum) === -1) continue;
    for (j = 0; j < t.items.length; j++) {
      pool.push(t.items[j]);
    }
  }
  return pool;
}

function rollMarketBoom(server, previousItemId, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var catalog = getMarketCatalog(false);
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
  boostedPrice = Math.round(pick.wholesale * MARKET_BOOM_MULTIPLIER);

  boom = {
    itemId: pick.id,
    tierKey: pick.tierKey,
    basePrice: pick.wholesale,
    boostedPrice: boostedPrice,
    packSize: pick.packSize,
    expiresAtMs: now + MARKET_BOOM_DURATION_MS
  };

  if (server && server.persistentData) {
    tag = server.persistentData.getCompound(MARKET_BOOM_KEY);
    tag.putString('itemId', boom.itemId);
    tag.putString('tierKey', boom.tierKey);
    tag.putInt('basePrice', boom.basePrice);
    tag.putInt('boostedPrice', boom.boostedPrice);
    tag.putInt('packSize', boom.packSize);
    tag.putLong('expiresAtMs', boom.expiresAtMs);
    server.persistentData.put(MARKET_BOOM_KEY, tag);
  }

  if (server && typeof server.tell === 'function') {
    server.tell(
      Text.gold('🔥 [BOOM RYNKOWY +40%] ')
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
  var tag = null;
  var itemId = '';
  var expiresAtMs = 0;

  if (server && server.persistentData) {
    tag = server.persistentData.getCompound(MARKET_BOOM_KEY);
    itemId = tag ? String(tag.getString('itemId') || '') : '';
    expiresAtMs = tag ? Number(tag.getLong('expiresAtMs') || 0) : 0;
    if (itemId && expiresAtMs > now) {
      return {
        itemId: itemId,
        tierKey: String(tag.getString('tierKey') || ''),
        basePrice: Number(tag.getInt('basePrice') || 0),
        boostedPrice: Number(tag.getInt('boostedPrice') || 0),
        packSize: Number(tag.getInt('packSize') || 1),
        expiresAtMs: expiresAtMs
      };
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
  var ts = 0;

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
          ts = Number(parsed[k] || 0);
          if (ts > 0 && now - ts <= MARKET_DIVERSITY_WINDOW_MS) {
            result[k] = ts;
          }
        }
      }
    }
  } catch (err) {
    // Uszkodzony JSON nie blokuje sprzedaży
  }

  return result;
}

function getDiversityBonusForCount(uniqueCount) {
  if (uniqueCount >= 7) return { uniqueCount: uniqueCount, bonusPercent: 20, multiplier: 1.2 };
  if (uniqueCount >= 5) return { uniqueCount: uniqueCount, bonusPercent: 15, multiplier: 1.15 };
  if (uniqueCount >= 3) return { uniqueCount: uniqueCount, bonusPercent: 10, multiplier: 1.1 };
  return { uniqueCount: uniqueCount, bonusPercent: 0, multiplier: 1.0 };
}

function getCurrentDiversityStatus(server, nowMs) {
  const map = readDiversityMap(server, nowMs);
  return getDiversityBonusForCount(Object.keys(map).length);
}

function recordDiversitySales(server, itemIds, nowMs) {
  var now = nowMs != null ? Number(nowMs) : Date.now();
  var map = readDiversityMap(server, now);
  var i = 0;

  for (i = 0; i < itemIds.length; i++) {
    if (itemIds[i]) {
      map[String(itemIds[i])] = now;
    }
  }

  if (server && server.persistentData) {
    try {
      server.persistentData.putString(MARKET_DIVERSITY_KEY, JSON.stringify(map));
    } catch (err) {
      // Ignoruj ewentualny błąd zapisu
    }
  }

  return getDiversityBonusForCount(Object.keys(map).length);
}

function applyDynamicMarketBonuses(server, basePayout, itemId, diversityStatus, boom) {
  var isBoom = Boolean(boom && boom.itemId === itemId);
  var totalMult = 1.0;
  var finalPayout = basePayout;

  if (isBoom) {
    totalMult += MARKET_BOOM_MULTIPLIER - 1.0; // +0.40
  }
  if (diversityStatus && diversityStatus.bonusPercent > 0) {
    totalMult += diversityStatus.bonusPercent / 100.0; // +0.10 / +0.15 / +0.20
  }

  finalPayout = Math.round(basePayout * totalMult);
  return {
    finalPayout: finalPayout,
    bonusCoins: Math.max(0, finalPayout - basePayout),
    isBoom: isBoom,
    diversityPercent: diversityStatus ? diversityStatus.bonusPercent : 0,
    diversityCount: diversityStatus ? diversityStatus.uniqueCount : 0
  };
}

function handleShowMarketBoom(player, server) {
  const now = Date.now();
  const boom = getOrRollMarketBoom(server, now);
  const div = getCurrentDiversityStatus(server, now);

  player.tell(Text.gold('=== Giełda Dynamiczna HalucynacjeGTP2 ==='));
  if (boom) {
    const minsLeft = Math.max(1, Math.ceil((boom.expiresAtMs - now) / 60000));
    player.tell(
      Text.white('• 🔥 Boom Rynkowy (+40%): ')
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
          ? Text.green(`+${div.bonusPercent}% (${div.uniqueCount} różnych towarów)`)
          : Text.gray(`0% (${div.uniqueCount}/3 towarów do +10%)`)
      )
      .append(Text.gray(' | progi: 3 -> +10%, 5 -> +15%, 7+ -> +20%'))
  );
  return 1;
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

  const onMarket = typeof isPlayerOnMarketIsland === 'function' ? isPlayerOnMarketIsland(player) : true;
  const locationMult = onMarket ? 1.0 : REMOTE_SELL_MULTIPLIER;
  const locationBase = Math.max(1, Math.round(res.payout * locationMult));

  const now = Date.now();
  const boom = getOrRollMarketBoom(server, now);
  const div = recordDiversitySales(server, [res.itemId], now);
  const dyn = applyDynamicMarketBonuses(server, locationBase, res.itemId, div, boom);

  giveCoinsToPlayer(player, dyn.finalPayout);
  recordExportStats(server, dyn.finalPayout, res.soldItems, player.username || 'Gracz', [
    { itemId: res.itemId, soldItems: res.soldItems, payout: dyn.finalPayout }
  ]);
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  let bonusTags = '';
  if (!onMarket) bonusTags += ' 📦-15% kurier poza Rynkiem';
  if (dyn.isBoom) bonusTags += ' 🔥+40% Boom';
  if (dyn.diversityPercent > 0) bonusTags += ` 🏭+${dyn.diversityPercent}% Różnorodność`;

  player.tell(
    Text.green(`[Rynek Hurtowy] Sprzedano ${res.soldItems}x ${res.itemId} za `)
      .append(Text.gold(`${formatCoins(dyn.finalPayout)} monet`))
      .append(bonusTags ? Text.aqua(` (${bonusTags.trim()})`) : Text.green(''))
      .append(Text.green('! '))
      .append(
        Text.gray(
          onMarket
            ? `(Dok Eksportowy /rynek_eksport płaci +5%, a sklepy NPC ok. +${formatCoins(res.npcBonusPotential)} monet więcej!)`
            : `(Na Wyspie-Rynku 152,64,0 dostajesz 100%, a w Doku Eksportowym /rynek_eksport aż 105%!)`
        )
      )
  );
  return 1;
}

function handleSellAll(player, server) {
  const catalog = getMarketCatalog(false);
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;

  const soldLines = [];
  const soldIds = [];
  let totalItems = 0;
  let totalBonusPotential = 0;
  let blockedSkipped = 0;

  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty()) continue;
    const res = sellSingleStack(stack, catalog);
    if (res.status === 'sold') {
      soldLines.push(res);
      soldIds.push(res.itemId);
      totalItems += res.soldItems;
      totalBonusPotential += res.npcBonusPotential;
    } else if (res.status === 'blocked') {
      blockedSkipped++;
    }
  }

  if (soldLines.length === 0) {
    player.tell(
      Text.yellow(
        `[Rynek Hurtowy] Brak przetworzonych towarów Tier 1–5 do sprzedaży w ekwipunku${blockedSkipped > 0 ? ' (surowce Tier 0 zostały pominięte)' : ''}. Sprawdź /cennik 1.`
      )
    );
    return 0;
  }

  const onMarket = typeof isPlayerOnMarketIsland === 'function' ? isPlayerOnMarketIsland(player) : true;
  const locationMult = onMarket ? 1.0 : REMOTE_SELL_MULTIPLIER;

  const now = Date.now();
  const boom = getOrRollMarketBoom(server, now);
  const div = recordDiversitySales(server, soldIds, now);

  let totalPayout = 0;
  let boomHit = false;
  const statBreakdown = [];
  for (let j = 0; j < soldLines.length; j++) {
    const locBase = Math.max(1, Math.round(soldLines[j].payout * locationMult));
    const dyn = applyDynamicMarketBonuses(server, locBase, soldLines[j].itemId, div, boom);
    totalPayout += dyn.finalPayout;
    statBreakdown.push({
      itemId: soldLines[j].itemId,
      soldItems: soldLines[j].soldItems,
      payout: dyn.finalPayout
    });
    if (dyn.isBoom) boomHit = true;
  }

  giveCoinsToPlayer(player, totalPayout);
  recordExportStats(server, totalPayout, totalItems, player.username || 'Gracz', statBreakdown);
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  let bonusTags = '';
  if (!onMarket) bonusTags += ' 📦-15% kurier poza Rynkiem';
  if (boomHit) bonusTags += ' 🔥+40% Boom';
  if (div.bonusPercent > 0) bonusTags += ` 🏭+${div.bonusPercent}% Różnorodność (${div.uniqueCount} tow.)`;

  player.tell(
    Text.green(`[Rynek Hurtowy] Wyeksportowano łącznie ${totalItems} szt. towarów za `)
      .append(Text.gold(`${formatCoins(totalPayout)} monet`))
      .append(bonusTags ? Text.aqua(` (${bonusTags.trim()})`) : Text.green(''))
      .append(Text.green('! '))
      .append(
        Text.gray(
          onMarket
            ? `(Dok /rynek_eksport daje +5%, a sklepy NPC +${formatCoins(totalBonusPotential)} monet!)`
            : `(Na Wyspie-Rynku 152,64,0 dostajesz 100%, a przez pociąg + /rynek_eksport aż 105%!)`
        )
      )
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

  player.give(Item.of(entry.id, qty));
  if (entry.teamLimit > 0) {
    addTeamBuyCount(server, entry.id, qty);
  }
  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
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
      limitNote = entry.teamLimit > 0 ? ` (limit ${entry.teamLimit})` : '';
      aliasStr = String(entry.alias || entry.id || '?');
      noteStr = String(entry.note || '');
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
  const breakdown = computePlayerBalanceBreakdown(player);
  const cash = breakdown.total;
  const stats = server && server.persistentData ? server.persistentData.getCompound(MARKET_STATS_KEY) : null;
  const totalEarned = stats ? Number(stats.getLong('total_earned') || 0) : 0;
  const totalItems = stats ? Number(stats.getLong('total_items_sold') || 0) : 0;
  const now = Date.now();
  const boom = getOrRollMarketBoom(server, now);
  const diversity = getCurrentDiversityStatus(server, now);

  const nextToken = catalog.stageTokens[currentStage] || null;
  player.tell(Text.gold('=== Panel Ekonomii HalucynacjeGTP2 (Tycoon) ==='));
  player.tell(Text.white(`• Aktualny Etap drużyny: `).append(Text.aqua(`Stage ${currentStage} / 5`)));
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
      Text.white(`• Boom Rynkowy (+40%): `)
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
          : Text.gray('0% (sprzedaj 3/5/7 różnych towarów)')
      )
      .append(Text.gray(` (${diversity.uniqueCount} towarów)`))
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
      Text.gold('★ Osiągnięto Stage 5! Opcjonalny cel flex: /kup creative_motor (2 000 000 monet, limit 2 szt.).')
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
            ? ` | Shoppers: ${reloadRes.shoppers.total} cen (${reloadRes.shoppers.tier0} Tier 0 + ${reloadRes.shoppers.npc} NPC)`
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
    console.warn(`[HalucynacjeGTP2] Nie udało się zapisać listy doków eksportowych: ${err}`);
  }
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

function resolveTargetExportContainer(player) {
  var hit = null;
  var blk = null;
  var dim = '';
  if (!player) return null;
  try {
    if (typeof player.rayTrace === 'function') {
      hit = player.rayTrace(6);
      if (hit && hit.block && hit.block.inventory) {
        blk = hit.block;
      }
    }
    if (!blk && player.level && typeof player.level.getBlock === 'function') {
      var under = player.level.getBlock(Math.floor(player.x), Math.floor(player.y) - 1, Math.floor(player.z));
      if (under && under.inventory) {
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

  if (docks.length >= EXPORT_DOCK_MAX) {
    player.tell(
      Text.red(
        `[Dok Eksportowy] Osiągnięto limit ${EXPORT_DOCK_MAX} doków eksportowych na serwer (ochrona TPS). Usuń stary dok przez /rynek_eksport usun <nr>.`
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

  player.tell(
    Text.green(`✅ [Dok Eksportowy #${docks.length}] Zarejestrowano ${target.blockId} na (${target.x}, ${target.y}, ${target.z})! `)
      .append(Text.gold('Premia logistyczna: +5% (+ Boom +40% + Różnorodność)'))
      .append(
        Text.gray(
          teamId >= 0
            ? ' • Przelewy automatycznie trafią na Bank Drużyny LC co 30 s.'
            : ' • Przelewy trafią na Twój Bank LC (lub /rynek_eksport odbierz) co 30 s.'
        )
      )
  );
  return 1;
}

function handleListExportDocks(player, server) {
  var docks = readExportDocks(server);
  var pending = getExportPendingCoins(server);
  var i = 0;
  var d = null;

  player.tell(Text.gold(`=== Automatyczne Doki Eksportowe Wyspy-Rynku (${docks.length}/${EXPORT_DOCK_MAX}) ===`));
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
  player.tell(
    Text.green(`[Dok Eksportowy] Usunięto dok (${removed.x}, ${removed.y}, ${removed.z}). Pozostało: ${docks.length}/${EXPORT_DOCK_MAX}.`)
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

function extractExportFromInventory(inv, catalog) {
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
    overworld = typeof server.overworld === 'function' ? server.overworld() : server.level || null;
  } catch (errOw) {
    return { itemsSold: 0, deposited: 0, pendingAdded: 0 };
  }
  if (!overworld || typeof overworld.getBlock !== 'function') {
    return { itemsSold: 0, deposited: 0, pendingAdded: 0 };
  }

  catalog = getMarketCatalog(false);
  boom = getOrRollMarketBoom(server, now);

  for (i = 0; i < docks.length; i++) {
    d = docks[i];
    if (!d || !isCoordsOnMarketIsland(Number(d.x), Number(d.z), 'minecraft:overworld')) continue;
    try {
      // Nie wymuszaj ładowania niezaładowanych chunków (ochrona TPS Exaroton)
      if (typeof overworld.isLoaded === 'function' && !overworld.isLoaded(d.x, d.y, d.z)) {
        continue;
      }
      blk = overworld.getBlock(d.x, d.y, d.z);
      if (!blk || !blk.inventory) continue;

      ex = extractExportFromInventory(blk.inventory, catalog);
      if (ex.totalItems <= 0) continue;

      div = recordDiversitySales(server, ex.soldIds, now);
      dockPayout = 0;
      var dockBreakdown = [];
      for (j = 0; j < ex.soldLines.length; j++) {
        logBase = Math.max(1, Math.round(ex.soldLines[j].payout * EXPORT_DOCK_LOGISTICS_MULTIPLIER));
        dyn = applyDynamicMarketBonuses(server, logBase, ex.soldLines[j].itemId, div, boom);
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
      // Pojedynczy błędny dok nie przerywa reszty
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
        // Nie przerywaj pętli serwera
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
