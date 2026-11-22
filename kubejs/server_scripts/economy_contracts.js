// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Dynamiczne Kontrakty Korporacyjne (Tycoon Export Contracts)
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7
//
// Cel mechaniki:
// Motywuje graczy do budowania różnorodnych, zautomatyzowanych linii produkcyjnych
// (zamiast klepania 1 towaru). Drużyna zawsze ma aktywny Kontrakt Eksportowy
// dopasowany do swojego aktualnego Etapu (Stage 0–5), płacący **+35% premii**
// ponad cenę hurtową w fizycznych monetach `Lightman's Currency`!
//
// Komendy (dla wszystkich graczy):
// - `/kontrakt`       — podgląd aktywnego kontraktu drużyny i postępu w ekwipunku
// - `/kontrakt oddaj` — realizacja kontraktu (pobiera towary, wypłaca +35% w LC)
// - `/kontrakt nowy`  — losowanie nowego kontraktu (cooldown 5 min = 300 s)
// ============================================================================

const CONTRACT_DATA_KEY = 'halucynacje_active_contract';
const CONTRACT_STATS_KEY = 'halucynacje_contract_stats';
const CONTRACT_BONUS_MULTIPLIER = 1.35; // +35% bazowo (rośnie z serią do +55% — Issue #50)
const CONTRACT_STREAK_STEP = 0.05; // +5% za każdy kolejny kontrakt w serii
const CONTRACT_STREAK_MAX_BONUS_STEPS = 4; // maks. +20% za serię (łącznie +55%)
const CONTRACT_MILESTONE_EVERY = 5; // co 5. kontrakt z rzędu = dodatkowa premia +25%
const CONTRACT_MILESTONE_EXTRA_RATE = 0.25;
const CONTRACT_REROLL_COOLDOWN_MS = 300000; // 5 minut

function getContractStreakMultiplier(streak) {
  const s = Math.max(0, Math.floor(Number(streak) || 0));
  const steps = Math.min(CONTRACT_STREAK_MAX_BONUS_STEPS, s);
  return Math.round((CONTRACT_BONUS_MULTIPLIER + steps * CONTRACT_STREAK_STEP) * 100) / 100;
}

function getCurrentContractStreak(server) {
  if (!server || !server.persistentData) return 0;
  const stats = server.persistentData.getCompound(CONTRACT_STATS_KEY);
  return Math.max(0, Number(stats ? stats.getInt('streak') || 0 : 0));
}

// Jakie Tiery z `prices.json` oraz ile pakietów losujemy dla każdego Etapu (0..5)
const STAGE_CONTRACT_PROFILE = {
  0: { tiers: ['tier_1_start'], minPacks: 32, maxPacks: 64 },
  1: { tiers: ['tier_1_start', 'tier_2_kitchen'], minPacks: 24, maxPacks: 48 },
  2: { tiers: ['tier_2_kitchen', 'tier_3_luxury_bakery'], minPacks: 16, maxPacks: 32 },
  3: { tiers: ['tier_3_luxury_bakery', 'tier_4_create_industry'], minPacks: 12, maxPacks: 24 },
  4: { tiers: ['tier_4_create_industry', 'tier_5_hightech_export'], minPacks: 8, maxPacks: 16 },
  5: { tiers: ['tier_5_hightech_export'], minPacks: 10, maxPacks: 20 }
};

function loadContractPoolForStage(stage) {
  var profile = STAGE_CONTRACT_PROFILE[stage] || STAGE_CONTRACT_PROFILE[0];
  var pool = [];
  var parsedCfg = null;
  var t = 0;
  var i = 0;
  var tierKey = '';
  var tierObj = null;
  var tierItems = null;
  var it = null;

  try {
    parsedCfg = readPricesJson(false);
    if (parsedCfg && parsedCfg.sell_tiers) {
      for (t = 0; t < profile.tiers.length; t++) {
        tierKey = profile.tiers[t];
        tierObj = parsedCfg.sell_tiers[tierKey];
        tierItems = (tierObj && tierObj.items) || [];
        for (i = 0; i < tierItems.length; i++) {
          it = tierItems[i];
          if (!it || !it.id || !(it.wholesale_gui > 0)) continue;
          pool.push({
            id: String(it.id),
            packSize: it.pack_size && Number(it.pack_size) > 1 ? Number(it.pack_size) : 1,
            wholesale: Number(it.wholesale_gui),
            tierKey: tierKey
          });
        }
      }
    }
  } catch (err) {
    console.error(`[HalucynacjeGTP2] Błąd ładowania puli kontraktów: ${err}`);
  }

  return { profile: profile, pool: pool };
}

