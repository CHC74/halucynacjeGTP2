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

class MockBlockPos {
  constructor(x, y, z) {
    if (arguments.length !== 3 || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
      throw new TypeError(`Invalid BlockPos args: (${x}, ${y}, ${z})`);
    }
    this.x = x;
    this.y = y;
    this.z = z;
  }
  getX() {
    return this.x;
  }
  getY() {
    return this.y;
  }
  getZ() {
    return this.z;
  }
}

function makeStrictOverworldMock({ getBlock, loadedChunks = null, exposeHasChunk = true }) {
  const isChunkLoaded = (cx, cz) => {
    if (!loadedChunks) return true;
    return loadedChunks.has(`${cx},${cz}`);
  };
  const ow = {
    isLoaded(...args) {
      if (args.length !== 1 || !(args[0] instanceof MockBlockPos)) {
        throw new TypeError(
          `Can't find method net.minecraft.world.level.Level.isLoaded(${args.map((a) => typeof a).join(', ')})`
        );
      }
      return isChunkLoaded(args[0].x >> 4, args[0].z >> 4);
    },
    getBlock(x, y, z) {
      if (arguments.length !== 3 || !Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
        throw new TypeError(`Invalid getBlock args: (${x}, ${y}, ${z})`);
      }
      return getBlock(x, y, z);
    }
  };
  if (exposeHasChunk) {
    ow.hasChunk = function hasChunk(cx, cz) {
      if (arguments.length !== 2 || !Number.isInteger(cx) || !Number.isInteger(cz)) {
        throw new TypeError(
          `Can't find method net.minecraft.world.level.Level.hasChunk(${Array.from(arguments)
            .map((a) => typeof a)
            .join(', ')})`
        );
      }
      return isChunkLoaded(cx, cz);
    };
  }
  return ow;
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

const SHARED_ECONOMY_SRC = fs.readFileSync('kubejs/server_scripts/shared_economy.js', 'utf8');

function getScriptPriority(src) {
  const m = src.match(/^\s*\/\/\s*priority:\s*(-?\d+)/m);
  return m ? Number(m[1]) : 0;
}

console.log('🧪 Uruchamiam testy jednostkowe KubeJS...');

// 0. Wspólny zakres globalny KubeJS (Issue #60) — wszystkie server_scripts w JEDNYM VM w kolejności priorytetów!
test('shared_economy.js: wszystkie server_scripts ładują się w JEDNYM kontekście VM bez kolizji nazw globalnych', () => {
  const dir = 'kubejs/server_scripts';
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => {
      const fullPath = `${dir}/${f}`;
      const src = fs.readFileSync(fullPath, 'utf8');
      return { name: f, fullPath, src, priority: getScriptPriority(src) };
    })
    .sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name));

  assert(files[0] && files[0].name === 'shared_economy.js', 'shared_economy.js musi mieć najwyższy priorytet');
  assert(files[0].priority >= 100, 'shared_economy.js musi mieć priority >= 100');

  const sharedSandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Text: makeTextProxy(),
    Item: makeItemFactory(),
    Java: { loadClass: () => null },
    ServerEvents: { loaded: () => {}, recipes: () => {}, commandRegistry: () => {}, tick: () => {} },
    PlayerEvents: { loggedIn: () => {} },
    ItemEvents: { rightClicked: () => {} },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math
  };
  const sharedCtx = vm.createContext(sharedSandbox);

  for (const f of files) {
    vm.runInContext(f.src, sharedCtx, { filename: f.fullPath });
  }

  // Test negatywny (kryterium akceptacji #60): dopisanie drugiego top-level `const LC_COINS` musi rzucić błąd!
  let collisionCaught = false;
  try {
    vm.runInContext('const LC_COINS = [];', sharedCtx, { filename: 'collision_probe.js' });
  } catch (err) {
    collisionCaught = /already been declared/i.test(String(err));
  }
  assert(collisionCaught, 'Kolizja top-level `const LC_COINS` w drugim skrypcie musi wysypać test!');
});

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
    SHARED_ECONOMY_SRC +
    '\n;\n' +
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

  // Issue #49: 5 odnawialnych łańcuchów Mekanism (Stage 3–4) + blokada raw_* w Tier 0
  const mekTargets = [
    { id: 'mekanism:raw_tin', heat: 'heated' },
    { id: 'mekanism:raw_lead', heat: 'heated' },
    { id: 'mekanism:raw_osmium', heat: 'heated' },
    { id: 'mekanism:fluorite_gem', heat: 'superheated' },
    { id: 'mekanism:raw_uranium', heat: 'superheated' }
  ];
  for (const mt of mekTargets) {
    const rec = customRecipes.find((r) => (r.results || []).some((res) => res.id === mt.id));
    assert(rec, `Brak receptury Pure-Create dla ${mt.id} (#49)`);
    assert(rec.heat_requirement === mt.heat, `Receptura ${mt.id} musi mieć heat_requirement=${mt.heat}`);
    assert(
      prices.tier_0_blocked.some((b) => b.id === mt.id && b.wholesale_gui === 0 && b.npc_shoppers === 0),
      `${mt.id} musi być zablokowany w tier_0_blocked (0 monet)`
    );
  }
});

// 3. economy_anti_exploit.js
test('economy_anti_exploit.js: blokada Coin Mint / Slot Machine, ShoppersWorldData API (Tier 0 = 0), brak ArrowFunction w sendSuccess i brak Rhino redeclaration', () => {
  // Globalna straż regresji KubeJS 7.2 / Rhino 2101.2.7 dla wszystkich skryptów KubeJS:
  // 1) żadna komenda NIE może wywoływać `sendSuccess(() => ...)` (wypisuje ArrowFunction(0) na czacie),
  // 2) żadna funkcja NIE może deklarować dwa razy tej samej nazwy zmiennej (`var`/`let`/`const`),
  //    ponieważ Rhino hoistuje je do zakresu funkcji i rzuca `TypeError: redeclaration of var ...`!
  for (const dir of ['kubejs/server_scripts', 'kubejs/startup_scripts']) {
    if (!fs.existsSync(dir)) continue;
    for (const scriptFile of fs.readdirSync(dir)) {
      if (!scriptFile.endsWith('.js')) continue;
      const fullPath = `${dir}/${scriptFile}`;
      const raw = fs.readFileSync(fullPath, 'utf8');
      assert(
        !/sendSuccess\s*\(\s*\(\s*\)\s*=>/.test(raw),
        `Wykryto sendSuccess(() => ...) w ${fullPath} — w KubeJS 7.2 wypisuje ArrowFunction(0) na czacie!`
      );

      // Sprawdzenie duplikatów var/let/const w tym samym zakresie funkcji (ochrona Rhino)
      const clean = raw
        .replace(/\/\/.*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/`(?:\\.|[^`\\])*`/g, '""')
        .replace(/'(?:\\.|[^'\\])*'/g, '""')
        .replace(/"(?:\\.|[^"\\])*"/g, '""');
      const scopes = [{ name: '<top>', depth: 0, vars: new Map() }];
      let depth = 0;
      let pendingFn = null;
      const tokRe = /\bfunction\b(?:\s+([A-Za-z0-9_$]+))?|=>\s*\{|\b(var|let|const)\s+([A-Za-z0-9_$]+)|[{}]/g;
      let m;
      while ((m = tokRe.exec(clean)) !== null) {
        const tok = m[0];
        if (tok.startsWith('function')) {
          pendingFn = m[1] || '<anon>';
        } else if (tok.startsWith('=>')) {
          depth++;
          scopes.push({ name: '<arrow>', depth, vars: new Map() });
        } else if (tok === '{') {
          depth++;
          if (pendingFn !== null) {
            scopes.push({ name: pendingFn, depth, vars: new Map() });
            pendingFn = null;
          }
        } else if (tok === '}') {
          if (scopes[scopes.length - 1].depth === depth && scopes.length > 1) {
            const popped = scopes.pop();
            for (const [vName, count] of popped.vars.entries()) {
              assert(
                count === 1,
                `Rhino redeclaration w ${fullPath} [${popped.name}]: zmienna "${vName}" zadeklarowana ${count}x!`
              );
            }
          }
          depth--;
        } else {
          const vName = m[3];
          const cur = scopes[scopes.length - 1];
          cur.vars.set(vName, (cur.vars.get(vName) || 0) + 1);
        }
      }
      for (const [vName, count] of scopes[0].vars.entries()) {
        assert(
          count === 1,
          `Rhino redeclaration w ${fullPath} [<top>]: zmienna "${vName}" zadeklarowana ${count}x!`
        );
      }

      // 3) Żaden skrypt NIE może deklarować `const` wewnątrz bloku `try`/`catch`/`finally`,
      //    ponieważ Rhino 2101.2.7 (`Interpreter.doSetConstVar`) rzuca wtedy
      //    `InternalError: TypeError: redeclaration of var <nazwa>.` w czasie wykonania!
      const cleanLines = clean.split('\n');
      const blockStack = [];
      for (let lineIdx = 0; lineIdx < cleanLines.length; lineIdx++) {
        const ln = cleanLines[lineIdx];
        if (/\b(try|catch|finally)\b[^{]*\{/.test(ln)) {
          blockStack.push('try');
        } else {
          const opens = (ln.match(/\{/g) || []).length;
          for (let k = 0; k < opens; k++) blockStack.push('other');
        }
        if (blockStack.includes('try') && /\bconst\s+/.test(ln)) {
          assert(
            false,
            `Rhino const-in-try w ${fullPath}:${lineIdx + 1}: "${ln.trim()}" — użyj "var" zadeklarowanego przed blokiem try!`
          );
        }
        const closes = (ln.match(/\}/g) || []).length;
        for (let k = 0; k < closes; k++) blockStack.pop();
      }
    }
  }

  const removed = [];
  const customPrices = new Map();
  const feedbackSent = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls === 'com.velesbh.shoppers.economy.ShoppersWorldData') {
          return {
            get: (lvl) => {
              assert(lvl && lvl.__isOverworld === true, 'ShoppersWorldData.get musi dostać Overworld');
              return {
                setCustomPrice: (id, worth) => customPrices.set(String(id), Number(worth))
              };
            }
          };
        }
        throw new Error(`Unexpected class: ${cls}`);
      }
    },
    ServerEvents: {
      recipes: (cb) => cb({ remove: (filter) => removed.push(filter) }),
      loaded: () => {},
      commandRegistry: () => {}
    },
    assert,
    __makeCompound: makeCompound,
    __removed: removed,
    __customPrices: customPrices,
    __feedbackSent: feedbackSent
  };
  const expectedTier1NpcCount = (prices.sell_tiers.tier_1_start.items || []).filter((x) => x.npc_shoppers > 0).length;
  const expectedTotalNpcCount = Object.values(prices.sell_tiers).reduce(
    (acc, t) => acc + (t.items || []).filter((x) => x.npc_shoppers > 0).length,
    0
  );
  const expectedNpcBlockedCount = Object.values(prices.sell_tiers).reduce(
    (acc, t) => acc + (t.items || []).filter((x) => x.npc_shoppers === 0).length,
    0
  );
  const expectedStage0LockedCount = expectedTotalNpcCount - expectedTier1NpcCount;
  const src =
    SHARED_ECONOMY_SRC +
    '\n;\n' +
    fs.readFileSync('kubejs/server_scripts/economy_anti_exploit.js', 'utf8') +
    `
    ;(() => {
      assert(__removed.some((r) => r.output === 'lightmanscurrency:coinmint'), 'coinmint blocked');
      assert(!__removed.some((r) => r.output === 'lightmanscurrency:coin_mint'), 'no invalid coin_mint warning');
      assert(__removed.some((r) => r.output === 'lightmanscurrency:slot_machine'), 'slot_machine blocked');

      // Etap 0: tylko Tier 1 z npc_shoppers > 0 aktywny, Tier 2-5 zablokowane (0L), pozycje bez NPC (bruk = 0L) + Tier 0 (0L)
      const entriesS0 = loadShoppersPriceEntries(false, 0);
      const zerosS0 = entriesS0.filter((e) => e.worth === 0);
      const positivesS0 = entriesS0.filter((e) => e.worth > 0);
      assert(zerosS0.length === ${prices.tier_0_blocked.length + expectedNpcBlockedCount + expectedStage0LockedCount}, 'Stage 0: Tier 0 + bez NPC + Tier 2-5 zeroed');
      assert(positivesS0.length === ${expectedTier1NpcCount}, 'Stage 0: only NPC-enabled Tier 1 active in Shoppers');

      const mockServer = { persistentData: __makeCompound(), overworld: () => ({ __isOverworld: true }), runCommandSilent: () => {} };
      const syncResS0 = applyShoppersTier0ZeroWorth(mockServer);
      assert(syncResS0.viaJavaApi === true, 'uses ShoppersWorldData Java API');
      assert(syncResS0.tier0 === ${prices.tier_0_blocked.length}, 'all Tier 0 written as 0 via API');
      assert(syncResS0.npcBlocked === ${expectedNpcBlockedCount}, 'Stage 0: npc_shoppers=0 items tracked in npcBlocked');
      assert(syncResS0.stageLocked === ${expectedStage0LockedCount}, 'Stage 0: Tier 2-5 locked as 0 via API');
      assert(syncResS0.npc === ${expectedTier1NpcCount}, 'Stage 0: Tier 1 NPC prices written via API');
      assert(__customPrices.get('minecraft:cobblestone') === 0, 'cobblestone worth === 0 (never clamped to 1)');
      assert(__customPrices.get('minecraft:ancient_debris') === 0, 'ancient_debris worth === 0');
      assert(__customPrices.get('mekanism:ingot_osmium') === 0, 'osmium worth === 0');
      assert(__customPrices.get('create:blaze_cake') === 0, 'Stage 0: blaze_cake worth === 0 (sell_stage=2)');
      assert(__customPrices.get('minecraft:bread') > 0, 'Stage 0: bread active in Shoppers');

      // Etap 5: wszystkie 85 towarów NPC Tier 1-5 aktywne, Tier 0 oraz pozycje bez NPC (bruk) nadal 0L
      const gs = mockServer.persistentData.getCompound('halucynacje_global_stages');
      for (let s = 1; s <= 5; s++) gs.putBoolean('stage_' + s, true);
      const syncResS5 = applyShoppersTier0ZeroWorth(mockServer);
      assert(syncResS5.tier0 === ${prices.tier_0_blocked.length}, 'Stage 5: all Tier 0 still 0');
      assert(syncResS5.npcBlocked === ${expectedNpcBlockedCount}, 'Stage 5: npcBlocked still tracked separately');
      assert(syncResS5.stageLocked === 0, 'Stage 5: 0 stage-locked items');
      assert(syncResS5.npc === ${expectedTotalNpcCount}, 'Stage 5: all NPC-enabled Tier 1-5 prices active');
      assert(__customPrices.get('minecraft:cobblestone') === 0, 'Stage 5: cobblestone still 0 in Shoppers');
      assert(__customPrices.get('create:blaze_cake') > 0, 'Stage 5: blaze_cake active in Shoppers');

      const msgComp = Text.green('OK');
      sendCommandFeedback(
        {
          source: {
            sendSuccess: (comp, broadcast) => {
              assert(typeof comp !== 'function', 'sendSuccess nie może dostawać ArrowFunction!');
              __feedbackSent.push({ s: comp.s, broadcast });
            }
          }
        },
        msgComp
      );
      assert(__feedbackSent.length === 1 && __feedbackSent[0].s === 'OK', 'sendSuccess przekazał Component');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

// 4. economy_market.js
test('economy_market.js: nominały LC, pack_size, blokada Tier 0, dokładna reszta, gating, limit creative_motor i /sklep -> EntityValidator', () => {
  let terminalOpened = 0;
  let lastValidator = null;
  let failOpenMenu = false;
  const playerCmds = [];
  const serverCmds = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls.endsWith('TerminalMenuProvider')) {
          return {
            OpenMenu: (p, v) => {
              if (failOpenMenu) {
                throw new Error('simulated OpenMenu failure');
              }
              assert(p && v && v.isNull() === false, 'OpenMenu receives player & non-null EntityValidator');
              lastValidator = v;
              terminalOpened++;
            }
          };
        }
        if (cls.endsWith('EntityValidator')) {
          return {
            of: (entity) => ({
              __isEntityValidator: true,
              entity,
              isNull: () => false
            })
          };
        }
        if (cls.endsWith('SimpleValidator')) {
          return { NULL: { __isNullValidator: true, isNull: () => true } };
        }
        throw new Error(`Unexpected class: ${cls}`);
      }
    },
    ServerEvents: { commandRegistry: () => {} },
    assert,
    __makeCompound: makeCompound,
    __getTerminalOpened: () => terminalOpened,
    __getLastValidator: () => lastValidator,
    __setFailOpenMenu: (v) => {
      failOpenMenu = Boolean(v);
    },
    __playerCmds: playerCmds,
    __serverCmds: serverCmds
  };
  const src =
    SHARED_ECONOMY_SRC +
    '\n;\n' +
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
      const trackDef = cat.sellById['create:track'];
      const trackStack = Item.of('create:track', trackDef.packSize * 2 + 3);
      const sRes = sellSingleStack(trackStack, cat);
      assert(
        sRes.status === 'sold' &&
          sRes.soldItems === trackDef.packSize * 2 &&
          trackStack.count === 3 &&
          sRes.payout === trackDef.wholesale * 2,
        'pack_size sell'
      );
      assert(sellSingleStack(Item.of('minecraft:netherrack', 64), cat).status === 'blocked', 'Tier 0 blocked');

      const inv = [Item.of('lightmanscurrency:coin_diamond', 1)];
      const msgs = [];
      const player = {
        username: 'Alex',
        persistentData: __makeCompound(),
        inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
        give: (st) => inv.push(st),
        tell: (t) => msgs.push(t.s),
        runCommandSilent: (cmd) => __playerCmds.push(cmd)
      };
      const server = {
        persistentData: __makeCompound(),
        runCommandSilent: (cmd) => __serverCmds.push(cmd)
      };

      // Zakup Stage 0 (kelp wg prices.json) -> dokładna reszta z 10 000
      const kelpPrice = cat.buyByKey['kelp'].buyPrice;
      const expectedChange = 10000 - kelpPrice;
      assert(handleBuy(player, server, 'kelp', 1) === 1, 'buy kelp');
      assert(getInventoryCoinBalance(player) === expectedChange, 'exact change ' + expectedChange);

      // Próba zakupu Stage 1 (cow) na Stage 0 -> zablokowane
      assert(handleBuy(player, server, 'cow', 1) === 0, 'stage 1 gated on stage 0');

      // Issue #51: create:creative_motor usunięty ze sklepu — zakup musi być odrzucony
      const gs = server.persistentData.getCompound('halucynacje_global_stages');
      for (let s = 1; s <= 5; s++) gs.putBoolean('stage_' + s, true);
      inv.push(Item.of('lightmanscurrency:coin_netherite', 60));
      assert(handleBuy(player, server, 'creative_motor', 1) === 0, 'creative_motor usunięty ze sklepu (#51)');

      // Test /sklep GUI: ścieżka główna TerminalMenuProvider.OpenMenu(player, EntityValidator.of(player))
      assert(handleOpenShopGui(player, server, null) === 1, '/sklep primary EntityValidator ok');
      assert(__getTerminalOpened() === 1, 'TerminalMenuProvider.OpenMenu called');
      assert(__getLastValidator() && __getLastValidator().__isEntityValidator === true, 'EntityValidator.of(player) used');

      // Test /sklep GUI: fallback 1 player.runCommandSilent('lcterminal')
      __setFailOpenMenu(true);
      assert(openTradingTerminalGui(player, server, null) === true, '/sklep player fallback ok');
      assert(__playerCmds.length === 1 && __playerCmds[0] === 'lcterminal', 'player.runCommandSilent ran lcterminal');

      // Test /sklep GUI: fallback 2 server.runCommandSilent('execute as Alex run lcterminal')
      const playerNoRun = { username: 'Alex', tell: (t) => msgs.push(t.s) };
      assert(openTradingTerminalGui(playerNoRun, server, null) === true, '/sklep server fallback ok');
      assert(__serverCmds.length === 1 && __serverCmds[0] === 'execute as Alex run lcterminal', 'server ran execute as Alex run lcterminal');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

// 5. economy_contracts.js
test('economy_contracts.js: losowanie kontraktów per Etap, premia +35%, realizacja i cooldown rerollu', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {} },
    Date,
    Math,
    assert,
    __makeCompound: makeCompound
  };
  const src =
    SHARED_ECONOMY_SRC +
    '\n;\n' +
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
        x: 152,
        y: 65,
        z: 0,
        level: { dimension: 'minecraft:overworld' },
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

// 6. Issue #61: Jednolite saldo (TAB == /ekonomia == /kup) i atomowe pobieranie (portfel, bank, coinpile, coinblock)
test('shared_economy.js + economy_market.js (#61): portfel, coinblock, mieszanka źródeł z resztą i atomowy brak strat przy braku środków', () => {
  const makeMoneyVal = (copper) => ({
    isEmpty: () => copper <= 0,
    isFree: () => false,
    getChain: () => 'main',
    getUniqueName: () => 'lightmanscurrency:coins;main',
    getCoreValue: () => copper
  });

  const makeMockHandler = (initialCopper) => {
    let balance = initialCopper;
    return {
      getBalance: () => balance,
      setBalance: (v) => {
        balance = v;
      },
      getStoredMoney: () => ({ allValues: () => (balance > 0 ? [makeMoneyVal(balance)] : []) }),
      extractMoney: (reqVal, simulate) => {
        const want = reqVal.getCoreValue();
        const taken = Math.min(balance, want);
        if (!simulate) {
          balance -= taken;
        }
        return makeMoneyVal(want - taken);
      }
    };
  };

  const walletState = makeMockHandler(0);
  const personalBankState = makeMockHandler(0);
  const teamBankState = makeMockHandler(0);

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls.endsWith('.MoneyAPI')) {
          return { getApi: () => ({ GetPlayersMoneyHandler: () => walletState }) };
        }
        if (cls.endsWith('.CoinValue')) {
          return { fromNumber: (_chain, amt) => makeMoneyVal(Number(amt)) };
        }
        if (cls.endsWith('.PlayerBankReference')) {
          return { of: () => ({ get: () => ({ getMoneyStorage: () => personalBankState }) }) };
        }
        if (cls.endsWith('.TeamAPI')) {
          return {
            getApi: () => ({
              GetAllTeamsForPlayer: () => [
                {
                  getID: () => 7,
                  hasBankAccount: () => true,
                  canAccessBankAccount: () => true,
                  getBankAccount: () => ({ getMoneyStorage: () => teamBankState })
                }
              ]
            })
          };
        }
        return null;
      }
    },
    ServerEvents: { commandRegistry: () => {} },
    assert,
    __makeCompound: makeCompound,
    __wallet: walletState,
    __personalBank: personalBankState,
    __teamBank: teamBankState
  };

  const src =
    SHARED_ECONOMY_SRC +
    '\n;\n' +
    fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8') +
    `
    ;(() => {
      const server = { persistentData: __makeCompound(), runCommandSilent: () => {} };
      const gs = server.persistentData.getCompound('halucynacje_global_stages');
      gs.putBoolean('stage_1', true);

      const cat = getMarketCatalog(true);
      const kelpPrice = cat.buyByKey['kelp'].buyPrice;
      const lavaPrice = cat.buyByKey['lava_bucket'].buyPrice;

      // Przypadek A: TYLKO portfel LC (0 w ekwipunku, 1000 w portfelu) -> zakup kelp wg prices.json
      let inv = [];
      let msgs = [];
      const player = {
        username: 'WalletOnly',
        persistentData: __makeCompound(),
        inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
        give: (st) => inv.push(st),
        tell: (t) => msgs.push(t.s)
      };
      __wallet.setBalance(1000);
      __personalBank.setBalance(0);
      __teamBank.setBalance(0);

      assert(computePlayerBalanceBreakdown(player).total === 1000, 'TAB/shared widzi 1000 z portfela');
      handleShowEconomyStatus(player, server);
      assert(msgs.some((m) => m.includes('1 000 monet')), '/ekonomia pokazuje dokładnie 1 000 monet (jak TAB)');
      assert(handleBuy(player, server, 'kelp', 1) === 1, '/kup z samego portfela udany');
      assert(
        __wallet.getBalance() === 1000 - kelpPrice,
        'Z portfela pobrano dokładnie ' + kelpPrice + ' -> zostało ' + (1000 - kelpPrice)
      );
      assert(computePlayerBalanceBreakdown(player).total === 1000 - kelpPrice, 'Saldo po zakupie = ' + (1000 - kelpPrice));

      // Przypadek B: TYLKO coinblock_emerald w ekwipunku (dokładny przykład z Issue #61: 6x 36 000 = 216 000 -> /kup stage_2 za 50 000)
      inv = [Item.of('lightmanscurrency:coinblock_emerald', 6)];
      __wallet.setBalance(0);
      __personalBank.setBalance(0);
      __teamBank.setBalance(0);
      assert(computePlayerBalanceBreakdown(player).total === 216000, '6x coinblock_emerald = 216 000');
      assert(handleBuy(player, server, 'stage_2', 1) === 1, '/kup stage_2 z coinblock_emerald udany');
      assert(computePlayerBalanceBreakdown(player).total === 166000, 'Po zakupie za 50 000 z 216 000 zostaje dokładnie 166 000 (z resztą)');

      // Przypadek C: Mieszanka źródeł (portfel + bank osobisty + bank drużyny + coinpile_gold 900 w EQ) -> zakup lava_bucket
      const wC = Math.floor(lavaPrice * 0.2);
      const pbC = Math.floor(lavaPrice * 0.3);
      const tbC = Math.floor(lavaPrice * 0.2);
      const missingFromEq = lavaPrice - (wC + pbC + tbC);
      const expectedEqLeft = 900 - missingFromEq;
      inv = [Item.of('lightmanscurrency:coinpile_gold', 1)];
      __wallet.setBalance(wC);
      __personalBank.setBalance(pbC);
      __teamBank.setBalance(tbC);
      assert(computePlayerBalanceBreakdown(player).total === wC + pbC + tbC + 900, 'Mieszanka źródeł zgodna');
      assert(handleBuy(player, server, 'lava_bucket', 1) === 1, '/kup z mieszanki źródeł udany');
      assert(__wallet.getBalance() === 0, 'Portfel wyczyszczony jako 1.');
      assert(__personalBank.getBalance() === 0, 'Bank osobisty wyczyszczony jako 2.');
      assert(__teamBank.getBalance() === 0, 'Bank drużyny wyczyszczony jako 3.');
      assert(
        getInventoryCoinsCopper(player) === expectedEqLeft,
        'Z coinpile_gold (900) pobrano brakujące ' + missingFromEq + ' i wydano dokładnie ' + expectedEqLeft + ' reszty'
      );
      assert(computePlayerBalanceBreakdown(player).total === expectedEqLeft, 'Łączne saldo po mieszanym zakupie = ' + expectedEqLeft);

      // Przypadek D: Za mało pieniędzy (portfel + bank + EQ < koszt lava_bucket) -> ZERO pobranych monet!
      const wD = Math.floor(lavaPrice * 0.2);
      const pbD = Math.floor(lavaPrice * 0.3);
      const eqGoldD = Math.max(1, Math.floor((lavaPrice - wD - pbD - 100) / 100));
      inv = [Item.of('lightmanscurrency:coin_gold', eqGoldD)];
      __wallet.setBalance(wD);
      __personalBank.setBalance(pbD);
      __teamBank.setBalance(0);
      assert(handleBuy(player, server, 'lava_bucket', 1) === 0, '/kup przy braku środków odrzucone');
      assert(__wallet.getBalance() === wD, 'Portfel nietknięty po nieudanym zakupie');
      assert(__personalBank.getBalance() === pbD, 'Bank nietknięty po nieudanym zakupie');
      assert(getInventoryCoinsCopper(player) === eqGoldD * 100, 'Ekwipunek nietknięty po nieudanym zakupie');
    })();
    `;
  vm.runInNewContext(src, sandbox);
});

