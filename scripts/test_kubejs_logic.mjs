#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Automatyczny zestaw testów jednostkowych logiki KubeJS (Node.js VM)
 *
 * Weryfikuje bez uruchamiania pełnego JVM Minecrafta wszystkie 5 kluczowych skryptów:
 * 1. `dimension_gating.js` — normalizacja ID wymiaru, progi Nether/End, FTB Quests task IDs.
 * 2. `skyblock_create_recipes.js` — zgodność wszystkich receptur z Create 6.0.10 (`neoforge:single`)
 *    oraz Mechanical Extruder 2.2.2 (`blockIngredients`) i brak regresji `fluid_stack`.
 * 3. `economy_anti_exploit.js` — blokada Coin Mint / Slot Machine i ładowanie wszystkich cen z prices.json.
 * 4. `economy_market.js` — nominały monet LC, `pack_size`, blokada Tier 0, dokładna reszta, limit `creative_motor`.
 * 5. `economy_contracts.js` — losowanie kontraktów per Etap, premia +35%, realizacja i cooldown rerollu.
 */

import fs from 'node:fs';
import vm from 'node:vm';

const prices = JSON.parse(fs.readFileSync('config/halucynacje_economy/prices.json', 'utf8'));

function makeCompound() {
  const map = new Map();
  return {
    getBoolean: (k) => Boolean(map.get(k) || false),
    putBoolean: (k, v) => map.set(k, Boolean(v)),
    getInt: (k) => Number(map.get(k) || 0),
    putInt: (k, v) => map.set(k, Math.trunc(Number(v))),
    getLong: (k) => Number(map.get(k) || 0),
    putLong: (k, v) => map.set(k, Math.trunc(Number(v))),
    getString: (k) => String(map.get(k) || ''),
    putString: (k, v) => map.set(k, String(v)),
    getCompound: (k) => {
      if (!map.has(k)) map.set(k, makeCompound());
      return map.get(k);
    },
    put: (k, v) => map.set(k, v)
  };
}

function makeTextProxy() {
  return new Proxy(
    {},
    {
      get: () => (msg) => {
        const node = {
          s: String(msg),
          append(other) {
            node.s += other.s;
            return node;
          }
        };
        return node;
      }
    }
  );
}

function makeItemFactory() {
  return {
    of: (id, count = 1) => ({
      id,
      count,
      isEmpty() {
        return this.count <= 0;
      },
      shrink(n) {
        this.count -= n;
      }
    })
  };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`Assertion failed: ${msg}`);
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

console.log('🧪 Uruchamiam testy jednostkowe KubeJS...');

// 1. dimension_gating.js
test('dimension_gating.js: KubeJS 7.2 NativeEvents gating + normalizacja ID + FTB Quests stage_1..stage_5', () => {
  const cmds = [];
  const nativeHandlers = {};
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    Text: makeTextProxy(),
    ServerEvents: { loaded: () => {}, commandRegistry: () => {} },
    // KubeJS 7.2 (MC 1.21.1) NIE ma `PlayerEvents.changedDimension`!
    PlayerEvents: { loggedIn: () => {} },
    ItemEvents: { rightClicked: () => {} },
    NativeEvents: {
      onEvent: (cls, cb) => {
        nativeHandlers[cls] = cb;
      }
    },
    assert,
    __cmds: cmds,
    __makeCompound: makeCompound
  };
  const rawSrc = fs.readFileSync('kubejs/server_scripts/dimension_gating.js', 'utf8');
  assert(!/PlayerEvents\.changedDimension\s*\(/.test(rawSrc), 'PlayerEvents.changedDimension nie istnieje w KubeJS 7.2!');
  const src =
    rawSrc +
    `
    ;(() => {
      assert(normalizeDimensionId('minecraft:the_nether') === 'minecraft:the_nether', 'plain string');
      assert(normalizeDimensionId('ResourceKey[minecraft:dimension / minecraft:the_end]') === 'minecraft:the_end', 'ResourceKey string');
      assert(normalizeDimensionId({ location: () => 'minecraft:the_nether' }) === 'minecraft:the_nether', 'location()');
      assert(getDimensionId({ dimensionKey: { location: () => 'minecraft:the_end' } }) === 'minecraft:the_end', 'level.dimensionKey');

      const server = { persistentData: __makeCompound(), players: [], runCommandSilent: (c) => __cmds.push(c) };
      const player = { username: 'Steve', persistentData: __makeCompound() };
      grantStage(player, server, 'stage_2');
      assert(hasUnlockedStage(player, server, 'stage_2') === true, 'stage_2 unlocked');
      assert(hasUnlockedStage(player, server, 'stage_4') === false, 'stage_4 still locked');
      assert(__cmds.includes('ftbquests change_progress Steve complete C200000000000102'), 'FTB Quests stage_2 task completed');
    })();
    `;
  vm.runInNewContext(src, sandbox);

  const travelCb = nativeHandlers['net.neoforged.neoforge.event.entity.EntityTravelToDimensionEvent'];
  const changedCb = nativeHandlers['net.neoforged.neoforge.event.entity.player.PlayerEvent$PlayerChangedDimensionEvent'];
  assert(typeof travelCb === 'function', 'EntityTravelToDimensionEvent zarejestrowany');
  assert(typeof changedCb === 'function', 'PlayerEvent$PlayerChangedDimensionEvent zarejestrowany');

  let canceled = false;
  const lockedServer = { persistentData: makeCompound(), runCommandSilent: (c) => cmds.push(c) };
  const lockedPlayer = {
    username: 'Alex',
    isPlayer: () => true,
    persistentData: makeCompound(),
    tell: () => {},
    displayClientMessage: () => {},
    level: { isClientSide: () => false, dimensionKey: 'minecraft:the_end', server: lockedServer },
    server: lockedServer
  };
  travelCb({
    entity: lockedPlayer,
    getDimension: () => 'ResourceKey[minecraft:dimension / minecraft:the_end]',
    setCanceled: (v) => {
      canceled = Boolean(v);
    }
  });
  assert(canceled === true, 'EntityTravelToDimensionEvent musi zablokować End bez stage_4');

  cmds.length = 0;
  changedCb({
    getEntity: () => lockedPlayer,
    getTo: () => 'ResourceKey[minecraft:dimension / minecraft:the_end]'
  });
  assert(
    cmds.some((c) => c.includes('execute in minecraft:overworld run tp Alex 0 65 0')),
    'PlayerChangedDimensionEvent musi cofnąć gracza do Overworlda bez stage_4'
  );
});