function rollNewContract(server, previousItemId) {
  const stage = getCurrentUnlockedStage(null, server);
  const { profile, pool } = loadContractPoolForStage(stage);
  if (pool.length === 0) {
    return null;
  }

  // Unikaj losowania dokładnie tego samego towaru dwa razy z rzędu (jeśli pula > 1)
  const filtered = pool.length > 1 && previousItemId
    ? pool.filter((x) => x.id !== previousItemId)
    : pool;
  const pick = filtered[Math.floor(Math.random() * filtered.length)];

  const span = Math.max(1, profile.maxPacks - profile.minPacks + 1);
  const packs = profile.minPacks + Math.floor(Math.random() * span);
  const requiredCount = packs * pick.packSize;
  const baseValue = packs * pick.wholesale;
  const streak = getCurrentContractStreak(server);
  const mult = getContractStreakMultiplier(streak);
  const payout = Math.round(baseValue * mult);
  const bonusPercent = Math.round((mult - 1) * 100);

  const contract = {
    itemId: pick.id,
    requiredCount: requiredCount,
    packs: packs,
    packSize: pick.packSize,
    baseValue: baseValue,
    payout: payout,
    bonusPercent: bonusPercent,
    streakAtRoll: streak,
    stage: stage,
    tierKey: pick.tierKey
  };

  if (server && server.persistentData) {
    const tag = server.persistentData.getCompound(CONTRACT_DATA_KEY);
    tag.putString('itemId', contract.itemId);
    tag.putInt('requiredCount', contract.requiredCount);
    tag.putInt('packs', contract.packs);
    tag.putInt('packSize', contract.packSize);
    tag.putInt('baseValue', contract.baseValue);
    tag.putInt('payout', contract.payout);
    tag.putInt('bonusPercent', contract.bonusPercent);
    tag.putInt('stage', contract.stage);
    tag.putString('tierKey', contract.tierKey);
    server.persistentData.put(CONTRACT_DATA_KEY, tag);
  }

  return contract;
}

function getOrCreateActiveContract(server) {
  if (server && server.persistentData) {
    const tag = server.persistentData.getCompound(CONTRACT_DATA_KEY);
    const itemId = tag ? String(tag.getString('itemId') || '') : '';
    const requiredCount = tag ? Number(tag.getInt('requiredCount') || 0) : 0;
    const payout = tag ? Number(tag.getInt('payout') || 0) : 0;
    if (itemId && requiredCount > 0 && payout > 0) {
      const baseValue = Number(tag.getInt('baseValue') || Math.round(payout / CONTRACT_BONUS_MULTIPLIER));
      const storedBonus = Number(tag.getInt('bonusPercent') || 0);
      return {
        itemId: itemId,
        requiredCount: requiredCount,
        packs: Number(tag.getInt('packs') || requiredCount),
        packSize: Number(tag.getInt('packSize') || 1),
        baseValue: baseValue,
        payout: payout,
        bonusPercent: storedBonus > 0 ? storedBonus : Math.round((payout / Math.max(1, baseValue) - 1) * 100),
        stage: Number(tag.getInt('stage') || 0),
        tierKey: String(tag.getString('tierKey') || '')
      };
    }
  }
  return rollNewContract(server, null);
}

function countItemInInventory(player, itemId) {
  if (!player || !player.inventory) return 0;
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
  let total = 0;
  for (let i = 0; i < size; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty()) continue;
    if (String(stack.id) === itemId) {
      total += stack.count;
    }
  }
  return total;
}