// 7. Issue #62: Automatyczny hash prices.json dla Shoppers + /halucynacje_reload_economy odświeża rynek i NPC
test('economy_anti_exploit.js + economy_market.js (#62): hash prices.json wykrywa edycje, pomija brak zmian, a reload odświeża oba cache', () => {
  const antiSrc = fs.readFileSync('kubejs/server_scripts/economy_anti_exploit.js', 'utf8');
  assert(!/\bSHOPPERS_SCHEMA_VERSION\b/.test(antiSrc), 'Stała SHOPPERS_SCHEMA_VERSION musi zostać usunięta (#62)');

  let currentPricesObj = JSON.parse(JSON.stringify(prices));
  let setCustomPriceCalls = 0;
  const customPrices = new Map();
  const loadedHandlers = [];
  const fireLoaded = (ev) => loadedHandlers.forEach((fn) => fn(ev));

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: {
      readString: () => JSON.stringify(currentPricesObj),
      read: () => currentPricesObj
    },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls === 'com.velesbh.shoppers.economy.ShoppersWorldData') {
          return {
            get: () => ({
              setCustomPrice: (id, worth) => {
                setCustomPriceCalls++;
                customPrices.set(String(id), Number(worth));
              }
            })
          };
        }
        return null;
      }
    },
    ServerEvents: {
      recipes: () => {},
      loaded: (cb) => {
        loadedHandlers.push(cb);
      },
      commandRegistry: () => {}
    },
    assert,
    __makeCompound: makeCompound,
    __getCalls: () => setCustomPriceCalls,
    __resetCalls: () => {
      setCustomPriceCalls = 0;
    },
    __customPrices: customPrices,
    __setBreadPrice: (w, npc) => {
      const next = JSON.parse(JSON.stringify(currentPricesObj));
      const bread = next.sell_tiers.tier_1_start.items.find((x) => x.id === 'minecraft:bread');
      bread.wholesale_gui = w;
      bread.npc_shoppers = npc;
      currentPricesObj = next;
    }
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(antiSrc, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const mockServer = {
    persistentData: makeCompound(),
    overworld: () => ({ __isOverworld: true }),
    runCommandSilent: () => {}
  };

  // 1) Pierwszy start -> brak zapisanego hasha -> synchronizacja Shoppers
  fireLoaded({ server: mockServer });
  assert(setCustomPriceCalls > 100, 'Pierwszy start musi zsynchronizować wszystkie ceny Shoppers');
  assert(customPrices.get('minecraft:bread') === 5, 'Początkowa cena NPC bread = 5');

  // 2) Drugi start bez edycji prices.json -> hash identyczny -> BRAK synchronizacji
  setCustomPriceCalls = 0;
  fireLoaded({ server: mockServer });
  assert(setCustomPriceCalls === 0, 'Brak zmiany prices.json nie może ponownie synchronizować Shoppers');

  // 3) Edycja prices.json -> kolejny start automatycznie wykrywa zmianę hasha i synchronizuje nową cenę
  sandbox.__setBreadPrice(10, 12);
  fireLoaded({ server: mockServer });
  assert(setCustomPriceCalls > 100, 'Zmiana prices.json musi wyzwolić automatyczną synchronizację przy starcie');
  assert(customPrices.get('minecraft:bread') === 12, 'Shoppers otrzymał nową cenę NPC bread = 12');

  // 4) Edycja prices.json + /halucynacje_reload_economy (handleReloadEconomy) -> oba cache odświeżone od razu!
  sandbox.__setBreadPrice(20, 24);
  setCustomPriceCalls = 0;
  const reloadRes = vm.runInContext('handleReloadEconomy', ctx)(mockServer);
  assert(reloadRes.catalog.sellById['minecraft:bread'].wholesale === 20, 'Rynek hurtowy po reload ma bread = 20');
  assert(reloadRes.shoppers && reloadRes.shoppers.viaJavaApi === true, 'Reload wywołał synchronizację Shoppers');
  assert(setCustomPriceCalls > 100, 'Reload zapisał nowe ceny do ShoppersWorldData');
  assert(customPrices.get('minecraft:bread') === 24, 'Shoppers po reload ma bread = 24');
});

