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

// Jakie Tiery z `prices.json`, docelowa wartość (~15 min dochodu) oraz maks. pakietów dla Etapów (0..5) (#83)
const STAGE_CONTRACT_PROFILE = {
  0: { tiers: ['tier_1_start'], targetValue: 800, maxPacks: 64 },
  1: { tiers: ['tier_1_start', 'tier_2_kitchen'], targetValue: 2300, maxPacks: 48 },
  2: { tiers: ['tier_2_kitchen', 'tier_3_luxury_bakery'], targetValue: 5500, maxPacks: 32 },
  3: { tiers: ['tier_3_luxury_bakery', 'tier_4_create_industry'], targetValue: 12500, maxPacks: 24 },
  4: { tiers: ['tier_4_create_industry', 'tier_5_hightech_export'], targetValue: 28000, maxPacks: 16 },
  5: { tiers: ['tier_5_hightech_export'], targetValue: 28000, maxPacks: 20 }
};

function loadContractPoolForStage(stage) {
  var profile = STAGE_CONTRACT_PROFILE[stage] || STAGE_CONTRACT_PROFILE[0];
  var pool = [];
  var parsedCfg = null;
  var allTierKeys = null;
  var t = 0;
  var i = 0;
  var tierKey = '';
  var tierIdx = -1;
  var tierNum = 1;
  var tierObj = null;
  var tierItems = null;
  var it = null;
  var itemSellStage = 0;
  var wholesale = 0;

  try {
    parsedCfg = readPricesJson(false);
    if (parsedCfg && parsedCfg.sell_tiers) {
      allTierKeys = Object.keys(parsedCfg.sell_tiers);
      for (t = 0; t < profile.tiers.length; t++) {
        tierKey = profile.tiers[t];
        tierObj = parsedCfg.sell_tiers[tierKey];
        tierItems = (tierObj && tierObj.items) || [];
        tierIdx = allTierKeys.indexOf(tierKey);
        tierNum = tierIdx >= 0 ? tierIdx + 1 : t + 1;
        for (i = 0; i < tierItems.length; i++) {
          it = tierItems[i];
          if (!it || !it.id || !(it.wholesale_gui > 0)) continue;
          if (resolveItemHourlyCap(it) > 0) continue;
          itemSellStage = resolveItemSellStage(it, tierObj, tierNum);
          if (itemSellStage > stage) continue;
          wholesale = Number(it.wholesale_gui);
          if (wholesale > profile.targetValue) continue;
          pool.push({
            id: String(it.id),
            packSize: it.pack_size && Number(it.pack_size) > 1 ? Number(it.pack_size) : 1,
            wholesale: wholesale,
            sellStage: itemSellStage,
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

  const randFactor = 0.75 + Math.random() * 0.5;
  const rawPacks = Math.round((profile.targetValue * randFactor) / pick.wholesale);
  const packs = Math.max(1, Math.min(profile.maxPacks, rawPacks));
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

// ----------------------------------------------------------------------------
// Wielki Finał Tycoona — Survivalowy Mega-Kontrakt Endgame (Stage 5, Issue #51 + #83)
// Zastępuje kupowanie Creative Motor: wymaga zautomatyzowanych dostaw ze
// wszystkich 5 filarów paczki i nagradza Trofeum Imperium Tycoona + 750 000 monet (jednorazowo)!
// ----------------------------------------------------------------------------
const ENDGAME_FINALE_TROPHY_ID = 'kubejs:tycoon_empire_trophy';
const ENDGAME_FINALE_PAYOUT = 750000;
const ENDGAME_FINALE_REQUIREMENTS = [
  { id: 'farmersdelight:hamburger', count: 64, label: 'Kuchnia (Farmer\'s Delight)' },
  { id: 'create_confectionery:bar_of_ruby_chocolate', count: 16, label: 'Cukiernia (Confectionery)' },
  { id: 'create:precision_mechanism', count: 32, label: 'Inżynieria (Create 6)' },
  { id: 'ae2:cell_component_256k', count: 2, label: 'Cyfrowy Mózg (AE2)' },
  { id: 'mekanism:pellet_polonium', count: 4, label: 'Energia Jądrowa (Mekanism)' }
];

function handleShowFinaleContract(player, server) {
  var stage = getCurrentUnlockedStage(player, server);
  var stats = server && server.persistentData ? server.persistentData.getCompound(CONTRACT_STATS_KEY) : null;
  var timesDone = stats ? Number(stats.getInt('finale_completed') || 0) : 0;
  var i = 0;
  var req = null;
  var have = 0;
  var readyAll = true;

  player.tell(Text.gold('=== 🏆 WIELKI FINAŁ TYCOONA — Mega-Kontrakt Endgame (Stage 5) ==='));
  if (timesDone >= 1) {
    player.tell(
      Text.green('✔ Wielki Finał już ukończony! Nagroda jednorazowa została odebrana przez drużynę.')
    );
  } else if (stage < 5) {
    player.tell(
      Text.yellow(`• Wymagany odblokowany Etap 5: Imperium Tycoona (obecnie: Stage ${stage} / 5).`)
    );
  }
  for (i = 0; i < ENDGAME_FINALE_REQUIREMENTS.length; i++) {
    req = ENDGAME_FINALE_REQUIREMENTS[i];
    have = countItemInInventory(player, req.id);
    if (have < req.count) readyAll = false;
    player.tell(
      (timesDone >= 1 || have >= req.count ? Text.green('  ✔ ') : Text.red('  ✘ '))
        .append(Text.aqua(`${req.count}x ${req.id}`))
        .append(Text.gray(` [${req.label}] — masz: ${have}/${req.count}`))
    );
  }
  player.tell(
    Text.white('• Nagroda (jednorazowa): ')
      .append(Text.gold('Trofeum Imperium Tycoona'))
      .append(Text.white(' + '))
      .append(Text.gold(`${formatCoins(ENDGAME_FINALE_PAYOUT)} monet`))
      .append(Text.gray(timesDone >= 1 ? ' (UKOŃCZONO)' : ' (do zdobycia 1x)'))
  );
  if (timesDone >= 1) {
    player.tell(Text.green('Wielki Finał już ukończony — gratulacje dla całego Imperium Tycoona!'));
  } else {
    player.tell(
      readyAll && stage >= 5
        ? Text.green('Wszystkie 5 filarów gotowe! Stań na Wyspie-Rynku (152,64,0) i wpisz /kontrakt final oddaj!')
        : Text.gray('Dostarcz wszystkie 5 filarów na Wyspę-Rynek (152,64,0) i wpisz /kontrakt final oddaj.')
    );
  }
  return 1;
}

function handleDeliverFinaleContract(player, server) {
  var stage = getCurrentUnlockedStage(player, server);
  var i = 0;
  var req = null;
  var have = 0;
  var missing = [];
  var coinStacks = null;
  var cIdx = 0;
  var stats = server && server.persistentData ? server.persistentData.getCompound(CONTRACT_STATS_KEY) : null;
  var alreadyDone = stats ? Number(stats.getInt('finale_completed') || 0) : 0;
  var doneCount = 1;

  if (alreadyDone >= 1) {
    player.tell(
      Text.yellow(
        '[Wielki Finał] Wielki Finał już ukończony! Nagroda jednorazowa (Trofeum + 750 000 monet) została już odebrana.'
      )
    );
    return 0;
  }

  if (stage < 5) {
    player.tell(
      Text.red(
        `[Wielki Finał] Mega-Kontrakt wymaga odblokowanego Etapu 5 (obecnie Stage ${stage}/5)!`
      )
    );
    return 0;
  }

  if (typeof isPlayerOnMarketIsland === 'function' && !isPlayerOnMarketIsland(player)) {
    player.tell(
      Text.red(
        `[Wielki Finał] Mega-Kontrakt oddaje się wyłącznie na Wyspie-Rynku (${MARKET_ISLAND_CENTER.x}, ${MARKET_ISLAND_CENTER.y}, ${MARKET_ISLAND_CENTER.z})!`
      )
    );
    return 0;
  }

  // Faza 1: Atomowe sprawdzenie wszystkich 5 składników zanim cokolwiek zabierzemy
  for (i = 0; i < ENDGAME_FINALE_REQUIREMENTS.length; i++) {
    req = ENDGAME_FINALE_REQUIREMENTS[i];
    have = countItemInInventory(player, req.id);
    if (have < req.count) {
      missing.push(`${req.id} (${have}/${req.count})`);
    }
  }

  if (missing.length > 0) {
    player.tell(
      Text.yellow(`[Wielki Finał] Brakuje składników: ${missing.join(', ')}. Wpisz /kontrakt final.`)
    );
    return 0;
  }

  // Faza 2: Pobranie wszystkich 5 stosów i wydanie Trofeum + jednorazowych 750 000 monet
  for (i = 0; i < ENDGAME_FINALE_REQUIREMENTS.length; i++) {
    req = ENDGAME_FINALE_REQUIREMENTS[i];
    removeItemFromInventory(player, req.id, req.count);
  }

  player.give(Item.of(ENDGAME_FINALE_TROPHY_ID, 1));
  coinStacks = splitIntoCoinStacks(ENDGAME_FINALE_PAYOUT);
  for (cIdx = 0; cIdx < coinStacks.length; cIdx++) {
    player.give(Item.of(coinStacks[cIdx].id, coinStacks[cIdx].count));
  }

  if (server && server.persistentData) {
    stats = server.persistentData.getCompound(CONTRACT_STATS_KEY);
    doneCount = Number(stats.getInt('finale_completed') || 0) + 1;
    stats.putInt('finale_completed', doneCount);
    stats.putLong('total_payout', Number(stats.getLong('total_payout') || 0) + ENDGAME_FINALE_PAYOUT);
    server.persistentData.put(CONTRACT_STATS_KEY, stats);
  }

  if (typeof syncPlayerTabBalance === 'function') {
    syncPlayerTabBalance(player, server, true);
  }

  if (server && typeof server.tell === 'function') {
    server.tell(
      Text.gold(`🏆★ [WIELKI FINAŁ TYCOONA #${doneCount}] `)
        .append(Text.green(`${player.username}`))
        .append(Text.white(' zjednoczył(a) wszystkie 5 filarów fabryki i zdobył(a) '))
        .append(Text.aqua('Trofeum Imperium Tycoona'))
        .append(Text.gold(` + ${formatCoins(ENDGAME_FINALE_PAYOUT)} monet! ★🏆`))
    );
  }
  if (server && typeof server.runCommandSilent === 'function') {
    server.runCommandSilent(
      `execute at ${player.username} run playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1.0 1.0`
    );
  }
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
      .then(
        Commands.literal('final')
          .executes((ctx) => {
            const player = ctx.source.player;
            if (!player) return 0;
            return handleShowFinaleContract(player, ctx.source.server);
          })
          .then(
            Commands.literal('oddaj').executes((ctx) => {
              const player = ctx.source.player;
              if (!player) return 0;
              return handleDeliverFinaleContract(player, ctx.source.server);
            })
          )
      )
  );
});