function removeItemFromInventory(player, itemId, amount) {
  const inv = player.inventory;
  const size = typeof inv.getContainerSize === 'function' ? inv.getContainerSize() : 36;
  let left = amount;
  for (let i = 0; i < size && left > 0; i++) {
    const stack = inv.getItem(i);
    if (!stack || stack.isEmpty() || String(stack.id) !== itemId) continue;
    const take = Math.min(stack.count, left);
    stack.shrink(take);
    left -= take;
  }
  return left === 0;
}

function handleShowContract(player, server) {
  const contract = getOrCreateActiveContract(server);
  if (!contract) {
    player.tell(Text.red('[Kontrakt] Nie udało się wczytać puli kontraktów z prices.json.'));
    return 0;
  }

  const have = countItemInInventory(player, contract.itemId);
  const stats = server && server.persistentData ? server.persistentData.getCompound(CONTRACT_STATS_KEY) : null;
  const completed = stats ? Number(stats.getInt('completed') || 0) : 0;
  const earned = stats ? Number(stats.getLong('total_payout') || 0) : 0;
  const streak = stats ? Number(stats.getInt('streak') || 0) : 0;
  const bestStreak = stats ? Number(stats.getInt('best_streak') || 0) : 0;

  player.tell(Text.gold(`=== Aktywny Kontrakt Korporacyjny (+${contract.bonusPercent}% premii!) ===`));
  player.tell(
    Text.white('• Towar: ')
      .append(Text.aqua(`${contract.requiredCount}x ${contract.itemId}`))
      .append(Text.gray(` (w ekwipunku: ${have}/${contract.requiredCount})`))
  );
  player.tell(
    Text.white('• Wypłata kontraktu: ')
      .append(Text.gold(`${formatCoins(contract.payout)} monet`))
      .append(Text.green(` (+${formatCoins(contract.payout - contract.baseValue)} premii względem hurtu!)`))
  );
  player.tell(
    Text.gray(
      `• Seria: ${streak} z rzędu (rekord: ${bestStreak}) | Ukończone: ${completed} (łącznie ${formatCoins(earned)} monet)`
    )
  );
  player.tell(
    Text.gray(
      'Komendy: /kontrakt oddaj (na Wyspie-Rynku 152,64,0) | /kontrakt nowy (zmiana co 5 min — resetuje serię!)'
    )
  );
  return 1;
}

function handleDeliverContract(player, server) {
  if (typeof isPlayerOnMarketIsland === 'function' && !isPlayerOnMarketIsland(player)) {
    player.tell(
      Text.red(
        `[Kontrakt] Zlecenia korporacyjne odbierane są wyłącznie na Wyspie-Rynku (${MARKET_ISLAND_CENTER.x}, ${MARKET_ISLAND_CENTER.y}, ${MARKET_ISLAND_CENTER.z}, promień ${MARKET_ISLAND_RADIUS} bloków w Overworldzie)!`
      ).append(Text.gray(' Dostarcz towary na Rynek (pociągiem / Chain Conveyor / mostem) i wpisz /kontrakt oddaj.'))
    );
    return 0;
  }

  const contract = getOrCreateActiveContract(server);
  if (!contract) {
    player.tell(Text.red('[Kontrakt] Brak aktywnego kontraktu.'));
    return 0;
  }

  const have = countItemInInventory(player, contract.itemId);
  if (have < contract.requiredCount) {
    player.tell(
      Text.yellow(
        `[Kontrakt] Za mało towaru w ekwipunku! Potrzebujesz ${contract.requiredCount}x ${contract.itemId}, masz ${have}.`
      )
    );
    return 0;
  }

  if (!removeItemFromInventory(player, contract.itemId, contract.requiredCount)) {
    player.tell(Text.red('[Kontrakt] Błąd pobierania towaru — anulowano.'));
    return 0;
  }

  const stats = server && server.persistentData ? server.persistentData.getCompound(CONTRACT_STATS_KEY) : null;
  const newStreak = stats ? Number(stats.getInt('streak') || 0) + 1 : 1;
  const bestStreak = stats ? Math.max(newStreak, Number(stats.getInt('best_streak') || 0)) : 1;

  const isMilestone = newStreak > 0 && newStreak % CONTRACT_MILESTONE_EVERY === 0;
  const milestoneBonus = isMilestone ? Math.round(contract.baseValue * CONTRACT_MILESTONE_EXTRA_RATE) : 0;
  const totalPayout = contract.payout + milestoneBonus;

  const coinStacks = splitIntoCoinStacks(totalPayout);
  for (let i = 0; i < coinStacks.length; i++) {
    player.give(Item.of(coinStacks[i].id, coinStacks[i].count));
  }

  if (stats && server && server.persistentData) {
    stats.putInt('completed', Number(stats.getInt('completed') || 0) + 1);
    stats.putInt('streak', newStreak);
    stats.putInt('best_streak', bestStreak);
    stats.putLong('total_payout', Number(stats.getLong('total_payout') || 0) + totalPayout);
    server.persistentData.put(CONTRACT_STATS_KEY, stats);
  }

  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  if (server && server.tell) {
    server.tell(
      Text.gold(`★ [Kontrakt Ukończony — Seria #${newStreak}] `)
        .append(Text.green(`${player.username}`))
        .append(Text.white(` zrealizował(a) dostawę ${contract.requiredCount}x ${contract.itemId} za `))
        .append(Text.gold(`${formatCoins(totalPayout)} monet (+${contract.bonusPercent}%)`))
        .append(
          isMilestone
            ? Text.aqua(` + 🏆 PREMIA SERII ${newStreak}: +${formatCoins(milestoneBonus)} monet!`)
            : Text.gold(' ★')
        )
    );
  }

  if (server && server.runCommandSilent) {
    server.runCommandSilent(
      `execute at ${player.username} run playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 0.8 1.2`
    );
  }

  const next = rollNewContract(server, contract.itemId);
  if (next) {
    player.tell(
      Text.aqua(`[Nowy Kontrakt (+${next.bonusPercent}%)] Następne zlecenie: ${next.requiredCount}x ${next.itemId} za `)
        .append(Text.gold(`${formatCoins(next.payout)} monet`))
        .append(Text.aqua('!'))
    );
  }
  return 1;
}