// 8. Issue #50 + #79: Market Boom (+30%), Premia za Różnorodność (+5/10/15%, min. 250c/towar) i Serie Kontraktów (+35%..+55% + kamień milowy co 5)
test('economy_market.js + economy_contracts.js (#50/#79): Market Boom +30%, Różnorodność fabryki (min. 250c) i Serie Kontraktów', () => {
  let tickHandler = null;
  const announcements = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: {
      commandRegistry: () => {},
      tick: (cb) => {
        tickHandler = cb;
      }
    },
    Date,
    Math,
    assert,
    __makeCompound: makeCompound
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8'), ctx);

  const server = {
    persistentData: makeCompound(),
    tell: (t) => announcements.push(t.s),
    runCommandSilent: () => {}
  };

  // A) Market Boom +30% + rotacja po 20 min + tick
  const t0 = 1_700_000_000_000;
  const boom1 = vm.runInContext('getOrRollMarketBoom', ctx)(server, t0);
  assert(boom1 && boom1.itemId && boom1.boostedPrice === Math.round(boom1.basePrice * 1.3), 'Boom +30% dokładnie wyliczony');
  const boomSame = vm.runInContext('getOrRollMarketBoom', ctx)(server, t0 + 60_000);
  assert(boomSame.itemId === boom1.itemId, 'Boom nie zmienia się przed upływem 20 min');
  const boom2 = vm.runInContext('getOrRollMarketBoom', ctx)(server, t0 + 1_200_001);
  assert(boom2.itemId !== boom1.itemId, 'Po 20 min Boom losuje inny towar');
  assert(typeof tickHandler === 'function', 'ServerEvents.tick zarejestrowany dla rotacji Boomu');

  // B) Premia za Różnorodność (0% -> +5% przy 3 -> +10% przy 5 -> +15% przy 7 towarach >= 250c, wygasanie po 30 min)
  const recordDiv = vm.runInContext('recordDiversitySales', ctx);
  const getDiv = vm.runInContext('getCurrentDiversityStatus', ctx);
  assert(
    recordDiv(server, [{ itemId: 'item:a', value: 250 }, { itemId: 'item:b', value: 250 }], t0).bonusPercent === 0,
    '2 towary >= 250c -> 0%'
  );
  assert(recordDiv(server, [{ itemId: 'item:c', value: 250 }], t0 + 1000).bonusPercent === 5, '3 towary >= 250c -> +5%');
  assert(
    recordDiv(server, [{ itemId: 'item:d', value: 250 }, { itemId: 'item:e', value: 250 }], t0 + 2000).bonusPercent === 10,
    '5 towarów >= 250c -> +10%'
  );
  assert(
    recordDiv(server, [{ itemId: 'item:f', value: 250 }, { itemId: 'item:g', value: 250 }], t0 + 3000).bonusPercent === 15,
    '7 towarów >= 250c -> +15%'
  );
  assert(getDiv(server, t0 + 1_900_000).bonusPercent === 0, 'Po >30 min okno różnorodności wygasa do 0%');

  // C) Łączony mnożnik Boom +30% + Różnorodność +15% = +45% (cap 1.45x)
  const applyDyn = vm.runInContext('applyDynamicMarketBonuses', ctx);
  const combined = applyDyn(server, 1000, boom2.itemId, { uniqueCount: 7, bonusPercent: 15, multiplier: 1.15 }, boom2);
  assert(combined.isBoom === true && combined.finalPayout === 1450, 'Boom (+30%) + Różnorodność (+15%) = 1450 z 1000');

  // D) Serie Kontraktów (+35% -> +40% -> +45% -> +50% -> +55% + kamień milowy #5 = +25% + reset przy rerollu)
  const getMult = vm.runInContext('getContractStreakMultiplier', ctx);
  assert(getMult(0) === 1.35, 'Seria 0 -> +35%');
  assert(getMult(1) === 1.4, 'Seria 1 -> +40%');
  assert(getMult(2) === 1.45, 'Seria 2 -> +45%');
  assert(getMult(3) === 1.5, 'Seria 3 -> +50%');
  assert(getMult(4) === 1.55, 'Seria 4 -> +55%');
  assert(getMult(10) === 1.55, 'Seria 10 -> cap +55%');

  const getContract = vm.runInContext('getOrCreateActiveContract', ctx);
  const deliver = vm.runInContext('handleDeliverContract', ctx);
  const reroll = vm.runInContext('handleRerollContract', ctx);
  const getStreak = vm.runInContext('getCurrentContractStreak', ctx);

  let fifthPayoutReceived = 0;
  let fifthBaseValue = 0;
  let fifthContractPayout = 0;
  for (let step = 1; step <= 5; step++) {
    const c = getContract(server);
    const inv = [sandbox.Item.of(c.itemId, c.requiredCount)];
    const p = {
      username: 'StreakTester',
      x: 152,
      y: 65,
      z: 0,
      level: { dimension: 'minecraft:overworld' },
      inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
      give: (st) => inv.push(st),
      tell: () => {}
    };
    if (step === 5) {
      fifthBaseValue = c.baseValue;
      fifthContractPayout = c.payout;
      assert(c.bonusPercent === 55, '5. kontrakt w serii ma już +55% premii bazowej');
    }
    assert(deliver(p, server) === 1, `Kontrakt #${step} ukończony`);
    assert(getStreak(server) === step, `Seria po kontrakcie #${step} = ${step}`);
    if (step === 5) {
      const coinVals = {
        'lightmanscurrency:coin_netherite': 100000,
        'lightmanscurrency:coin_diamond': 10000,
        'lightmanscurrency:coin_emerald': 1000,
        'lightmanscurrency:coin_gold': 100,
        'lightmanscurrency:coin_iron': 10,
        'lightmanscurrency:coin_copper': 1
      };
      fifthPayoutReceived = inv.reduce((acc, st) => acc + (coinVals[st.id] || 0) * st.count, 0);
    }
  }
  const expectedMilestone = Math.round(fifthBaseValue * 0.25);
  assert(
    fifthPayoutReceived === fifthContractPayout + expectedMilestone,
    `5. kontrakt wypłaca premię serii +25% (${fifthPayoutReceived} === ${fifthContractPayout + expectedMilestone})`
  );

  // Reroll resetuje serię do 0
  const rerollPlayer = { username: 'StreakTester', tell: () => {} };
  assert(reroll(rerollPlayer, server) === 1, 'Reroll kontraktu udany');
  assert(getStreak(server) === 0, 'Reroll resetuje serię kontraktów do 0');
});

// 9. Issue #48: Zróżnicowanie marż (85% poza Rynkiem / 100% na Rynku), kotwiczenie /kontrakt oddaj i Automatyczny Dok Eksportowy (105% -> Team Bank)
test('shared_economy.js + economy_market.js + economy_contracts.js (#48): marże Wyspy-Rynku, kontrakty na Rynku i Dok Eksportowy', () => {
  let teamBankBalance = 0;
  let bankEnabled = true;

  const makeMoneyVal = (copper) => ({
    isEmpty: () => copper <= 0,
    getCoreValue: () => copper
  });

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls.endsWith('.CoinValue')) {
          return { fromNumber: (_chain, amt) => makeMoneyVal(Number(amt)) };
        }
        if (cls.endsWith('.TeamAPI')) {
          return {
            getApi: () => ({
              GetAllTeamsForPlayer: () =>
                bankEnabled
                  ? [
                      {
                        getID: () => 42,
                        hasBankAccount: () => true,
                        getBankAccount: () => ({
                          depositMoney: (mv) => {
                            teamBankBalance += mv.getCoreValue();
                          }
                        })
                      }
                    ]
                  : [],
              GetTeam: (_isClient, id) =>
                bankEnabled && id === 42
                  ? {
                      getID: () => 42,
                      hasBankAccount: () => true,
                      getBankAccount: () => ({
                        depositMoney: (mv) => {
                          teamBankBalance += mv.getCoreValue();
                        }
                      })
                    }
                  : null
            })
          };
        }
        return null;
      }
    },
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8'), ctx);

  // Przygotuj kontener na Wyspie-Rynku (150, 65, 2) z Tier 0 cobble (nie do ruszenia!) + 10x squid_ink_pasta (Tier 1, sell_stage=0)
  const dockSlots = [
    sandbox.Item.of('minecraft:cobblestone', 64),
    sandbox.Item.of('farmersdelight:squid_ink_pasta', 10)
  ];
  const dockBlock = {
    x: 150,
    y: 65,
    z: 2,
    id: 'create:item_vault',
    inventory: {
      getContainerSize: () => dockSlots.length,
      getItem: (idx) => dockSlots[idx],
      setChanged: () => {}
    }
  };

  const server = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {},
    overworld: () =>
      makeStrictOverworldMock({
        getBlock: (x, y, z) => (x === 150 && y === 65 && z === 2 ? dockBlock : null)
      })
  };

  // Ustaw deterministyczny Boom na inny przedmiot (żeby nie zaburzał wyliczeń squid_ink_pasta)
  const boomTag = server.persistentData.getCompound('halucynacje_market_boom');
  boomTag.putString('itemId', 'minecraft:cookie');
  boomTag.putInt('basePrice', 6);
  boomTag.putInt('boostedPrice', 8);
  boomTag.putInt('packSize', 1);
  boomTag.putLong('expiresAtMs', Date.now() + 600_000);
  server.persistentData.put('halucynacje_market_boom', boomTag);

  const sellHand = vm.runInContext('handleSellHand', ctx);
  const deliverContract = vm.runInContext('handleDeliverContract', ctx);
  const getContract = vm.runInContext('getOrCreateActiveContract', ctx);
  const addDock = vm.runInContext('handleAddExportDock', ctx);
  const processDocks = vm.runInContext('processExportDocksTick', ctx);
  const claimPending = vm.runInContext('handleClaimExportPending', ctx);

  const coinVals = {
    'lightmanscurrency:coin_netherite': 100000,
    'lightmanscurrency:coin_diamond': 10000,
    'lightmanscurrency:coin_emerald': 1000,
    'lightmanscurrency:coin_gold': 100,
    'lightmanscurrency:coin_iron': 10,
    'lightmanscurrency:coin_copper': 1
  };
  const sumCoins = (arr) => arr.reduce((a, st) => a + (coinVals[st.id] || 0) * st.count, 0);

  const pastaPrice = prices.sell_tiers.tier_1_start.items.find((x) => x.id === 'farmersdelight:squid_ink_pasta').wholesale_gui;

  // A) Poza Wyspą-Rynkiem (0, 65, 0): /sprzedaj płaci 85%
  const remoteInv = [];
  const remotePlayer = {
    username: 'RemotePlayer',
    x: 0,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    mainHandItem: sandbox.Item.of('farmersdelight:squid_ink_pasta', 1),
    inventory: { getContainerSize: () => remoteInv.length, getItem: (idx) => remoteInv[idx] },
    give: (st) => remoteInv.push(st),
    tell: () => {},
    rayTrace: () => ({ block: { x: 0, y: 65, z: 2, id: 'minecraft:chest', inventory: { getContainerSize: () => 0 } } })
  };
  assert(sellHand(remotePlayer, server) === 1, 'Zdalne /sprzedaj działa');
  assert(
    sumCoins(remoteInv) === Math.round(pastaPrice * 0.85),
    `Zdalne /sprzedaj płaci dokładnie 85% (${sumCoins(remoteInv)} === ${Math.round(pastaPrice * 0.85)})`
  );

  // B) Na Wyspie-Rynku (152, 65, 0): /sprzedaj płaci 100%
  const marketInv = [];
  const marketPlayer = {
    username: 'MarketPlayer',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    mainHandItem: sandbox.Item.of('farmersdelight:squid_ink_pasta', 1),
    inventory: { getContainerSize: () => marketInv.length, getItem: (idx) => marketInv[idx] },
    give: (st) => marketInv.push(st),
    tell: () => {},
    rayTrace: () => ({ block: dockBlock })
  };
  assert(sellHand(marketPlayer, server) === 1, 'Na Rynku /sprzedaj działa');
  assert(sumCoins(marketInv) === pastaPrice, `Na Rynku /sprzedaj płaci dokładnie 100% (${pastaPrice})`);

  // C) /kontrakt oddaj: zablokowany na Wyspie Startowej, działa na Wyspie-Rynku
  const c = getContract(server);
  remoteInv.push(sandbox.Item.of(c.itemId, c.requiredCount));
  assert(deliverContract(remotePlayer, server) === 0, '/kontrakt oddaj zablokowany poza Wyspą-Rynkiem');
  marketInv.push(sandbox.Item.of(c.itemId, c.requiredCount));
  assert(deliverContract(marketPlayer, server) === 1, '/kontrakt oddaj udany na Wyspie-Rynku');

  // D) Rejestracja Doku Eksportowego: zablokowana poza Rynkiem, dozwolona na Rynku
  assert(addDock(remotePlayer, server) === 0, 'Dok eksportowy zablokowany poza Wyspą-Rynkiem');
  assert(addDock(marketPlayer, server) === 1, 'Dok eksportowy zarejestrowany na Wyspie-Rynku (Item Vault)');

  // E) Tick Doku Eksportowego: 10x squid_ink_pasta * 1.05 trafia do Team Bank #42, cobblestone nietknięty!
  const expectedDock10 = Math.round(pastaPrice * 10 * 1.05);
  const tickRes = processDocks(server, Date.now());
  assert(tickRes.itemsSold === 10, 'Dok sprzedał dokładnie 10x squid_ink_pasta');
  assert(tickRes.deposited === expectedDock10, `Dok przelał ${expectedDock10} monet (+5% logistyka) do Team Bank #42`);
  assert(teamBankBalance === expectedDock10, `Saldo Team Bank #42 wzrosło dokładnie o ${expectedDock10}`);
  assert(dockSlots[0].count === 64, 'Bruk z limitem godzinowym (cobblestone) w Doku pozostał nietknięty');
  assert(dockSlots[1].count === 0, 'Przetworzony towar został opróżniony z Doku');

  // F) Fallback bez banku -> trafia do pending i daje się odebrać przez /rynek_eksport odbierz
  bankEnabled = false;
  const expectedDock2 = Math.round(pastaPrice * 2 * 1.05);
  dockSlots[1] = sandbox.Item.of('farmersdelight:squid_ink_pasta', 2);
  const tickRes2 = processDocks(server, Date.now());
  assert(tickRes2.deposited === 0 && tickRes2.pendingAdded === expectedDock2, `Bez banku ${expectedDock2} monet trafia bezpiecznie do pending`);
  const claimInv = [];
  const claimPlayer = { username: 'MarketPlayer', give: (st) => claimInv.push(st), tell: () => {} };
  assert(claimPending(claimPlayer, server) === 1, '/rynek_eksport odbierz udany');
  assert(sumCoins(claimInv) === expectedDock2, `Odebrano dokładnie ${expectedDock2} monet bez strat`);
});

// 10. Issue #53: Ogłoszenia kamieni milowych Tycoona, /ekonomia top oraz weryfikacja tekstur 16x16 Żetonów Etapów
test('economy_market.js + assets (#53): kamienie milowe Tycoona (jednorazowe), /ekonomia top i tekstury 16x16 Żetonów Etapów', () => {
  // A) Weryfikacja 5 tekstur PNG 16x16 i modeli item/generated w kubejs/assets/kubejs/
  for (let s = 1; s <= 5; s++) {
    const texPath = `kubejs/assets/kubejs/textures/item/stage_${s}_token.png`;
    const modelPath = `kubejs/assets/kubejs/models/item/stage_${s}_token.json`;
    assert(fs.existsSync(texPath), `Brak tekstury ${texPath}`);
    assert(fs.existsSync(modelPath), `Brak modelu ${modelPath}`);
    const png = fs.readFileSync(texPath);
    assert(png.slice(0, 8).toString('hex') === '89504e470d0a1a0a', `${texPath} musi być poprawnym PNG`);
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    assert(width === 16 && height === 16, `${texPath} musi mieć wymiary 16x16 (jest ${width}x${height})`);
    const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
    assert(model.textures && model.textures.layer0 === `kubejs:item/stage_${s}_token`, `Poprawny layer0 w ${modelPath}`);
  }

  // B) Kamienie milowe (10k, 50k...) odpalają się DOKŁADNIE RAZ + ranking w /ekonomia top
  const broadcasts = [];
  const cmds = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const server = {
    persistentData: makeCompound(),
    tell: (t) => broadcasts.push(t.s),
    runCommandSilent: (c) => cmds.push(c)
  };

  const recordStats = vm.runInContext('recordExportStats', ctx);
  const showTop = vm.runInContext('handleShowEconomyTop', ctx);

  // 1) Eksport 9 000 -> jeszcze bez kamienia milowego
  let trig = recordStats(server, 9000, 150, 'Alice', [{ itemId: 'farmersdelight:hamburger', soldItems: 150, payout: 9000 }]);
  assert(trig.length === 0 && broadcasts.length === 0, 'Poniżej 10k brak ogłoszenia milowego');

  // 2) Eksport +45 000 (łącznie 54 000) -> odpala 10k i 50k (2 ogłoszenia)
  trig = recordStats(server, 45000, 100, '[Dok Eksportowy]', [{ itemId: 'create:precision_mechanism', soldItems: 100, payout: 45000 }]);
  assert(trig.length === 2, 'Przekroczenie 54k wyzwala kamienie 10k i 50k');
  assert(broadcasts.length === 2, 'Wysłano dokładnie 2 ogłoszenia milowe');

  // 3) Kolejny eksport +1 000 (55 000) -> ZERO duplikatów!
  trig = recordStats(server, 1000, 10, 'Alice', [{ itemId: 'farmersdelight:hamburger', soldItems: 10, payout: 1000 }]);
  assert(trig.length === 0 && broadcasts.length === 2, 'Raz zdobyte kamienie milowe nie duplikują ogłoszeń');

  // 4) /ekonomia top wypisuje ranking produktów (precision_mechanism > hamburger) i eksporterów ([Dok Eksportowy] > Alice)
  const topLines = [];
  const viewer = { username: 'Alice', tell: (t) => topLines.push(t.s) };
  assert(showTop(viewer, server) === 1, '/ekonomia top zwraca 1');
  const joined = topLines.join('\n');
  assert(joined.includes('create:precision_mechanism') && joined.includes('farmersdelight:hamburger'), '/ekonomia top zawiera oba produkty');
  assert(joined.indexOf('create:precision_mechanism') < joined.indexOf('farmersdelight:hamburger'), 'precision_mechanism jest przed hamburgerem w TOP');
  assert(joined.includes('[Dok Eksportowy]') && joined.includes('Alice'), '/ekonomia top zawiera eksporterów');
  assert(joined.includes('100 000 monet'), '/ekonomia top pokazuje kolejny kamień milowy (100k)');
});

