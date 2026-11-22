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
const CONTRACT_BONUS_MULTIPLIER = 1.35; // +35% względem ceny hurtowej
const CONTRACT_REROLL_COOLDOWN_MS = 300000; // 5 minut

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
  const payout = Math.round(baseValue * CONTRACT_BONUS_MULTIPLIER);

  const contract = {
    itemId: pick.id,
    requiredCount: requiredCount,
    packs: packs,
    packSize: pick.packSize,
    baseValue: baseValue,
    payout: payout,
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
      return {
        itemId: itemId,
        requiredCount: requiredCount,
        packs: Number(tag.getInt('packs') || requiredCount),
        packSize: Number(tag.getInt('packSize') || 1),
        baseValue: Number(tag.getInt('baseValue') || Math.round(payout / CONTRACT_BONUS_MULTIPLIER)),
        payout: payout,
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

  player.tell(Text.gold('=== Aktywny Kontrakt Korporacyjny (+35% premii!) ==='));
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
    Text.gray(`• Ukończone kontrakty drużyny: ${completed} (łącznie ${formatCoins(earned)} monet)`)
  );
  player.tell(Text.gray('Komendy: /kontrakt oddaj (realizacja) | /kontrakt nowy (zmiana co 5 min)'));
  return 1;
}

function handleDeliverContract(player, server) {
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

  const coinStacks = splitIntoCoinStacks(contract.payout);
  for (let i = 0; i < coinStacks.length; i++) {
    player.give(Item.of(coinStacks[i].id, coinStacks[i].count));
  }

  if (server && server.persistentData) {
    const stats = server.persistentData.getCompound(CONTRACT_STATS_KEY);
    stats.putInt('completed', Number(stats.getInt('completed') || 0) + 1);
    stats.putLong('total_payout', Number(stats.getLong('total_payout') || 0) + contract.payout);
    server.persistentData.put(CONTRACT_STATS_KEY, stats);
  }

  if (server && server.tell) {
    server.tell(
      Text.gold('★ [Kontrakt Ukończony] ')
        .append(Text.green(`${player.username}`))
        .append(Text.white(` zrealizował(a) dostawę ${contract.requiredCount}x ${contract.itemId} za `))
        .append(Text.gold(`${formatCoins(contract.payout)} monet (+35%)`))
        .append(Text.gold(' ★'))
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
      Text.aqua(`[Nowy Kontrakt] Następne zlecenie: ${next.requiredCount}x ${next.itemId} za `)
        .append(Text.gold(`${formatCoins(next.payout)} monet`))
        .append(Text.aqua('!'))
    );
  }
  return 1;
}

function handleRerollContract(player, server) {
  const now = Date.now();
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
    stats.putLong('last_reroll_ms', now);
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
      .append(Text.gold(`${formatCoins(next.payout)} monet (+35%)`))
      .append(Text.green('!'))
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