// 2. skyblock_create_recipes.js
test('skyblock_create_recipes.js: Create 6.0.10 neoforge:single & Mechanical Extruder 2.2.2 blockIngredients', () => {
  const customRecipes = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    ServerEvents: {
      recipes: (cb) =>
        cb({
          custom: (obj) => {
            customRecipes.push(obj);
            return { id: () => {} };
          }
        })
    }
  };
  vm.runInNewContext(fs.readFileSync('kubejs/server_scripts/skyblock_create_recipes.js', 'utf8'), sandbox);

  assert(customRecipes.length >= 11, `Oczekiwano >= 11 receptur, jest ${customRecipes.length}`);
  const serialized = JSON.stringify(customRecipes);
  assert(!serialized.includes('"fluid_stack"'), 'Wykryto przestarzały typ "fluid_stack" — Create 6.0.10 wymaga "neoforge:single"!');

  const fluidRecs = customRecipes.filter((r) =>
    (r.ingredients || []).some((ing) => ing && ing.fluid)
  );
  assert(fluidRecs.length >= 7, 'Brak receptur płynowych');
  for (const r of fluidRecs) {
    for (const ing of r.ingredients) {
      if (ing.fluid) {
        assert(ing.type === 'neoforge:single', `Niepoprawny typ płynu w ${r.type}: ${ing.type}`);
      }
    }
  }

  const extruders = customRecipes.filter((r) => r.type === 'create_mechanical_extruder:extruding');
  assert(extruders.length >= 1, 'Brak receptury Mechanical Extruder');
  for (const ex of extruders) {
    assert(ex.blockIngredients?.first?.blocks && ex.blockIngredients?.second?.blocks, 'Brak blockIngredients w Mechanical Extruder');
    assert(ex.catalyst?.blocks, 'Brak catalyst.blocks w Mechanical Extruder');
  }
});