// 11. Issue #52: Walidacja SNBT FTB Quests (unikalność ID, bilans nawiasów, dotacja startowa Stage 0 = 1500 monet)
test('config/ftbquests (#52): poprawne SNBT, brak duplikatów ID i nagrody startowe LC w Stage 0', () => {
  const chaptersDir = 'config/ftbquests/quests/chapters';
  const files = fs.readdirSync(chaptersDir).filter((f) => f.endsWith('.snbt')).sort();
  assert(files.length >= 6, 'Oczekiwano >= 6 rozdziałów FTB Quests');

  const seenIds = new Map();
  for (const file of files) {
    const raw = fs.readFileSync(`${chaptersDir}/${file}`, 'utf8');
    // Sprawdź bilans nawiasów { } i [ ] poza stringami
    let braces = 0;
    let brackets = 0;
    let inStr = false;
    for (let i = 0; i < raw.length; i++) {
      const ch = raw[i];
      if (ch === '"' && raw[i - 1] !== '\\') {
        inStr = !inStr;
        continue;
      }
      if (inStr) continue;
      if (ch === '{') braces++;
      else if (ch === '}') braces--;
      else if (ch === '[') brackets++;
      else if (ch === ']') brackets--;
      assert(braces >= 0 && brackets >= 0, `Niepoprawny nawias zamykający w ${file}`);
    }
    assert(braces === 0 && brackets === 0 && !inStr, `Niedomknięty nawias/string w ${file}`);

    // Unikalność wszystkich 16-znakowych ID hex (rozdział, quest, task, reward)
    for (const m of raw.matchAll(/\bid:\s*"([0-9A-F]{16})"/g)) {
      const id = m[1];
      assert(!seenIds.has(id), `Duplikat ID FTB Quests "${id}" w ${file} (już w ${seenIds.get(id)})`);
      seenIds.set(id, file);
    }
  }

  // Weryfikacja nagród monetowych Stage 0 (250 + 500 + 750 = 1500 monet)
  const s0 = fs.readFileSync(`${chaptersDir}/stage_0_start.snbt`, 'utf8');
  assert(s0.includes('D000000000000202') && s0.includes('lightmanscurrency:coin_iron'), 'Nagroda +250c za Mechanical Extruder');
  assert(s0.includes('D000000000000403') && s0.includes('lightmanscurrency:coin_gold'), 'Nagroda +500c za Bulk Washing');
  assert(s0.includes('D000000000000603') && s0.includes('D000000000000604'), 'Nagroda +750c za Pierwszą Kuchnię');
});

// 12. Issue #51: Perki za Żetony Etapów (+FTB Chunks force-load, +2%..+10% skup, limit Doków 4..8, tytuł [Tycoon])
test('shared_economy.js + dimension_gating.js + economy_market.js (#51): perki Etapów 1..5, idempotentne FTB Chunks i limit Doków', () => {
  const ranCmds = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { loaded: () => {}, commandRegistry: () => {}, tick: () => {} },
    PlayerEvents: { loggedIn: () => {} },
    ItemEvents: { rightClicked: () => {} },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/dimension_gating.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const server = {
    persistentData: makeCompound(),
    players: [],
    tell: () => {},
    runCommandSilent: (cmd) => ranCmds.push(cmd)
  };
  const player = {
    username: 'TycoonHero',
    persistentData: makeCompound(),
    tell: () => {}
  };
  server.players.push(player);

  const getPerks = vm.runInContext('getStagePerks', ctx);
  const grantStage = vm.runInContext('grantStage', ctx);
  const getDockLim = vm.runInContext('getEffectiveExportDockLimit', ctx);
  const applyDyn = vm.runInContext('applyDynamicMarketBonuses', ctx);

  // Stage 0 baseline
  assert(getPerks(0).extraForceChunks === 0 && getDockLim(server) === 4, 'Stage 0 -> 0 extra chunks, 4 doki');

  // Stage 1..5 -> idempotentne `ftbchunks admin extra_force_load_chunks <gracz> set <extra>`
  grantStage(player, server, 'stage_1');
  assert(
    ranCmds.includes('ftbchunks admin extra_force_load_chunks TycoonHero set 2'),
    'Stage 1 ustawia +2 extra force-load chunks (set = idempotentne)'
  );
  grantStage(player, server, 'stage_2');
  grantStage(player, server, 'stage_3');
  assert(getDockLim(server) === 5, 'Stage 3 zwiększa limit Doków Eksportowych do 5');
  grantStage(player, server, 'stage_4');
  assert(getDockLim(server) === 6, 'Stage 4 zwiększa limit Doków Eksportowych do 6');
  grantStage(player, server, 'stage_5');
  assert(
    ranCmds.includes('ftbchunks admin extra_force_load_chunks TycoonHero set 14'),
    'Stage 5 ustawia +14 extra force-load chunks'
  );
  assert(getDockLim(server) === 8, 'Stage 5 zwiększa limit Doków Eksportowych do 8');
  assert(getPerks(5).title === '[Tycoon]', 'Stage 5 daje tytuł [Tycoon]');

  // Stage 5 premia handlowa (+10%) w applyDynamicMarketBonuses
  const res = applyDyn(server, 1000, 'minecraft:bread', { uniqueCount: 0, bonusPercent: 0, multiplier: 1.0 }, null);
  assert(res.stageBonusPercent === 10 && res.finalPayout === 1100, 'Stage 5 daje +10% premii handlowej (1000 -> 1100)');
});

// 13. Issue #64: Dostępność Portalu Endu na Stage 4 (gating < Stage 4, team_limit=12, blokada /sprzedaj)
test('economy_market.js (#64): end_portal_frame i ender_eye wymagają Stage 4, mają limit 12/drużynę i 0 monet w /sprzedaj', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const handleBuy = vm.runInContext('handleBuy', ctx);
  const handleSellHand = vm.runInContext('handleSellHand', ctx);
  const handleSellAll = vm.runInContext('handleSellAll', ctx);
  const sellSingleStack = vm.runInContext('sellSingleStack', ctx);
  const getMarketCatalog = vm.runInContext('getMarketCatalog', ctx);
  const getInventoryCoinBalance = vm.runInContext('getInventoryCoinBalance', ctx);

  const server = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {}
  };
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  gs.putBoolean('stage_1', true);
  gs.putBoolean('stage_2', true);
  gs.putBoolean('stage_3', true);

  const inv = [sandbox.Item.of('lightmanscurrency:coin_netherite', 5)]; // 500 000 monet
  const msgs = [];
  const player = {
    username: 'EndExplorer',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('minecraft:end_portal_frame', 1),
    inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
    give: (st) => inv.push(st),
    tell: (t) => msgs.push(t.s)
  };

  // A) Na Stage 3 zakup end_portal_frame i ender_eye musi być ODRZUCONY (0 monet pobranych)
  assert(handleBuy(player, server, 'end_portal_frame', 1) === 0, '/kup end_portal_frame odrzucone na Stage 3');
  assert(handleBuy(player, server, 'ender_eye', 1) === 0, '/kup ender_eye odrzucone na Stage 3');
  assert(getInventoryCoinBalance(player) === 500000, 'Brak pobrania monet przy odrzuceniu Stage 3');

  // B) Po odblokowaniu Stage 4: limit 12 dla end_portal_frame (13 odrzucone, 10 + 2 OK, 13. sztuka odrzucona)
  gs.putBoolean('stage_4', true);
  assert(handleBuy(player, server, 'end_portal_frame', 13) === 0, 'Zakup 13x end_portal_frame naraz odrzucony (team_limit=12)');
  assert(handleBuy(player, server, 'end_portal_frame', 10) === 10, 'Zakup 10x end_portal_frame na Stage 4 udany');
  assert(handleBuy(player, server, 'end_portal_frame', 2) === 2, 'Zakup brakujących 2x end_portal_frame (łącznie 12) udany');
  assert(handleBuy(player, server, 'end_portal_frame', 1) === 0, '13. sztuka end_portal_frame odrzucona przez team_limit=12');

  // C) To samo dla ender_eye (13 odrzucone, 12 OK, 13. sztuka odrzucona)
  assert(handleBuy(player, server, 'ender_eye', 13) === 0, 'Zakup 13x ender_eye naraz odrzucony (team_limit=12)');
  assert(handleBuy(player, server, 'ender_eye', 12) === 12, 'Zakup 12x ender_eye na Stage 4 udany');
  assert(handleBuy(player, server, 'ender_eye', 1) === 0, '13. sztuka ender_eye odrzucona przez team_limit=12');

  const balanceAfterBuy = getInventoryCoinBalance(player);
  const framePrice = prices.buy_catalog.find((x) => x.id === 'minecraft:end_portal_frame').buy_price;
  const eyePrice = prices.buy_catalog.find((x) => x.id === 'minecraft:ender_eye').buy_price;
  assert(
    balanceAfterBuy === 500000 - 12 * framePrice - 12 * eyePrice,
    'Dokładne saldo po zakupie 12 ram i 12 oczu Endu'
  );

  // D) Próba /sprzedaj na end_portal_frame i ender_eye musi być ODRZUCONA (0 monet wypłaty)
  const cat = getMarketCatalog(true);
  assert(sellSingleStack(sandbox.Item.of('minecraft:end_portal_frame', 12), cat).status === 'blocked', 'end_portal_frame zablokowane w Tier 0');
  assert(sellSingleStack(sandbox.Item.of('minecraft:ender_eye', 12), cat).status === 'blocked', 'ender_eye zablokowane w Tier 0');

  player.mainHandItem = sandbox.Item.of('minecraft:end_portal_frame', 12);
  assert(handleSellHand(player, server) === 0, '/sprzedaj end_portal_frame odrzucone');
  player.mainHandItem = sandbox.Item.of('minecraft:ender_eye', 12);
  assert(handleSellHand(player, server) === 0, '/sprzedaj ender_eye odrzucone');
  assert(handleSellAll(player, server) === 0, '/sprzedaj all pomija ramy i oczy (0 sprzedanych)');
  assert(getInventoryCoinBalance(player) === balanceAfterBuy, 'Saldo po próbach /sprzedaj nie wzrosło (0 monet wypłaty)');
});

// 14. Issue #51 (część 2): Usunięcie Creative Motor i survivalowy Wielki Finał Tycoona (/kontrakt final -> Trofeum + 500k)
test('economy_contracts.js + assets (#51 cz. 2): brak Creative Motor, tekstura Trofeum 16x16 i Mega-Kontrakt /kontrakt final', () => {
  // A) Brak create:creative_motor w prices.json i PersistentTraders.json
  assert(
    !prices.buy_catalog.some((x) => x.id === 'create:creative_motor'),
    'create:creative_motor nie może występować w buy_catalog (#51)'
  );
  const tradersRaw = fs.readFileSync('config/lightmanscurrency/PersistentTraders.json', 'utf8');
  assert(!tradersRaw.includes('create:creative_motor'), 'PersistentTraders.json nie może sprzedawać creative_motor (#51)');

  // B) Tekstura 16x16 PNG i model kubejs:tycoon_empire_trophy
  const trophyTex = 'kubejs/assets/kubejs/textures/item/tycoon_empire_trophy.png';
  const trophyModel = 'kubejs/assets/kubejs/models/item/tycoon_empire_trophy.json';
  assert(fs.existsSync(trophyTex), 'Brak tekstury tycoon_empire_trophy.png');
  assert(fs.existsSync(trophyModel), 'Brak modelu tycoon_empire_trophy.json');
  const png = fs.readFileSync(trophyTex);
  assert(png.slice(0, 8).toString('hex') === '89504e470d0a1a0a', 'tycoon_empire_trophy.png musi być poprawnym PNG');
  assert(png.readUInt32BE(16) === 16 && png.readUInt32BE(20) === 16, 'tycoon_empire_trophy.png musi mieć wymiary 16x16');
  const modelJson = JSON.parse(fs.readFileSync(trophyModel, 'utf8'));
  assert(modelJson.textures && modelJson.textures.layer0 === 'kubejs:item/tycoon_empire_trophy', 'Poprawny layer0 modelu trofeum');

  // C) Logika Mega-Kontraktu /kontrakt final
  const broadcasts = [];
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {} },
    Date,
    Math,
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8'), ctx);

  const server = {
    persistentData: makeCompound(),
    tell: (t) => broadcasts.push(t.s),
    runCommandSilent: () => {}
  };
  const deliverFinale = vm.runInContext('handleDeliverFinaleContract', ctx);
  const showFinale = vm.runInContext('handleShowFinaleContract', ctx);
  const reqs = vm.runInContext('ENDGAME_FINALE_REQUIREMENTS', ctx);

  const makeFullInv = () => reqs.map((r) => sandbox.Item.of(r.id, r.count));
  // Sprawdź zaktualizowane wymagania Wielkiego Finału (RFC #83: 2x 256k, 16x Ruby Chocolate)
  assert(
    reqs.some((r) => r.id === 'ae2:cell_component_256k' && r.count === 2),
    'Wielki Finał wymaga dokładnie 2x ae2:cell_component_256k (#83)'
  );
  assert(
    reqs.some((r) => r.id === 'create_confectionery:bar_of_ruby_chocolate' && r.count === 16),
    'Wielki Finał wymaga dokładnie 16x bar_of_ruby_chocolate (#83)'
  );

  let inv = makeFullInv();
  const finaleMsgs = [];
  const player = {
    username: 'GrandTycoon',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
    give: (st) => inv.push(st),
    tell: (t) => finaleMsgs.push(t.s)
  };

  assert(showFinale(player, server) === 1, '/kontrakt final wyświetla status');
  // 1) Przed Stage 5 -> zablokowane
  assert(deliverFinale(player, server) === 0, '/kontrakt final oddaj zablokowane przed Stage 5');

  // 2) Stage 5, ale poza Wyspą-Rynkiem -> zablokowane
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  for (let s = 1; s <= 5; s++) gs.putBoolean('stage_' + s, true);
  player.x = 0;
  assert(deliverFinale(player, server) === 0, '/kontrakt final oddaj zablokowane poza Wyspą-Rynkiem');
  player.x = 152;

  // 3) Brak 1 składnika -> atomowa odmowa (0 zabranych przedmiotów!)
  inv[4].count = 3; // brakuje 1x pellet_polonium
  assert(deliverFinale(player, server) === 0, 'Brak 1 składnika blokuje finał');
  assert(inv[0].count === reqs[0].count, 'Atomowość: przy braku 1 składnika nic nie zostało zabrane');
  inv[4].count = reqs[4].count;

  // 4) Komplet 5 filarów na Wyspie-Rynku na Stage 5 -> sukces: Trofeum + 750 000 monet + ogłoszenie!
  assert(deliverFinale(player, server) === 1, '/kontrakt final oddaj udany');
  for (let k = 0; k < reqs.length; k++) {
    assert(inv[k].count === 0, `Pobrano cały wymóg ${reqs[k].id}`);
  }
  assert(inv.some((st) => st.id === 'kubejs:tycoon_empire_trophy' && st.count === 1), 'Przyznano 1x kubejs:tycoon_empire_trophy');
  const coinVals = {
    'lightmanscurrency:coin_netherite': 100000,
    'lightmanscurrency:coin_diamond': 10000,
    'lightmanscurrency:coin_emerald': 1000,
    'lightmanscurrency:coin_gold': 100,
    'lightmanscurrency:coin_iron': 10,
    'lightmanscurrency:coin_copper': 1
  };
  const coinsReceived = inv.reduce((acc, st) => acc + (coinVals[st.id] || 0) * st.count, 0);
  assert(coinsReceived === 750000, `Wypłacono dokładnie 750 000 monet premii finałowej (jest ${coinsReceived})`);
  assert(broadcasts.some((m) => m.includes('WIELKI FINAŁ TYCOONA')), 'Wysłano serwerowe ogłoszenie Wielkiego Finału');

  // 5) /kontrakt final pokazuje status ukończenia, a 2. oddanie zostaje odrzucone BEZ zabierania przedmiotów!
  finaleMsgs.length = 0;
  assert(showFinale(player, server) === 1, '/kontrakt final działa po ukończeniu');
  assert(
    finaleMsgs.some((m) => m.includes('Wielki Finał już ukończony')),
    '/kontrakt final pokazuje status ukończenia'
  );

  inv = makeFullInv();
  finaleMsgs.length = 0;
  assert(deliverFinale(player, server) === 0, 'Drugie /kontrakt final oddaj musi być odrzucone (nagroda jednorazowa)');
  assert(
    finaleMsgs.some((m) => m.includes('Wielki Finał już ukończony')),
    'Komunikat odmowy zawiera "Wielki Finał już ukończony"'
  );
  for (let k = 0; k < reqs.length; k++) {
    assert(inv[k].count === reqs[k].count, `Przy odrzuceniu 2. oddania nic nie zabrano (${reqs[k].id})`);
  }
  assert(!inv.some((st) => st.id === 'kubejs:tycoon_empire_trophy'), 'Brak drugiego Trofeum przy ponownej próbie');
  assert(
    inv.reduce((acc, st) => acc + (coinVals[st.id] || 0) * st.count, 0) === 0,
    'Brak wypłaty monet przy ponownej próbie Finału'
  );
});