function handleRerollContract(player, server) {
  const now = Date.now();
  let hadStreak = 0;
  if (server && server.persistentData) {
    const stats = server.persistentData.getCompound(CONTRACT_STATS_KEY);
    const lastReroll = Number(stats.getLong('last_reroll_ms') || 0);
    if (lastReroll > 0 && now - lastReroll < CONTRACT_REROLL_COOLDOWN_MS) {
      const waitSec = Math.ceil((CONTRACT_REROLL_COOLDOWN_MS - (now - lastReroll)) / 1000);
      player.tell(
        Text.yellow(`[Kontrakt] Możesz wylosować nowy kontrakt dopiero za ${waitSec} s.`)
      );
      return 0;
    }
    hadStreak = Number(stats.getInt('streak') || 0);
    stats.putLong('last_reroll_ms', now);
    stats.putInt('streak', 0);
    server.persistentData.put(CONTRACT_STATS_KEY, stats);
  }

  const prev = getOrCreateActiveContract(server);
  const next = rollNewContract(server, prev ? prev.itemId : null);
  if (!next) {
    player.tell(Text.red('[Kontrakt] Nie udało się wylosować nowego kontraktu.'));
    return 0;
  }

  player.tell(
    Text.green(`[Kontrakt] Wylosowano nowe zlecenie: ${next.requiredCount}x ${next.itemId} za `)
      .append(Text.gold(`${formatCoins(next.payout)} monet (+${next.bonusPercent}%)`))
      .append(hadStreak > 0 ? Text.yellow(` (zresetowano serię ${hadStreak} -> 0)`) : Text.green('!'))
  );
  return 1;
}

ServerEvents.commandRegistry((event) => {
  const { commands: Commands } = event;
  event.register(
    Commands.literal('kontrakt')
      .executes((ctx) => {
        const player = ctx.source.player;
        if (!player) return 0;
        return handleShowContract(player, ctx.source.server);
      })
      .then(
        Commands.literal('oddaj').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleDeliverContract(player, ctx.source.server);
        })
      )
      .then(
        Commands.literal('nowy').executes((ctx) => {
          const player = ctx.source.player;
          if (!player) return 0;
          return handleRerollContract(player, ctx.source.server);
        })
      )
  );
});