// 3. economy_anti_exploit.js
test('economy_anti_exploit.js: blokada Coin Mint / Slot Machine i synchronizacja wszystkich cen z prices.json', () => {
  const removed = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { read: () => prices },
    Text: makeTextProxy(),
    ServerEvents: {
      recipes: (cb) => cb({ remove: (filter) => removed.push(filter) }),
      loaded: () => {},
      commandRegistry: () => {}
    },
    assert,
    __removed: removed
  };
  const src =
    fs.readFileSync('kubejs/server_scripts/economy_anti_exploit.js', 'utf8') +
    `
    ;(() => {
      assert(__removed.some((r) => r.output === 'lightmanscurrency:coinmint'), 'coinmint blocked');
      assert(__removed.some((r) => r.output === 'lightmanscurrency:slot_machine'), 'slot_machine blocked');
      const entries = loadShoppersPriceEntries();
      const zeros = entries.filter((e) => e.worth === 0);
      const positives = entries.filter((e) => e.worth > 0);
      assert(zeros.length === ${prices.tier_0_blocked.length}, 'all Tier 0 zeroed');
      assert(positives.length === 72, 'all 72 Tier 1-5 items synced');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

// 4. economy_market.js
test('economy_market.js: nominały LC, pack_size, blokada Tier 0, dokładna reszta, gating i limit creative_motor', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {} },
    assert,
    __makeCompound: makeCompound
  };
  const src =
    fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8') +
    `
    ;(() => {
      for (const amt of [1, 17, 12345, 250000, 1000000, 2000000]) {
        const stacks = splitIntoCoinStacks(amt);
        const sum = stacks.reduce((a, s) => a + s.count * LC_COIN_VALUES[s.id], 0);
        assert(sum === amt, 'split sum ' + amt);
        assert(stacks.every((s) => s.count >= 1 && s.count <= 64), 'stack size <= 64');
      }

      const cat = getMarketCatalog(true);
      const trackStack = Item.of('create:track', 35);
      const sRes = sellSingleStack(trackStack, cat);
      assert(sRes.status === 'sold' && sRes.soldItems === 32 && trackStack.count === 3 && sRes.payout === 760, 'pack_size sell');
      assert(sellSingleStack(Item.of('minecraft:netherrack', 64), cat).status === 'blocked', 'Tier 0 blocked');

      const inv = [Item.of('lightmanscurrency:coin_diamond', 1)];
      const msgs = [];
      const player = {
        username: 'Alex',
        persistentData: __makeCompound(),
        inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
        give: (st) => inv.push(st),
        tell: (t) => msgs.push(t.s)
      };
      const server = { persistentData: __makeCompound() };

      // Zakup Stage 0 (kelp za 250) -> reszta 9750
      assert(handleBuy(player, server, 'kelp', 1) === 1, 'buy kelp');
      assert(getInventoryCoinBalance(player) === 9750, 'exact change 9750');

      // Próba zakupu Stage 1 (cow) na Stage 0 -> zablokowane
      assert(handleBuy(player, server, 'cow', 1) === 0, 'stage 1 gated on stage 0');

      // Próba zakupu 3x creative_motor na Stage 5 -> zablokowane przez team_limit=2
      const gs = server.persistentData.getCompound('halucynacje_global_stages');
      for (let s = 1; s <= 5; s++) gs.putBoolean('stage_' + s, true);
      inv.push(Item.of('lightmanscurrency:coin_netherite', 60));
      assert(handleBuy(player, server, 'creative_motor', 3) === 0, 'creative_motor team_limit=2 enforced');
      assert(handleBuy(player, server, 'creative_motor', 2) === 2, 'creative_motor buy 2 allowed');
      assert(handleBuy(player, server, 'creative_motor', 1) === 0, 'creative_motor 3rd blocked');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

// 5. economy_contracts.js
test('economy_contracts.js: losowanie kontraktów per Etap, premia +35%, realizacja i cooldown rerollu', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {} },
    Date,
    Math,
    assert,
    __makeCompound: makeCompound
  };
  const src =
    fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8') +
    `
    ;(() => {
      const server = {
        persistentData: __makeCompound(),
        tell: () => {},
        runCommandSilent: () => {}
      };
      const contract = getOrCreateActiveContract(server);
      assert(contract && contract.requiredCount > 0, 'initial contract rolled');
      assert(contract.payout === Math.round(contract.baseValue * 1.35), '+35% payout exact');

      const inv = [Item.of(contract.itemId, contract.requiredCount)];
      const player = {
        username: 'Tycoon',
        inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
        give: (st) => inv.push(st),
        tell: () => {}
      };

      assert(handleDeliverContract(player, server) === 1, 'contract delivered');
      const coinVals = {
        'lightmanscurrency:coin_netherite': 100000,
        'lightmanscurrency:coin_diamond': 10000,
        'lightmanscurrency:coin_emerald': 1000,
        'lightmanscurrency:coin_gold': 100,
        'lightmanscurrency:coin_iron': 10,
        'lightmanscurrency:coin_copper': 1
      };
      const received = inv.reduce((acc, st) => acc + (coinVals[st.id] || 0) * st.count, 0);
      assert(received === contract.payout, 'received exact +35% LC coins');

      // Reroll 1x OK, natychmiastowy 2. reroll zablokowany przez cooldown 5 min
      assert(handleRerollContract(player, server) === 1, 'first reroll ok');
      assert(handleRerollContract(player, server) === 0, 'second reroll blocked by cooldown');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

console.log(`🎉 Wszystkie ${passed}/5 pakietów testów KubeJS ZALICZONE!`);