// 15. Issue #78: Co-op na wyspie Spawn — blokada /skyblock create i ostrzeżenie przy logowaniu w drużynie spoza Spawn
test('dimension_gating.js + permissions.json5 (#78): blokada team_create i ostrzeżenie dla drużyny spoza Spawn', () => {
  // A) permissions.json5 definiuje jawną listę permissions bez team_create i z teleport_to_spawn
  const permsRaw = fs.readFileSync('config/skyblockbuilder/permissions.json5', 'utf8');
  const permsNoComments = permsRaw.replace(/\/\/[^\n]*/g, '');
  const listMatch = permsNoComments.match(/\bpermissions\s*:\s*\[([^\]]*)\]/);
  assert(listMatch !== null, 'permissions.json5 musi jawnie definiować listę permissions');
  const permsList = listMatch[1];
  assert(!/team_create/i.test(permsList), 'permissions.json5 nie może zawierać team_create (#78)');
  assert(!/team_handle_invites/i.test(permsList), 'permissions.json5 nie może zawierać team_handle_invites (#78)');
  assert(/teleport_to_spawn/i.test(permsList), 'permissions.json5 musi zachować teleport_to_spawn');

  // B) warnIfNonSpawnSkyblockTeam + PlayerEvents.loggedIn
  let loggedInHandler = null;
  const warnings = [];
  const sandbox = {
    console: { info: () => {}, warn: (m) => warnings.push(String(m)), error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { loaded: () => {}, commandRegistry: () => {} },
    PlayerEvents: {
      loggedIn: (cb) => {
        loggedInHandler = cb;
      }
    },
    ItemEvents: { rightClicked: () => {} },
    NativeEvents: { onEvent: () => {} },
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/dimension_gating.js', 'utf8'), ctx);
  assert(typeof loggedInHandler === 'function', 'PlayerEvents.loggedIn zarejestrowany');

  const makeMockPlayer = (name) => {
    const msgs = [];
    return {
      username: name,
      persistentData: makeCompound(),
      tell: (t) => msgs.push(t.s),
      _msgs: msgs
    };
  };

  // 1) Brak drużyny Skyblock Builder (domyślny gracz na Spawn) -> zero ostrzeżeń
  const pNoTeam = makeMockPlayer('CoopAlpha');
  const srvNoTeam = {
    persistentData: makeCompound(),
    runCommandSilent: () => {},
    _getSkyblockTeamForPlayer: () => null
  };
  loggedInHandler({ player: pNoTeam, server: srvNoTeam });
  assert(warnings.length === 0 && pNoTeam._msgs.length === 0, 'Gracz bez drużyny (na Spawn) nie dostaje ostrzeżenia');

  // 2) Drużyna Spawn (isSpawn() === true) -> zero ostrzeżeń
  const pSpawn = makeMockPlayer('CoopBeta');
  const srvSpawn = {
    persistentData: makeCompound(),
    runCommandSilent: () => {},
    _getSkyblockTeamForPlayer: () => ({ isSpawn: () => true, getName: () => 'Spawn' })
  };
  loggedInHandler({ player: pSpawn, server: srvSpawn });
  assert(warnings.length === 0 && pSpawn._msgs.length === 0, 'Gracz w drużynie Spawn nie dostaje ostrzeżenia');

  // 3) Drużyna inna niż Spawn (isSpawn() === false) -> ostrzeżenie w logu i na czacie!
  const pOther = makeMockPlayer('LostPlayer');
  const srvOther = {
    persistentData: makeCompound(),
    runCommandSilent: () => {},
    _getSkyblockTeamForPlayer: () => ({ isSpawn: () => false, getName: () => 'DalekaWyspa' })
  };
  loggedInHandler({ player: pOther, server: srvOther });
  assert(warnings.length === 1, 'Log serwera otrzymuje ostrzeżenie dla drużyny spoza Spawn');
  assert(
    warnings[0].includes('DalekaWyspa') && warnings[0].includes('/kontrakt') && warnings[0].includes('/rynek_eksport'),
    'Log serwera wskazuje nazwę drużyny oraz brak działania /kontrakt i /rynek_eksport'
  );
  assert(pOther._msgs.length === 1, 'Gracz otrzymuje ostrzeżenie na czacie przy logowaniu');
  assert(
    pOther._msgs[0].includes('DalekaWyspa') && pOther._msgs[0].includes('(152, 64, 0)'),
    'Komunikat na czacie wskazuje nazwę drużyny i koordynaty Wyspy-Rynku (152, 64, 0)'
  );
});

// 16. Issue #79: Limity premii (+25% bez Boomu / +45% z Boomem = maks. x1.45), próg 250c dla Różnorodności i zdalna < NPC
test('shared_economy.js + economy_market.js (#79): twardy cap premii x1.45, anty-cheese Różnorodności i zdalna zawsze < NPC', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const server = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {}
  };
  // Odblokuj Stage 5 (+10% premii Etapu)
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  for (let s = 1; s <= 5; s++) gs.putBoolean('stage_' + s, true);

  const recordDiv = vm.runInContext('recordDiversitySales', ctx);
  const applyDyn = vm.runInContext('applyDynamicMarketBonuses', ctx);
  const sellHand = vm.runInContext('handleSellHand', ctx);

  // A) Anty-cheese Różnorodności: 7 różnych towarów po 10 monet każdy (< 250c) daje 0%!
  const t0 = 1_700_500_000_000;
  const cheapCheese = ['i:1', 'i:2', 'i:3', 'i:4', 'i:5', 'i:6', 'i:7'].map((id) => ({ itemId: id, value: 10 }));
  const divCheap = recordDiv(server, cheapCheese, t0);
  assert(
    divCheap.uniqueCount === 0 && divCheap.bonusPercent === 0,
    `7 najtańszych towarów po 10c nie może dawać premii Różnorodności (jest +${divCheap.bonusPercent}%)`
  );

  // Kumulacja w oknie 30 min: dopłata +240c (łącznie 250c/towar) odblokowuje 7 kwalifikujących się towarów -> +15%
  const topUp = ['i:1', 'i:2', 'i:3', 'i:4', 'i:5', 'i:6', 'i:7'].map((id) => ({ itemId: id, value: 240 }));
  const divReal = recordDiv(server, topUp, t0 + 1000);
  assert(
    divReal.uniqueCount === 7 && divReal.bonusPercent === 15,
    `7 towarów >= 250c daje dokładnie +15% Różnorodności (jest +${divReal.bonusPercent}%)`
  );

  // B) Twardy cap bez Boomu (+25%): Dok (+5%) + Różnorodność (+15%) + Stage 5 (+10%) = 30% -> przycięte do +25% (1250 z 1000)
  const boomOther = { itemId: 'other:item', basePrice: 100, boostedPrice: 130, bonusPercent: 30, expiresAtMs: t0 + 600_000 };
  const nonBoomCapped = applyDyn(server, 1000, 'mekanism:pellet_polonium', divReal, boomOther, {
    onMarket: true,
    isExportDock: true
  });
  assert(
    nonBoomCapped.finalPayout === 1250 && nonBoomCapped.totalBonusPercent === 25 && nonBoomCapped.capped === true,
    `Maks. premia bez Boomu musi być przycięta do +25% (jest ${nonBoomCapped.finalPayout}, +${nonBoomCapped.totalBonusPercent}%)`
  );

  // C) Twardy cap z Boomem (+45% = x1.45): Dok (+5%) + Różnorodność (+15%) + Stage 5 (+10%) + Boom (+30%) -> przycięte do +45% (1450 z 1000)
  const poloniumEntry = prices.sell_tiers.tier_5_hightech_export.items.find(
    (it) => it.id === 'mekanism:pellet_polonium'
  );
  const poloniumWholesale = poloniumEntry.wholesale_gui;
  const poloniumBoosted = Math.round(poloniumWholesale * 1.3);
  const boomSame = {
    itemId: 'mekanism:pellet_polonium',
    basePrice: poloniumWholesale,
    boostedPrice: poloniumBoosted,
    bonusPercent: 30,
    expiresAtMs: t0 + 600_000
  };
  const boomCapped = applyDyn(server, 1000, 'mekanism:pellet_polonium', divReal, boomSame, {
    onMarket: true,
    isExportDock: true
  });
  assert(
    boomCapped.finalPayout === 1450 && boomCapped.totalBonusPercent === 45 && boomCapped.capped === true,
    `Maks. łączna premia z Boomem musi być przycięta do +45% / x1.45 (jest ${boomCapped.finalPayout})`
  );

  // D) Sprzedaż zdalna (poza Wyspą-Rynkiem) przy Stage 5 + aktywnym Boomie + 7 towarach Różnorodności = SZTYWNE 0.85x (< NPC!)
  const boomTag = server.persistentData.getCompound('halucynacje_market_boom');
  boomTag.putString('itemId', 'mekanism:pellet_polonium');
  boomTag.putInt('basePrice', poloniumWholesale);
  boomTag.putInt('boostedPrice', poloniumBoosted);
  boomTag.putInt('bonusPercent', 30);
  boomTag.putInt('packSize', 1);
  boomTag.putLong('expiresAtMs', Date.now() + 600_000);
  server.persistentData.put('halucynacje_market_boom', boomTag);

  const remoteInv = [];
  const remotePlayer = {
    username: 'RemoteBoomTester',
    x: 0,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    mainHandItem: sandbox.Item.of('mekanism:pellet_polonium', 1),
    inventory: { getContainerSize: () => remoteInv.length, getItem: (idx) => remoteInv[idx] },
    give: (st) => remoteInv.push(st),
    tell: () => {}
  };
  assert(sellHand(remotePlayer, server) === 1, 'Zdalna sprzedaż polonium udana');
  const coinVals = {
    'lightmanscurrency:coin_netherite': 100000,
    'lightmanscurrency:coin_diamond': 10000,
    'lightmanscurrency:coin_emerald': 1000,
    'lightmanscurrency:coin_gold': 100,
    'lightmanscurrency:coin_iron': 10,
    'lightmanscurrency:coin_copper': 1
  };
  const received = remoteInv.reduce((acc, st) => acc + (coinVals[st.id] || 0) * st.count, 0);
  const expectedRemotePolonium = Math.round(poloniumWholesale * 0.85);
  assert(
    received === expectedRemotePolonium,
    `Zdalna sprzedaż z aktywnym Boomem i Stage 5 daje sztywne 85% = ${expectedRemotePolonium} (jest ${received})`
  );

  // E) Dla KAŻDEGO towaru bez limitu godzinowego: zdalna sprzedaż < cena NPC; dla towarów z limitem: npc_shoppers === 0 i zero premii!
  for (const tierObj of Object.values(prices.sell_tiers)) {
    for (const item of tierObj.items) {
      const boomForItem = { itemId: item.id, basePrice: item.wholesale_gui, boostedPrice: Math.round(item.wholesale_gui * 1.3), bonusPercent: 30 };
      const remoteRes = applyDyn(server, item.wholesale_gui, item.id, divReal, boomForItem, {
        onMarket: false,
        isExportDock: false
      });
      if (item.hourly_cap_coins > 0) {
        assert(item.npc_shoppers === 0, `Pozycja z limitem ${item.id} musi mieć npc_shoppers === 0`);
        assert(
          remoteRes.finalPayout === Math.round(item.wholesale_gui * 0.85) && remoteRes.totalBonusPercent === 0,
          `Dla ${item.id}: zdalna sprzedaż = dokładnie 0.85x bez premii (${remoteRes.finalPayout})`
        );
      } else {
        assert(
          remoteRes.finalPayout < item.npc_shoppers,
          `Dla ${item.id}: zdalna (${remoteRes.finalPayout}) musi być < NPC (${item.npc_shoppers})`
        );
      }
    }
  }
});

// 17. RFC #83 Część B (pkt 1 & 2): sell_stage w /sprzedaj, /sprzedaj all, Doku Eksportowym, Boomie Rynkowym i /cennik
test('shared_economy.js + economy_market.js (#83 cz. B pkt 1-2): blokada sell_stage (/sprzedaj, all, Dok, Boom, /cennik)', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math,
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const resolveSellStage = vm.runInContext('resolveItemSellStage', ctx);
  assert(resolveSellStage({ sell_stage: 3 }, { sell_stage: 1 }, 1) === 3, 'resolveItemSellStage preferuje item.sell_stage');
  assert(resolveSellStage({}, { sell_stage: 2 }, 1) === 2, 'resolveItemSellStage używa tier.sell_stage jako 2. fallback');
  assert(resolveSellStage({}, {}, 4) === 3, 'resolveItemSellStage domyślnie zwraca tier - 1');

  const handleSellHand = vm.runInContext('handleSellHand', ctx);
  const handleSellAll = vm.runInContext('handleSellAll', ctx);
  const handleShowPrices = vm.runInContext('handleShowPrices', ctx);
  const handleAddExportDock = vm.runInContext('handleAddExportDock', ctx);
  const processExportDocksTick = vm.runInContext('processExportDocksTick', ctx);
  const rollMarketBoom = vm.runInContext('rollMarketBoom', ctx);
  const getOrRollMarketBoom = vm.runInContext('getOrRollMarketBoom', ctx);
  const getMarketCatalog = vm.runInContext('getMarketCatalog', ctx);
  const cat = getMarketCatalog(true);

  const dockSlots = [
    sandbox.Item.of('minecraft:bread', 5), // Tier 1 (sell_stage 0)
    sandbox.Item.of('create:blaze_cake', 4), // Tier 3 (sell_stage 2)
    sandbox.Item.of('minecraft:cobblestone', 32) // Tier 0
  ];
  const dockBlock = {
    x: 152,
    y: 65,
    z: 0,
    id: 'create:item_vault',
    inventory: {
      getContainerSize: () => dockSlots.length,
      getItem: (idx) => dockSlots[idx],
      setChanged: () => {}
    }
  };
  const server = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {},
    overworld: () =>
      makeStrictOverworldMock({
        getBlock: (x, y, z) => (x === 152 && y === 65 && z === 0 ? dockBlock : null)
      })
  };
  // Etap 1 odblokowany
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  gs.putBoolean('stage_1', true);

  const msgs = [];
  const inv = [
    sandbox.Item.of('minecraft:bread', 2), // Tier 1 (sell_stage 0)
    sandbox.Item.of('farmersdelight:hamburger', 2), // Tier 2 (sell_stage 1)
    sandbox.Item.of('create:blaze_cake', 3), // Tier 3 (sell_stage 2 -> zablokowane!)
    sandbox.Item.of('minecraft:netherrack', 16) // Tier 0
  ];
  const player = {
    username: 'StageOneSeller',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('create:blaze_cake', 5),
    inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
    give: (st) => inv.push(st),
    tell: (t) => msgs.push(t.s),
    rayTrace: () => ({ block: dockBlock })
  };

  // A) /sprzedaj na Etapie 1 odmawia sprzedaży create:blaze_cake (Tier 3, sell_stage 2)
  assert(handleSellHand(player, server) === 0, '/sprzedaj blaze_cake odrzucone na Etapie 1');
  assert(player.mainHandItem.count === 5, 'Stos blaze_cake w ręce pozostał nietknięty');
  assert(
    msgs.some((m) => m.includes('Sprzedaż odblokujesz na Etapie 2')),
    'Komunikat odmowy /sprzedaj zawiera "Sprzedaż odblokujesz na Etapie 2"'
  );

  // B) /sprzedaj all na Etapie 1 sprzedaje bread + hamburger, a blaze_cake i cobble zostawia nietknięte
  const soldAll = handleSellAll(player, server);
  assert(soldAll === 4, '/sprzedaj all sprzedało dokładnie 2 bread + 2 hamburger = 4 szt.');
  assert(inv[0].count === 0 && inv[1].count === 0, 'Odblokowane towary sprzedane');
  assert(inv[2].count === 3, 'Zablokowane create:blaze_cake pozostały nietknięte w ekwipunku');
  assert(inv[3].count === 16, 'Surowiec Tier 0 pozostał nietknięty w ekwipunku');

  // C) Dok Eksportowy na Etapie 1: sprzedaje bread, zostawia blaze_cake i cobble nietknięte
  assert(handleAddExportDock(player, server) === 1, 'Dok zarejestrowany');
  const dockTickS1 = processExportDocksTick(server, Date.now());
  assert(dockTickS1.itemsSold === 5, 'Dok na Etapie 1 sprzedał wyłącznie 5x bread');
  assert(dockSlots[0].count === 0, 'bread opróżnione z doku');
  assert(dockSlots[1].count === 4, 'create:blaze_cake pozostało nietknięte w Doku na Etapie 1');
  assert(dockSlots[2].count === 32, 'cobblestone pozostało nietknięte w Doku');

  // D) /cennik 3 na Etapie 1 pokazuje kłódkę i Etap 2
  msgs.length = 0;
  handleShowPrices(player, 3, server);
  assert(
    msgs.some((m) => m.includes('🔒') && m.includes('Etap 2') && m.includes('create:blaze_cake')),
    '/cennik 3 na Etapie 1 pokazuje kłódkę i Etap 2 dla create:blaze_cake'
  );

  // E) Boom Rynkowy losuje WYŁĄCZNIE spośród odblokowanych towarów (sell_stage <= teamStage)
  const boomTag = server.persistentData.getCompound('halucynacje_market_boom');
  boomTag.putString('itemId', 'create:blaze_cake');
  boomTag.putInt('basePrice', 21);
  boomTag.putInt('boostedPrice', 27);
  boomTag.putInt('bonusPercent', 30);
  boomTag.putInt('packSize', 1);
  boomTag.putLong('expiresAtMs', Date.now() + 600_000);
  server.persistentData.put('halucynacje_market_boom', boomTag);
  const rerolledBoom = getOrRollMarketBoom(server, Date.now());
  assert(
    rerolledBoom && cat.sellById[rerolledBoom.itemId].sellStage <= 1,
    'Zapisany zablokowany Boom zostaje natychmiast przelosowany na odblokowany towar'
  );

  for (let st = 0; st <= 5; st++) {
    const testSrv = { persistentData: makeCompound(), tell: () => {} };
    const tgs = testSrv.persistentData.getCompound('halucynacje_global_stages');
    for (let k = 1; k <= st; k++) tgs.putBoolean('stage_' + k, true);
    for (let roll = 0; roll < 50; roll++) {
      const b = rollMarketBoom(testSrv, null, Date.now());
      const def = cat.sellById[b.itemId];
      assert(def && def.sellStage <= st, `Boom na Etapie ${st} wylosował zablokowany towar ${b.itemId} (sell_stage=${def?.sellStage})`);
    }
  }

  // F) Po odblokowaniu Etapu 2: /sprzedaj, Dok i /cennik 3 akceptują create:blaze_cake!
  gs.putBoolean('stage_2', true);
  assert(handleSellHand(player, server) === 1, '/sprzedaj blaze_cake przyjęte na Etapie 2');
  assert(player.mainHandItem.count === 0, 'Stos blaze_cake w ręce sprzedany na Etapie 2');
  const dockTickS2 = processExportDocksTick(server, Date.now());
  assert(dockTickS2.itemsSold === 4 && dockSlots[1].count === 0, 'Dok na Etapie 2 wyeksportował 4x blaze_cake');
  msgs.length = 0;
  handleShowPrices(player, 3, server);
  assert(!msgs.some((m) => m.includes('🔒')), '/cennik 3 na Etapie 2 nie pokazuje kłódki');
});

// 18. RFC #83 Część B (pkt 3): NPC Shoppers (0L dla sell_stage > teamStage, Etap w hashu, auto re-sync po grantStage)
test('economy_anti_exploit.js + dimension_gating.js (#83 cz. B pkt 3): Shoppers 0L przed Etapem, Etap w hashu i auto re-sync', () => {
  let setCalls = 0;
  const customPrices = new Map();
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls === 'com.velesbh.shoppers.economy.ShoppersWorldData') {
          return {
            get: () => ({
              setCustomPrice: (id, worth) => {
                setCalls++;
                customPrices.set(String(id), Number(worth));
              }
            })
          };
        }
        return null;
      }
    },
    ServerEvents: { recipes: () => {}, loaded: () => {}, commandRegistry: () => {} },
    PlayerEvents: { loggedIn: () => {} },
    ItemEvents: { rightClicked: () => {} },
    NativeEvents: { onEvent: () => {} },
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_anti_exploit.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/dimension_gating.js', 'utf8'), ctx);

  const syncShoppers = vm.runInContext('syncShoppersIfPricesChanged', ctx);
  const grantStage = vm.runInContext('grantStage', ctx);

  const server = {
    persistentData: makeCompound(),
    players: [],
    overworld: () => ({ __isOverworld: true }),
    runCommandSilent: () => {}
  };
  const player = { username: 'ShoppersTester', persistentData: makeCompound(), tell: () => {} };
  server.players.push(player);

  // Etap 1: bread i hamburger aktywne, blaze_cake (sell_stage=2) = 0L
  server.persistentData.getCompound('halucynacje_global_stages').putBoolean('stage_1', true);
  const res1 = syncShoppers(server);
  assert(!res1.skipped && res1.hash.endsWith('@s1'), 'Hash synchronizacji Shoppers zawiera @s1');
  assert(customPrices.get('minecraft:bread') > 0, 'Etap 1: bread aktywny u NPC');
  assert(customPrices.get('farmersdelight:hamburger') > 0, 'Etap 1: hamburger aktywny u NPC');
  assert(customPrices.get('create:blaze_cake') === 0, 'Etap 1: blaze_cake = 0L u NPC (sell_stage=2)');

  // Bez zmiany Etapu i prices.json -> pominięcie synchronizacji
  setCalls = 0;
  const resSkip = syncShoppers(server);
  assert(resSkip.skipped === true && setCalls === 0, 'Ten sam Etap i hash pomija synchronizację');

  // Odblokowanie Etapu 2 przez grantStage -> automatyczny re-sync Shoppers!
  grantStage(player, server, 'stage_2');
  assert(setCalls > 100, 'grantStage(stage_2) automatycznie wywołał re-sync Shoppers');
  const savedHash = server.persistentData.getString('halucynacje_shoppers_prices_hash');
  assert(savedHash.endsWith('@s2'), 'Zapisany hash zaktualizowany do @s2');
  const blazeNpc = prices.sell_tiers.tier_3_luxury_bakery.items.find((x) => x.id === 'create:blaze_cake').npc_shoppers;
  assert(customPrices.get('create:blaze_cake') === blazeNpc, `Etap 2: blaze_cake odblokowane u NPC (${blazeNpc})`);
  assert(customPrices.get('ae2:cell_component_64k') === 0, 'Etap 2: Tier 5 nadal 0L u NPC');
});

// 19. RFC #83 Część B (pkt 4): /kup paczki count (dzielenie na stacki maxStackSize) i /sklep kategorie + rozmiar paczki
test('economy_market.js (#83 cz. B pkt 4): /kup shaft (16 za 105), /kup deployer (gating S2), podział stacków i etykiety /sklep', () => {
  const customMaxStacks = { 'minecraft:ender_pearl': 16, 'minecraft:lava_bucket': 1 };
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: {
      of: (id, count = 1) => ({
        id,
        count,
        maxStackSize: customMaxStacks[id] || 64,
        getMaxStackSize() {
          return this.maxStackSize;
        },
        isEmpty() {
          return this.count <= 0;
        },
        shrink(n) {
          this.count -= n;
        }
      })
    },
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math,
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const handleBuy = vm.runInContext('handleBuy', ctx);
  const handleShowShop = vm.runInContext('handleShowShop', ctx);
  const getBuyCategoryLabel = vm.runInContext('getBuyCategoryLabel', ctx);
  const giveItemStacksToPlayer = vm.runInContext('giveItemStacksToPlayer', ctx);
  const getInventoryCoinBalance = vm.runInContext('getInventoryCoinBalance', ctx);

  assert(getBuyCategoryLabel('machines') === 'Maszyny', 'Etykieta machines -> Maszyny');
  assert(getBuyCategoryLabel('materials') === 'Surowce', 'Etykieta materials -> Surowce');
  assert(getBuyCategoryLabel('decor') === 'Dekoracje', 'Etykieta decor -> Dekoracje');
  assert(getBuyCategoryLabel('tools') === 'Narzędzia', 'Etykieta tools -> Narzędzia');

  const server = { persistentData: makeCompound(), runCommandSilent: () => {} };
  const inv = [sandbox.Item.of('lightmanscurrency:coin_diamond', 1)]; // 10 000 monet
  const msgs = [];
  const player = {
    username: 'PackBuyer',
    persistentData: makeCompound(),
    inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
    give: (st) => inv.push(st),
    tell: (t) => msgs.push(t.s)
  };

  // A) /kup shaft na Etapie 0 -> 16 szt. create:shaft za dokładnie 105 monet
  assert(handleBuy(player, server, 'shaft', 1) === 1, '/kup shaft 1 udany na Etapie 0');
  const shaftCount1 = inv.filter((s) => s.id === 'create:shaft').reduce((a, s) => a + s.count, 0);
  assert(shaftCount1 === 16, '/kup shaft wydał dokładnie 16 wałów');
  assert(getInventoryCoinBalance(player) === 10000 - 105, '/kup shaft pobrał dokładnie 105 monet');

  // B) /kup shaft 5 -> 80 szt. podzielone na stacki <= 64 (64 + 16)
  const beforeLen = inv.length;
  assert(handleBuy(player, server, 'shaft', 5) === 5, '/kup shaft 5 udany');
  const newShaftStacks = inv.slice(beforeLen).filter((s) => s.id === 'create:shaft');
  assert(
    newShaftStacks.length === 2 && newShaftStacks[0].count === 64 && newShaftStacks[1].count === 16,
    '80 wałów rozbite na stacki [64, 16]'
  );
  assert(getInventoryCoinBalance(player) === 10000 - 105 - 525, 'Pobrano dokładnie 525 monet za 5 paczek shaft');

  // C) Podział wg maxStackSize = 16 (np. ender_pearl: 40 -> 16 + 16 + 8)
  const pearlStacks = [];
  giveItemStacksToPlayer({ give: (st) => pearlStacks.push(st) }, 'minecraft:ender_pearl', 40);
  assert(
    pearlStacks.length === 3 &&
      pearlStacks[0].count === 16 &&
      pearlStacks[1].count === 16 &&
      pearlStacks[2].count === 8,
    'Item z maxStackSize=16 rozbity na [16, 16, 8]'
  );

  // D) /kup deployer: odmowa na Etapie 1, sprzedaż za 3 400 na Etapie 2
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  gs.putBoolean('stage_1', true);
  const balBeforeDeployer = getInventoryCoinBalance(player);
  assert(handleBuy(player, server, 'deployer', 1) === 0, '/kup deployer odrzucone na Etapie 1');
  assert(getInventoryCoinBalance(player) === balBeforeDeployer, 'Brak pobrania monet przy odmowie deployer na S1');

  gs.putBoolean('stage_2', true);
  assert(handleBuy(player, server, 'deployer', 1) === 1, '/kup deployer przyjęte na Etapie 2');
  assert(inv.some((s) => s.id === 'create:deployer' && s.count === 1), 'Wydano 1x create:deployer');
  assert(getInventoryCoinBalance(player) === balBeforeDeployer - 3400, '/kup deployer pobrał dokładnie 3 400 monet');

  // E) /sklep lista 0 pokazuje rozmiar paczki ("16 szt.") oraz kategorię "Maszyny"
  msgs.length = 0;
  handleShowShop(player, server, 0);
  assert(
    msgs.some((m) => m.includes('/kup shaft') && m.includes('16 szt.') && m.includes('Maszyny')),
    '/sklep pokazuje paczkę "16 szt." i etykietę kategorii "Maszyny" dla shaft'
  );
});

// 20. RFC #83 Część B (pkt 5): Gating Terminala Lightman's Currency (PreTradeEvent SALE/PURCHASE + PostTradeEvent team_limit)
test('economy_market.js (#83 cz. B pkt 5): gating Terminala LC (SALE stage+team_limit, PURCHASE sell_stage, PostTradeEvent)', () => {
  const nativeHandlers = {};
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    NativeEvents: {
      onEvent: (cls, cb) => {
        nativeHandlers[cls] = cb;
      }
    },
    Date,
    Math,
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const preCb = nativeHandlers['io.github.lightman314.lightmanscurrency.api.events.TradeEvent$PreTradeEvent'];
  const postCb = nativeHandlers['io.github.lightman314.lightmanscurrency.api.events.TradeEvent$PostTradeEvent'];
  assert(typeof preCb === 'function', 'Zarejestrowano TradeEvent$PreTradeEvent');
  assert(typeof postCb === 'function', 'Zarejestrowano TradeEvent$PostTradeEvent');

  const handleBuy = vm.runInContext('handleBuy', ctx);
  const getTeamBuyCount = vm.runInContext('getTeamBuyCount', ctx);

  const server = { persistentData: makeCompound(), runCommandSilent: () => {} };
  const gs = server.persistentData.getCompound('halucynacje_global_stages');
  gs.putBoolean('stage_1', true);

  const inv = [sandbox.Item.of('lightmanscurrency:coin_netherite', 5)];
  const playerMsgs = [];
  const player = {
    username: 'TerminalUser',
    persistentData: makeCompound(),
    server,
    level: { isClientSide: () => false, server },
    inventory: { getContainerSize: () => inv.length, getItem: (idx) => inv[idx] },
    give: (st) => inv.push(st),
    tell: (t) => playerMsgs.push(t.s)
  };

  const makeTradeEvent = (persistentId, direction, itemId, isPersistent = true) => {
    const denials = [];
    let canceled = false;
    return {
      denials,
      isCanceled: () => canceled,
      getTrader: () => ({
        isClient: () => false,
        isPersistent: () => isPersistent,
        getPersistentID: () => persistentId
      }),
      getTrade: () => ({
        isSale: () => direction === 'SALE',
        isPurchase: () => direction === 'PURCHASE',
        getSellItem: (slot) => (slot === 0 ? sandbox.Item.of(itemId, 1) : sandbox.Item.of('minecraft:air', 0))
      }),
      getContext: () => ({
        isStorageMode: false,
        hasPlayer: () => true,
        getPlayer: () => player
      }),
      addDenial: (comp) => {
        denials.push(comp.s);
        canceled = true;
      },
      setCanceled: (v) => {
        canceled = Boolean(v);
      }
    };
  };

  // A) PURCHASE na halucynacje_skup_03_cukiernia (create:blaze_cake, sell_stage=2) na Etapie 1 -> ODMOWA
  const sellLockedEv = makeTradeEvent('halucynacje_skup_03_cukiernia', 'PURCHASE', 'create:blaze_cake');
  preCb(sellLockedEv);
  assert(sellLockedEv.isCanceled(), 'Terminal PURCHASE blaze_cake na Etapie 1 musi być odrzucony');
  assert(
    sellLockedEv.denials.some((d) => d.includes('Sprzedaż odblokujesz na Etapie 2')),
    'Terminal PURCHASE zwraca komunikat "Sprzedaż odblokujesz na Etapie 2"'
  );

  // B) SALE na halucynacje_kup_01_etapy dla stage_3_token (required_stage = 2) na Etapie 1 -> ODMOWA
  const tokenLockedEv = makeTradeEvent('halucynacje_kup_01_etapy', 'SALE', 'kubejs:stage_3_token');
  preCb(tokenLockedEv);
  assert(tokenLockedEv.isCanceled(), 'Terminal SALE stage_3_token na Etapie 1 musi być odrzucony (required_stage=2)');
  assert(
    tokenLockedEv.denials.some((d) => d.includes('Etapu 2')),
    'Komunikat odmowy Żetonu Etapu wskazuje wymagany Etap 2'
  );

  // C) Po odblokowaniu Etapu 2: blaze_cake PURCHASE i stage_3_token SALE przechodzą!
  gs.putBoolean('stage_2', true);
  const sellOkEv = makeTradeEvent('halucynacje_skup_03_cukiernia', 'PURCHASE', 'create:blaze_cake');
  preCb(sellOkEv);
  assert(!sellOkEv.isCanceled(), 'Terminal PURCHASE blaze_cake na Etapie 2 musi przejść');
  const tokenOkEv = makeTradeEvent('halucynacje_kup_01_etapy', 'SALE', 'kubejs:stage_3_token');
  preCb(tokenOkEv);
  assert(!tokenOkEv.isCanceled(), 'Terminal SALE stage_3_token na Etapie 2 musi przejść');

  // D) SALE end_portal_frame na Etapie 3 -> ODMOWA; na Etapie 4 -> 12x OK, 13. zakup ODMOWA!
  gs.putBoolean('stage_3', true);
  const frameS3 = makeTradeEvent('halucynacje_kup_05_tech', 'SALE', 'minecraft:end_portal_frame');
  preCb(frameS3);
  assert(frameS3.isCanceled(), 'Terminal SALE end_portal_frame na Etapie 3 musi być odrzucony');
  assert(
    frameS3.denials.some((d) => d.includes('Etapu 4')),
    'Odmowa end_portal_frame ma taki sam komunikat Etapu 4 jak /kup'
  );

  gs.putBoolean('stage_4', true);
  for (let k = 1; k <= 12; k++) {
    const ev = makeTradeEvent('halucynacje_kup_05_tech', 'SALE', 'minecraft:end_portal_frame');
    preCb(ev);
    assert(!ev.isCanceled(), `Zakup #${k} end_portal_frame w Terminalu na Etapie 4 musi przejść`);
    postCb(ev);
  }
  assert(getTeamBuyCount(server, 'minecraft:end_portal_frame') === 12, 'PostTradeEvent zliczył 12 zakupów do wspólnego licznika');

  const frame13 = makeTradeEvent('halucynacje_kup_05_tech', 'SALE', 'minecraft:end_portal_frame');
  preCb(frame13);
  assert(frame13.isCanceled(), '13. zakup end_portal_frame w Terminalu musi zostać odrzucony');
  assert(
    frame13.denials.some((d) => d.includes('Limit drużynowy') && d.includes('12')),
    'Odmowa 13. zakupu ma komunikat limitu drużynowego identyczny z /kup'
  );
  // Wspólny licznik z /kup: 13. sztuka przez /kup też odrzucona!
  assert(handleBuy(player, server, 'end_portal_frame', 1) === 0, 'Wspólny licznik blokuje 13. sztukę również w /kup');

  // E) Sklep gracza (nie-persistent) NIE jest blokowany
  const playerShopEv = makeTradeEvent('', 'SALE', 'minecraft:end_portal_frame', false);
  preCb(playerShopEv);
  assert(!playerShopEv.isCanceled(), 'Sklepy graczy (non-persistent) nie są blokowane przez gating Terminala');
});

// 21. RFC #83 Część B (pkt 6): Kontrakty targetValue (800..28000, bez minPacks, brak 256k/64k na Etapach 4-5) + /ekonomia 750 000
test('economy_contracts.js + economy_market.js (#83 cz. B pkt 6): targetValue kontraktów, brak 256k/64k na S4-5 i napis 750 000', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    ServerEvents: { commandRegistry: () => {}, tick: () => {} },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math,
    assert
  };
  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8'), ctx);

  const profile = vm.runInContext('STAGE_CONTRACT_PROFILE', ctx);
  const rollNewContract = vm.runInContext('rollNewContract', ctx);
  const loadContractPoolForStage = vm.runInContext('loadContractPoolForStage', ctx);
  const handleShowEconomyStatus = vm.runInContext('handleShowEconomyStatus', ctx);

  const expectedTargets = [800, 2300, 5500, 12500, 28000, 28000];
  for (let s = 0; s <= 5; s++) {
    assert(profile[s].targetValue === expectedTargets[s], `Stage ${s} targetValue === ${expectedTargets[s]}`);
    assert(profile[s].minPacks === undefined, `Stage ${s} nie ma już pola minPacks`);
  }

  // Pula Etapu 4 i 5 nie może zawierać ae2:cell_component_64k ani ae2:cell_component_256k
  for (const st of [4, 5]) {
    const { pool } = loadContractPoolForStage(st);
    assert(pool.length >= 3, `Pula kontraktów na Etapie ${st} jest niepusta (${pool.length})`);
    assert(!pool.some((x) => x.id === 'ae2:cell_component_256k'), `Etap ${st}: 256k wykluczone z puli`);
    assert(!pool.some((x) => x.id === 'ae2:cell_component_64k'), `Etap ${st}: 64k wykluczone z puli`);

    const srv = { persistentData: makeCompound() };
    const gs = srv.persistentData.getCompound('halucynacje_global_stages');
    for (let k = 1; k <= st; k++) gs.putBoolean('stage_' + k, true);

    for (let r = 0; r < 250; r++) {
      const c = rollNewContract(srv, null);
      assert(c && c.itemId !== 'ae2:cell_component_256k' && c.itemId !== 'ae2:cell_component_64k', `Etap ${st} nigdy nie losuje 64k/256k`);
      assert(c.packs >= 1 && c.packs <= profile[st].maxPacks, `Etap ${st}: packs=${c.packs} w [1..${profile[st].maxPacks}]`);
      const poolItem = pool.find((x) => x.id === c.itemId);
      assert(poolItem && poolItem.sellStage <= st && poolItem.wholesale <= profile[st].targetValue, 'Wylosowany towar spełnia sell_stage <= stage i wholesale <= targetValue');
      const minExpected = Math.max(1, Math.min(profile[st].maxPacks, Math.round((profile[st].targetValue * 0.75) / poolItem.wholesale)));
      const maxExpected = Math.max(1, Math.min(profile[st].maxPacks, Math.round((profile[st].targetValue * 1.25) / poolItem.wholesale)));
      assert(
        c.packs >= minExpected && c.packs <= maxExpected,
        `Etap ${st} ${c.itemId}: packs=${c.packs} w [${minExpected}..${maxExpected}]`
      );
      if (st === 5 && c.itemId === 'create_confectionery:bar_of_ruby_chocolate') {
        assert(c.packs >= 8 && c.packs <= 13, `Ruby Chocolate na Etapie 5 daje 8..13 sztabek (jest ${c.packs})`);
      }
    }
  }

  // /ekonomia na Etapie 5 pokazuje 750 000 monet
  const srv5 = { persistentData: makeCompound(), tell: () => {} };
  for (let k = 1; k <= 5; k++) srv5.persistentData.getCompound('halucynacje_global_stages').putBoolean('stage_' + k, true);
  const ecoMsgs = [];
  const p5 = {
    username: 'TycoonS5',
    persistentData: makeCompound(),
    inventory: { getContainerSize: () => 0, getItem: () => null },
    tell: (t) => ecoMsgs.push(t.s)
  };
  handleShowEconomyStatus(p5, srv5);
  assert(
    ecoMsgs.some((m) => m.includes('750 000 monet')),
    '/ekonomia na Etapie 5 pokazuje nagrodę Wielkiego Finału 750 000 monet'
  );
});

// 23. Issue #89: Doki Eksportowe — API 1.21.1 (hasChunk / BlockPos), logowanie błędów raz na dok i automatyczny forceload
test('economy_market.js (#89): ścisła atrapa Overworld, wypłata w załadowanym chunku, logowanie błędów i forceload add/remove', () => {
  const warnings = [];
  const ranCmds = [];
  const loadedHandlers = [];

  const sandbox = {
    console: {
      info: () => {},
      warn: (m) => warnings.push(String(m)),
      error: () => {}
    },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls === 'net.minecraft.core.BlockPos') return MockBlockPos;
        return null;
      }
    },
    ServerEvents: {
      commandRegistry: () => {},
      tick: () => {},
      loaded: (fn) => loadedHandlers.push(fn)
    },
    NativeEvents: { onEvent: () => {} },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);

  const addDock = vm.runInContext('handleAddExportDock', ctx);
  const removeDock = vm.runInContext('handleRemoveExportDock', ctx);
  const processDocks = vm.runInContext('processExportDocksTick', ctx);
  const syncForceload = vm.runInContext('syncExportDocksForceload', ctx);

  // A) Self-test ścisłej atrapy: wywołanie isLoaded z 3 liczbami MUSI rzucić błąd (regresja MC 1.21.1)
  const strictOwCheck = makeStrictOverworldMock({ getBlock: () => null });
  let threw3Args = false;
  try {
    strictOwCheck.isLoaded(152, 65, 0);
  } catch (err) {
    threw3Args = true;
  }
  assert(threw3Args, 'Atrapa Overworld rzuca błąd dla isLoaded(x, y, z) z trzema liczbami');

  // B) Przygotowanie bloków na Wyspie-Rynku:
  //    - (150, 65, 2) -> chunk (9, 0)
  //    - (152, 65, 2) -> ten sam chunk (9, 0)
  //    - (168, 65, 2) -> osobny chunk (10, 0)
  const breadPrice = prices.sell_tiers.tier_1_start.items.find((x) => x.id === 'minecraft:bread').wholesale_gui;
  const dock1Slots = [sandbox.Item.of('minecraft:bread', 16)];
  const dock2Slots = [sandbox.Item.of('minecraft:bread', 4)];
  const dock3Slots = [sandbox.Item.of('minecraft:bread', 8)];

  const makeBlock = (x, y, z, slots) => ({
    x,
    y,
    z,
    id: 'minecraft:chest',
    inventory: {
      getContainerSize: () => slots.length,
      getItem: (idx) => slots[idx],
      setChanged: () => {}
    }
  });
  const block1 = makeBlock(150, 65, 2, dock1Slots);
  const block2 = makeBlock(152, 65, 2, dock2Slots);
  const block3 = makeBlock(168, 65, 2, dock3Slots);
  const blocksByKey = new Map([
    ['150,65,2', block1],
    ['152,65,2', block2],
    ['168,65,2', block3]
  ]);

  const loadedChunks = new Set();
  let throwOnBlock1 = false;
  let exposeHasChunk = true;

  const server = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: (cmd) => ranCmds.push(String(cmd)),
    overworld: () =>
      makeStrictOverworldMock({
        loadedChunks,
        exposeHasChunk,
        getBlock: (x, y, z) => {
          if (throwOnBlock1 && x === 150 && y === 65 && z === 2) {
            throw new Error('Symulowany błąd kontenera');
          }
          return blocksByKey.get(`${x},${y},${z}`) || null;
        }
      })
  };

  // Deterministyczny Boom na inny przedmiot (cookie)
  const boomTag = server.persistentData.getCompound('halucynacje_market_boom');
  boomTag.putString('itemId', 'minecraft:cookie');
  boomTag.putInt('basePrice', 6);
  boomTag.putInt('boostedPrice', 8);
  boomTag.putInt('packSize', 1);
  boomTag.putLong('expiresAtMs', Date.now() + 600_000);
  server.persistentData.put('halucynacje_market_boom', boomTag);

  const playerMsgs = [];
  let aimedBlock = block1;
  const player = {
    username: 'DockTester',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld' },
    tell: (t) => playerMsgs.push(t.s),
    rayTrace: () => ({ block: aimedBlock })
  };

  // C) `/rynek_eksport dodaj` woła `forceload add` i informuje gracza o trzymaniu chunku w pamięci
  assert(addDock(player, server) === 1, 'Dodano dok #1 (150, 65, 2)');
  assert(
    ranCmds.some((c) => c === 'execute in minecraft:overworld run forceload add 150 2'),
    'dodaj wywołało forceload add 150 2 w Overworldzie'
  );
  assert(
    playerMsgs.some((m) => m.includes('trzymany w pamięci') && m.includes('forceload')),
    'Gracz otrzymał informację, że chunk doku jest trzymany w pamięci'
  );

  // D) Dok w niezaładowanym chunku (9, 0) jest pomijany bez wypłaty i bez ostrzeżeń
  const resUnloaded = processDocks(server, Date.now());
  assert(resUnloaded.itemsSold === 0 && resUnloaded.pendingAdded === 0, 'Niezaładowany chunk pominięty');
  assert(dock1Slots[0].count === 16, 'Chleb pozostał w skrzyni w niezaładowanym chunku');
  assert(warnings.length === 0, 'Brak ostrzeżeń dla niezaładowanego chunku');

  // E) Po załadowaniu chunku (9, 0) dok wypłaca przez `hasChunk(9, 0)` (bez `isLoaded(x, y, z)`)
  loadedChunks.add('9,0');
  const resLoaded = processDocks(server, Date.now());
  const expected16 = Math.round(breadPrice * 16 * 1.05);
  assert(resLoaded.itemsSold === 16, `Dok w załadowanym chunku sprzedał 16x bread (było ${resLoaded.itemsSold})`);
  assert(
    resLoaded.pendingAdded === expected16,
    `Wypłata doku za 16x bread wynosi ${expected16} monet (było ${resLoaded.pendingAdded})`
  );
  assert(dock1Slots[0].count === 0, 'Chleb został opróżniony ze skrzyni');
  assert(warnings.length === 0, 'Zero błędów podczas poprawnej wypłaty');

  // F) Ścieżka fallback `isLoaded(new BlockPos(x, y, z))` (gdy brak `hasChunk`) również działa
  exposeHasChunk = false;
  dock1Slots[0] = sandbox.Item.of('minecraft:bread', 4);
  const resBlockPos = processDocks(server, Date.now());
  assert(resBlockPos.itemsSold === 4, 'Ścieżka fallback isLoaded(BlockPos) sprzedała 4x bread');
  exposeHasChunk = true;

  // G) Dodanie 2. doku w tym samym chunku (9, 0) oraz 3. doku w chunku (10, 0)
  aimedBlock = block2;
  assert(addDock(player, server) === 1, 'Dodano dok #2 w tym samym chunku (9, 0)');
  aimedBlock = block3;
  assert(addDock(player, server) === 1, 'Dodano dok #3 w chunku (10, 0)');
  assert(
    ranCmds.some((c) => c === 'execute in minecraft:overworld run forceload add 168 2'),
    'dodaj dla doku #3 wywołało forceload add 168 2'
  );

  // H) Wyjątek w doku #1 jest logowany przez `console.warn` ze współrzędnymi RAZ do restartu,
  //    a pozostałe zdrowe doki (#2 w tym samym chunku) działają dalej bez przeszkód!
  throwOnBlock1 = true;
  const resWithErr1 = processDocks(server, Date.now());
  assert(resWithErr1.itemsSold === 4, 'Zdrowy dok #2 wypłacił 4x bread mimo błędu doku #1');
  assert(warnings.length === 1, `Błąd doku #1 zalogowany dokładnie raz (było ${warnings.length})`);
  assert(
    warnings[0].includes('(150, 65, 2)') && warnings[0].includes('Symulowany błąd kontenera'),
    'Ostrzeżenie zawiera współrzędne doku i treść błędu'
  );
  // Kolejne 2 cykle co 30 s — brak spamu w logach!
  processDocks(server, Date.now());
  processDocks(server, Date.now());
  assert(warnings.length === 1, 'Kolejne cykle błędnego doku nie spamują logu');
  throwOnBlock1 = false;

  // I) `syncExportDocksForceload` na starcie serwera deduplikuje chunki (3 doki w 2 chunkach -> 2 komendy)
  ranCmds.length = 0;
  const restored = syncForceload(server);
  assert(restored === 2 && ranCmds.length === 2, `syncExportDocksForceload przywrócił 2 unikalne chunki (było ${restored})`);
  assert(loadedHandlers.length >= 1, 'Zarejestrowano ServerEvents.loaded dla przywracania forceload');

  // J) `/rynek_eksport usun`: NIE zdejmuje forceload, gdy w tym chunku jest inny dok; zdejmuje dopiero po usunięciu ostatniego!
  ranCmds.length = 0;
  assert(removeDock(player, server, 1) === 1, 'Usunięto dok #1 (150, 65, 2)');
  assert(
    !ranCmds.some((c) => c.includes('forceload remove')),
    'NIE wywołano forceload remove, bo dok #2 nadal stoi w chunku (9, 0)'
  );

  assert(removeDock(player, server, 1) === 1, 'Usunięto dok #2 (152, 65, 2 — ostatni w chunku 9, 0)');
  assert(
    ranCmds.some((c) => c === 'execute in minecraft:overworld run forceload remove 152 2'),
    'Wywołano forceload remove 152 2 po usunięciu ostatniego doku z chunku (9, 0)'
  );

  ranCmds.length = 0;
  assert(removeDock(player, server, 1) === 1, 'Usunięto dok #3 (168, 65, 2 — jedyny w chunku 10, 0)');
  assert(
    ranCmds.some((c) => c === 'execute in minecraft:overworld run forceload remove 168 2'),
    'Wywołano forceload remove 168 2 dla chunku (10, 0)'
  );
});

// 24. Issue #94: Bruk z generatora od Etapu 0 (64 -> 32c Rynek / 27c zdalnie), limit 2 000 monet/h, reset po 60 min,
//     bramka Terminala Pre/PostTrade, pomijanie w Dokach, zero premii/Boomu/Różnorodności/Kontraktów i 0 w Shoppers!
test('shared_economy.js + economy_market.js + economy_contracts.js + economy_anti_exploit.js (#94): bruk 32c/64, limit 2 000/h, Terminal, Doki, Kontrakty i Shoppers=0', () => {
  const nativeHandlers = {};
  let tabSyncCalls = 0;
  const shoppersPrices = new Map();

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    JsonIO: { readString: () => JSON.stringify(prices), read: () => prices },
    Item: makeItemFactory(),
    Text: makeTextProxy(),
    Java: {
      loadClass: (cls) => {
        if (cls === 'com.velesbh.shoppers.economy.ShoppersWorldData') {
          return {
            get: () => ({
              setCustomPrice: (id, worth) => shoppersPrices.set(String(id), Number(worth))
            })
          };
        }
        return null;
      }
    },
    ServerEvents: { recipes: () => {}, loaded: () => {}, commandRegistry: () => {}, tick: () => {} },
    NativeEvents: {
      onEvent: (cls, cb) => {
        nativeHandlers[cls] = cb;
      }
    },
    syncPlayerTabBalance: () => {
      tabSyncCalls++;
    },
    Date,
    Math,
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SHARED_ECONOMY_SRC, ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_anti_exploit.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_market.js', 'utf8'), ctx);
  vm.runInContext(fs.readFileSync('kubejs/server_scripts/economy_contracts.js', 'utf8'), ctx);

  const handleSellHand = vm.runInContext('handleSellHand', ctx);
  const handleSellAll = vm.runInContext('handleSellAll', ctx);
  const handleShowPrices = vm.runInContext('handleShowPrices', ctx);
  const handleTerminalPreTrade = vm.runInContext('handleTerminalPreTrade', ctx);
  const handleTerminalPostTrade = vm.runInContext('handleTerminalPostTrade', ctx);
  const getHourlyCapStatus = vm.runInContext('getHourlyCapStatus', ctx);
  const readDiversityMap = vm.runInContext('readDiversityMap', ctx);
  const applyDynamicMarketBonuses = vm.runInContext('applyDynamicMarketBonuses', ctx);
  const getBoomEligibleItems = vm.runInContext('getBoomEligibleItems', ctx);
  const rollMarketBoom = vm.runInContext('rollMarketBoom', ctx);
  const getMarketCatalog = vm.runInContext('getMarketCatalog', ctx);
  const processExportDocksTick = vm.runInContext('processExportDocksTick', ctx);
  const writeExportDocks = vm.runInContext('writeExportDocks', ctx);
  const applyShoppersTier0ZeroWorth = vm.runInContext('applyShoppersTier0ZeroWorth', ctx);
  const loadContractPoolForStage = vm.runInContext('loadContractPoolForStage', ctx);
  const rollNewContract = vm.runInContext('rollNewContract', ctx);
  const sellSingleStack = vm.runInContext('sellSingleStack', ctx);

  const coinVals = {
    'lightmanscurrency:coin_netherite': 100000,
    'lightmanscurrency:coin_diamond': 10000,
    'lightmanscurrency:coin_emerald': 1000,
    'lightmanscurrency:coin_gold': 100,
    'lightmanscurrency:coin_iron': 10,
    'lightmanscurrency:coin_copper': 1
  };
  const sumCoins = (arr) => arr.reduce((a, st) => a + (coinVals[st.id] || 0) * st.count, 0);

  const t0 = 1_750_000_000_000;
  const cat = getMarketCatalog(true);
  assert(
    cat.sellById['minecraft:cobblestone'] &&
      cat.sellById['minecraft:cobblestone'].packSize === 64 &&
      cat.sellById['minecraft:cobblestone'].wholesale === 32 &&
      cat.sellById['minecraft:cobblestone'].npc === 0 &&
      cat.sellById['minecraft:cobblestone'].sellStage === 0 &&
      cat.sellById['minecraft:cobblestone'].hourlyCapCoins === 2000,
    'Katalog wczytał minecraft:cobblestone (x64, 32c, npc=0, sellStage=0, hourlyCapCoins=2000)'
  );

  // A) Na Wyspie-Rynku: 64 bruku = dokładnie 32 monety (nawet na Etapie 5 z Różnorodnością i fałszywym Boomem!),
  //    brak ujemnego npcBonusPotential, brak zapisu do okna Różnorodności, brak mylącej podpowiedzi Dok/NPC
  const serverA = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {}
  };
  // Odblokuj Stage 5 na serverA, żeby dowieść, że premia Etapu +10% NIE działa na bruk!
  const gsA = serverA.persistentData.getCompound('halucynacje_global_stages');
  for (let s = 1; s <= 5; s++) gsA.putBoolean('stage_' + s, true);

  const fakeBoomCobble = { itemId: 'minecraft:cobblestone', basePrice: 32, boostedPrice: 42, bonusPercent: 30 };
  const dynCobbleMarket = applyDynamicMarketBonuses(
    serverA,
    32,
    'minecraft:cobblestone',
    { uniqueCount: 7, bonusPercent: 15, multiplier: 1.15 },
    fakeBoomCobble,
    { onMarket: true, isExportDock: true }
  );
  assert(
    dynCobbleMarket.finalPayout === 32 && dynCobbleMarket.totalBonusPercent === 0 && dynCobbleMarket.isBoom === false,
    `Bruk na Rynku nie dostaje ŻADNYCH premii (jest ${dynCobbleMarket.finalPayout})`
  );

  const marketInv = [];
  const marketMsgs = [];
  const marketPlayer = {
    username: 'CobbleMiner',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld', isClientSide: () => false },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('minecraft:cobblestone', 64),
    inventory: { getContainerSize: () => marketInv.length, getItem: (idx) => marketInv[idx] },
    give: (st) => marketInv.push(st),
    tell: (t) => marketMsgs.push(t.s)
  };
  assert(handleSellHand(marketPlayer, serverA, t0) === 1, '/sprzedaj 64 bruku na Rynku udane');
  assert(sumCoins(marketInv) === 32, `64 bruku na Rynku daje dokładnie 32 monety (jest ${sumCoins(marketInv)})`);
  assert(marketPlayer.mainHandItem.count === 0, 'Stack 64 bruku został sprzedany');
  assert(
    marketMsgs.some((m) => m.includes('Bruk: 32 / 2 000 monet w tej godzinie')),
    'Komunikat po sprzedaży pokazuje stan limitu "Bruk: 32 / 2 000 monet w tej godzinie"'
  );
  assert(
    !marketMsgs.some((m) => m.includes('Dok Eksportowy') || m.includes('sklepy NPC')),
    'Komunikat sprzedaży bruku nie pokazuje mylącej podpowiedzi o Doku/NPC'
  );
  assert(
    !readDiversityMap(serverA, t0)['minecraft:cobblestone'],
    'Bruk nie trafia do okna Różnorodności'
  );

  // < 64 bruku -> too_few (0 monet, stack nietknięty)
  marketPlayer.mainHandItem = sandbox.Item.of('minecraft:cobblestone', 63);
  assert(handleSellHand(marketPlayer, serverA, t0 + 1000) === 0, '63 bruku za mało na pakiet 64');
  assert(marketPlayer.mainHandItem.count === 63, '63 bruku nietknięte');

  // npcBonusPotential >= 0 (nigdy ujemne -32!)
  const probeStack = sandbox.Item.of('minecraft:cobblestone', 64);
  const probeRes = sellSingleStack(probeStack, cat, 0, { onMarket: true });
  assert(probeRes.npcBonusPotential === 0, `npcBonusPotential dla bruku === 0 (było ${probeRes.npcBonusPotential})`);

  // B) Zdalnie (poza Wyspą-Rynkiem): 64 bruku = dokładnie 27 monet (0.85x), licznik rośnie o 27 (32 + 27 = 59)
  const remoteInv = [];
  const remoteMsgs = [];
  const remotePlayer = {
    username: 'RemoteMiner',
    x: 0,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld', isClientSide: () => false },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('minecraft:cobblestone', 64),
    inventory: { getContainerSize: () => remoteInv.length, getItem: (idx) => remoteInv[idx] },
    give: (st) => remoteInv.push(st),
    tell: (t) => remoteMsgs.push(t.s)
  };
  assert(handleSellHand(remotePlayer, serverA, t0 + 2000) === 1, 'Zdalne /sprzedaj 64 bruku udane');
  assert(sumCoins(remoteInv) === 27, `64 bruku zdalnie daje dokładnie 27 monet (jest ${sumCoins(remoteInv)})`);
  assert(
    getHourlyCapStatus(serverA, 'minecraft:cobblestone', 2000, t0 + 2000).spent === 59,
    'Wspólny licznik godzinowy wzrósł o 27 do 59 monet'
  );

  // C) Częściowa sprzedaż przy limicie 2 000 monet/h (70 stacków w ekwipunku -> 62 sprzedane = 1 984c, 8 zostaje!)
  const serverCap = { persistentData: makeCompound(), tell: () => {}, runCommandSilent: () => {} };
  const capInv = [];
  for (let s = 0; s < 70; s++) {
    capInv.push(sandbox.Item.of('minecraft:cobblestone', 64));
  }
  const capMsgs = [];
  const capPlayer = {
    username: 'BulkMiner',
    x: 152,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld', isClientSide: () => false },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('minecraft:cobblestone', 64),
    inventory: { getContainerSize: () => capInv.length, getItem: (idx) => capInv[idx] },
    give: (st) => capInv.push(st),
    tell: (t) => capMsgs.push(t.s)
  };
  const soldItemsCap = handleSellAll(capPlayer, serverCap, t0);
  assert(soldItemsCap === 62 * 64, `Sprzedano dokładnie 62 stacki = ${62 * 64} bruku (było ${soldItemsCap})`);
  assert(sumCoins(capInv) === 1984, `Wypłacono dokładnie 1 984 monet (było ${sumCoins(capInv)})`);
  const cobbleLeftInInv = capInv
    .filter((st) => st.id === 'minecraft:cobblestone')
    .reduce((acc, st) => acc + st.count, 0);
  assert(cobbleLeftInInv === 8 * 64, `Nadmiar 8 stacków (${8 * 64} szt.) pozostał w ekwipunku (było ${cobbleLeftInInv})`);
  assert(
    capMsgs.some((m) => m.includes('1 984 / 2 000') && m.includes('reset za')),
    'Komunikat po osiągnięciu limitu pokazuje 1 984 / 2 000 i reset za N min'
  );

  // Kolejne /sprzedaj (ręka) i /sprzedaj all przy wyczerpanym limicie -> odmowa z czasem do resetu, bruk nietknięty!
  capMsgs.length = 0;
  assert(handleSellHand(capPlayer, serverCap, t0 + 5 * 60_000) === 0, '/sprzedaj z ręki odrzucone po limicie');
  assert(capPlayer.mainHandItem.count === 64, 'Bruk w ręce pozostał nietknięty przy odmowie limitu');
  assert(
    capMsgs.some((m) => m.includes('1 984 / 2 000') && m.includes('reset za 55 min')),
    'Odmowa po 5 min podaje dokładny czas do resetu (55 min)'
  );

  capMsgs.length = 0;
  assert(handleSellAll(capPlayer, serverCap, t0 + 5 * 60_000) === 0, '/sprzedaj all odrzucone po limicie');
  const cobbleAfterRetry = capInv
    .filter((st) => st.id === 'minecraft:cobblestone')
    .reduce((acc, st) => acc + st.count, 0);
  assert(cobbleAfterRetry === 8 * 64, '8 stacków w ekwipunku nietknięte przy ponownym /sprzedaj all');

  // Test zdalnego limitu (75 stacków * 27c = 2 025c -> sprzedaje 74 = 1 998c, 1 stack zostaje!)
  const serverRemoteCap = { persistentData: makeCompound(), tell: () => {}, runCommandSilent: () => {} };
  const remCapInv = [];
  for (let s = 0; s < 75; s++) remCapInv.push(sandbox.Item.of('minecraft:cobblestone', 64));
  const remCapPlayer = {
    username: 'RemoteBulk',
    x: 0,
    y: 65,
    z: 0,
    level: { dimension: 'minecraft:overworld', isClientSide: () => false },
    persistentData: makeCompound(),
    inventory: { getContainerSize: () => remCapInv.length, getItem: (idx) => remCapInv[idx] },
    give: (st) => remCapInv.push(st),
    tell: () => {}
  };
  assert(handleSellAll(remCapPlayer, serverRemoteCap, t0) === 74 * 64, 'Zdalny limit sprzedaje 74 stacki (1 998c <= 2 000c)');
  assert(sumCoins(remCapInv) === 1998, 'Zdalna wypłata przy limicie = dokładnie 1 998 monet');
  assert(
    remCapInv.filter((st) => st.id === 'minecraft:cobblestone').reduce((a, st) => a + st.count, 0) === 64,
    '75. stack bruku pozostał nietknięty przy zdalnym limicie'
  );

  // D) Odnowienie limitu po 60 minutach (59 min -> nadal blokada; 60 min -> pełny reset!)
  assert(handleSellHand(capPlayer, serverCap, t0 + 59 * 60_000) === 0, 'Po 59 min limit nadal blokuje');
  assert(handleSellHand(capPlayer, serverCap, t0 + 60 * 60_000) === 1, 'Po dokładnie 60 min limit odnawia się i sprzedaż działa');
  assert(capPlayer.mainHandItem.count === 0, 'Po odnowieniu limitu stack 64 bruku został sprzedany');
  assert(
    getHourlyCapStatus(serverCap, 'minecraft:cobblestone', 2000, t0 + 60 * 60_000).spent === 32,
    'Nowe okno 60 min zaczęło się od 32 monet'
  );

  // E) Terminal Lightman's Currency ([SKUP] 1): PreTradeEvent i PostTradeEvent współdzielą licznik godzinowy
  const serverTerm = { persistentData: makeCompound(), tell: () => {}, runCommandSilent: () => {} };
  const termMsgs = [];
  const termPlayer = {
    username: 'TerminalMiner',
    x: 152,
    y: 65,
    z: 0,
    server: serverTerm,
    level: { dimension: 'minecraft:overworld', isClientSide: () => false, server: serverTerm },
    persistentData: makeCompound(),
    mainHandItem: sandbox.Item.of('minecraft:cobblestone', 64),
    inventory: { getContainerSize: () => 0, getItem: () => null },
    give: () => {},
    tell: (t) => termMsgs.push(t.s)
  };
  const makeCobbleTermEvent = () => {
    const denials = [];
    let canceled = false;
    return {
      denials,
      isCanceled: () => canceled,
      getTrader: () => ({
        isClient: () => false,
        isPersistent: () => true,
        getPersistentID: () => 'halucynacje_skup_01_start'
      }),
      getTrade: () => ({
        isSale: () => false,
        isPurchase: () => true,
        getSellItem: (slot) => (slot === 0 ? sandbox.Item.of('minecraft:cobblestone', 64) : sandbox.Item.of('minecraft:air', 0)),
        getCost: () => ({ getCoreValue: () => 32 })
      }),
      getContext: () => ({
        isStorageMode: false,
        hasPlayer: () => true,
        getPlayer: () => termPlayer
      }),
      addDenial: (comp) => {
        denials.push(comp.s);
        canceled = true;
      },
      setCanceled: (v) => {
        canceled = Boolean(v);
      }
    };
  };

  tabSyncCalls = 0;
  for (let k = 1; k <= 62; k++) {
    const ev = makeCobbleTermEvent();
    handleTerminalPreTrade(ev, t0);
    assert(!ev.isCanceled(), `Terminal PURCHASE bruku #${k} dozwolony w limicie`);
    assert(handleTerminalPostTrade(ev, t0) === true, `PostTradeEvent #${k} doliczył sprzedaż bruku`);
  }
  assert(tabSyncCalls === 62, `PostTradeEvent odświeżył TAB przy każdej sprzedaży w [SKUP] (${tabSyncCalls})`);
  assert(
    getHourlyCapStatus(serverTerm, 'minecraft:cobblestone', 2000, t0).spent === 1984,
    'Terminal PostTradeEvent zliczył 62 * 32 = 1 984 monet'
  );

  // 63. transakcja w terminalu -> odmowa z komunikatem o resecie; /sprzedaj także zablokowane!
  const ev63 = makeCobbleTermEvent();
  handleTerminalPreTrade(ev63, t0 + 10 * 60_000);
  assert(ev63.isCanceled(), '63. transakcja bruku w Terminalu musi zostać odrzucona (pozostało 16 < 32)');
  assert(
    ev63.denials.some((d) => d.includes('1 984 / 2 000') && d.includes('reset za 50 min')),
    'Odmowa Terminala zawiera stan limitu i czas do resetu (50 min)'
  );
  assert(handleSellHand(termPlayer, serverTerm, t0 + 10 * 60_000) === 0, '/sprzedaj dzieli ten sam limit co Terminal');

  // Po 60 minutach Terminal znów akceptuje bruk
  const evAfterReset = makeCobbleTermEvent();
  handleTerminalPreTrade(evAfterReset, t0 + 60 * 60_000);
  assert(!evAfterReset.isCanceled(), 'Po 60 min Terminal znów pozwala na skup bruku');

  // F) Dok Eksportowy pomija 64x minecraft:cobblestone (0 monet, 64 bruku zostaje w skrzyni!)
  const dockSlots = [sandbox.Item.of('minecraft:cobblestone', 64)];
  const dockBlk = {
    x: 150,
    y: 65,
    z: 2,
    id: 'minecraft:chest',
    inventory: {
      getContainerSize: () => dockSlots.length,
      getItem: (idx) => dockSlots[idx],
      setChanged: () => {}
    }
  };
  const serverDock = {
    persistentData: makeCompound(),
    tell: () => {},
    runCommandSilent: () => {},
    overworld: () =>
      makeStrictOverworldMock({
        getBlock: (x, y, z) => (x === 150 && y === 65 && z === 2 ? dockBlk : null)
      })
  };
  writeExportDocks(serverDock, [{ x: 150, y: 65, z: 2, blockId: 'minecraft:chest', owner: 'DockTester', teamId: -1 }]);
  const dockTick = processExportDocksTick(serverDock, t0);
  assert(
    dockTick.itemsSold === 0 && dockTick.deposited === 0 && dockTick.pendingAdded === 0,
    'Dok Eksportowy nie sprzedaje 64x cobblestone'
  );
  assert(dockSlots[0].count === 64, '64x cobblestone pozostało nietknięte w Doku Eksportowym');

  // G) /cennik 1 pokazuje limit 2 000/h (bez NPC i Doków) zamiast mylącego Rynek NPC ~0
  const priceMsgs = [];
  handleShowPrices({ username: 'PriceViewer', persistentData: makeCompound(), tell: (t) => priceMsgs.push(t.s) }, 1, serverA);
  const cobblePriceLine = priceMsgs.find((m) => m.includes('minecraft:cobblestone'));
  assert(
    cobblePriceLine && cobblePriceLine.includes('limit 2 000/h (bez NPC i Doków)') && !cobblePriceLine.includes('Rynek NPC ~0'),
    `/cennik 1 poprawnie wyświetla limit godzinowy dla bruku: "${cobblePriceLine}"`
  );

  // H) Shoppers sync: 60 blokad Tier 0 + 1 bez NPC (minecraft:cobblestone = 0L, NIGDY 1L!)
  const serverShoppers = {
    persistentData: makeCompound(),
    overworld: () => ({ __isOverworld: true }),
    runCommandSilent: () => {}
  };
  const shS0 = applyShoppersTier0ZeroWorth(serverShoppers, true);
  assert(shS0.tier0 === 60 && shS0.npcBlocked === 1 && shoppersPrices.get('minecraft:cobblestone') === 0, 'Shoppers S0: 60 Tier 0, 1 bez NPC, bruk = 0');
  for (let s = 1; s <= 5; s++) serverShoppers.persistentData.getCompound('halucynacje_global_stages').putBoolean('stage_' + s, true);
  const shS5 = applyShoppersTier0ZeroWorth(serverShoppers, true);
  assert(shS5.stageLocked === 0 && shS5.npcBlocked === 1 && shoppersPrices.get('minecraft:cobblestone') === 0, 'Shoppers S5: stageLocked=0, bruk nadal = 0');

  // I) /kontrakt i Market Boom NIGDY nie losują minecraft:cobblestone (Etap 0 i Etap 1)
  for (const st of [0, 1]) {
    const { pool } = loadContractPoolForStage(st);
    assert(!pool.some((x) => x.id === 'minecraft:cobblestone'), `Pula /kontrakt na Etapie ${st} wyklucza minecraft:cobblestone`);
    const boomPool = getBoomEligibleItems(cat, st);
    assert(!boomPool.some((x) => x.id === 'minecraft:cobblestone'), `Pula Boomu na Etapie ${st} wyklucza minecraft:cobblestone`);

    const srvRoll = { persistentData: makeCompound(), tell: () => {} };
    if (st >= 1) srvRoll.persistentData.getCompound('halucynacje_global_stages').putBoolean('stage_1', true);
    for (let r = 0; r < 100; r++) {
      const c = rollNewContract(srvRoll, null);
      assert(c && c.itemId !== 'minecraft:cobblestone', `/kontrakt na Etapie ${st} nigdy nie losuje bruku`);
      const b = rollMarketBoom(srvRoll, null, t0);
      assert(b && b.itemId !== 'minecraft:cobblestone', `Boom na Etapie ${st} nigdy nie losuje bruku`);
    }
  }
});

console.log(`🎉 Wszystkie ${passed}/${passed} pakietów testów KubeJS ZALICZONE!`);



