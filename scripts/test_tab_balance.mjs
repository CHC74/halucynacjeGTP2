#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Testy jednostkowe dla `kubejs/server_scripts/economy_tab_balance.js` (Issue #30)
 *
 * Weryfikuje bez uruchamiania JVM:
 * 1. Brak usuniętych/nieistniejących eventów KubeJS 7.2 (np. `PlayerEvents.changedDimension`).
 * 2. Poprawne zliczanie nominałów monet (`coin_*`), stosów (`coinpile_*` = 9x) i bloków (`coinblock_*` = 36x).
 * 3. Integrację z API `Lightman's Currency 2.3.0.6` (portfel LC + bank osobisty + bank drużynowy
 *    z deduplikacją `team.getID()`, pominięciem nie-main chainów oraz bez podwójnego liczenia).
 * 4. Bezpieczny fallback na fizyczne monety w ekwipunku, gdy API Javy jest niedostępne lub rzuci wyjątek.
 * 5. Ograniczanie wyniku (clamping) do 32-bit int scoreboarda Minecrafta `[0 .. 2 147 483 647]`.
 * 6. Inicjalizację scoreboarda `halucynacje_monety` w slocie `list` (TAB), throttling co `60 ticków`,
 *    cache unikający zbędnych komend oraz komendę `/saldo`.
 */

import fs from 'node:fs';
import vm from 'node:vm';

const SHARED_PATH = 'kubejs/server_scripts/shared_economy.js';
const SCRIPT_PATH = 'kubejs/server_scripts/economy_tab_balance.js';
const SHARED_SRC = fs.readFileSync(SHARED_PATH, 'utf8');
const SCRIPT_SRC = SHARED_SRC + '\n;\n' + fs.readFileSync(SCRIPT_PATH, 'utf8');

function assert(cond, msg) {
  if (!cond) {
    throw new Error(`ASSERTION FAILED: ${msg}`);
  }
}

function makeTextProxy() {
  const wrap = (s) => ({
    s: String(s),
    append(other) {
      return wrap(this.s + (other && other.s != null ? other.s : String(other)));
    }
  });
  return new Proxy(
    {},
    {
      get: (_, prop) => (txt) => wrap(`[${String(prop)}]${txt}`)
    }
  );
}

function makeMoneyView(entries) {
  return {
    allValues: () => entries
  };
}

function makeCoinValue(chain, coreValue) {
  return {
    isEmpty: () => coreValue <= 0,
    isFree: () => false,
    getChain: () => chain,
    getUniqueName: () => `lightmanscurrency:coins;${chain}`,
    getCoreValue: () => coreValue
  };
}

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  ✅ ${name}`);
}

console.log('🧪 Uruchamiam testy jednostkowe economy_tab_balance.js (Issue #30)...');

// 1. Guard KubeJS 7.2 / NeoForge 1.21.1 — brak usuniętych eventów
test('Brak usuniętych eventów KubeJS 7.2 (np. PlayerEvents.changedDimension)', () => {
  const forbidden = [
    'PlayerEvents.changedDimension',
    'PlayerEvents.inventoryChanged',
    'BlockEvents.broken'
  ];
  for (const ev of forbidden) {
    assert(!SCRIPT_SRC.includes(ev), `Wykryto zakazany/usunięty event KubeJS 7.2: ${ev}`);
  }
  assert(SCRIPT_SRC.includes('ServerEvents.loaded'), 'Brak ServerEvents.loaded');
  assert(SCRIPT_SRC.includes('ServerEvents.tick'), 'Brak ServerEvents.tick');
  assert(SCRIPT_SRC.includes('PlayerEvents.loggedIn'), 'Brak PlayerEvents.loggedIn');
  assert(SCRIPT_SRC.includes('ServerEvents.commandRegistry'), 'Brak ServerEvents.commandRegistry');
});

// 2. Zliczanie monet/stosów/bloków + portfel + bank osobisty + bank drużynowy + deduplikacja + ignorowanie innego chainu
test('Agregacja EQ + Portfel LC + Bank Osobisty + Bank Drużynowy (z deduplikacją i filtrem chain="main")', () => {
  const handlers = {};
  const cmds = [];

  const mockJava = {
    loadClass(className) {
      if (className.endsWith('.MoneyAPI')) {
        return {
          getApi: () => ({
            GetPlayersMoneyHandler: () => ({
              getStoredMoney: () =>
                makeMoneyView([
                  makeCoinValue('main', 2500),
                  makeCoinValue('chocolate_event', 999999) // inny chain — ma zostać zignorowany!
                ])
            })
          })
        };
      }
      if (className.endsWith('.PlayerBankReference')) {
        return {
          of: () => ({
            get: () => ({
              getMoneyStorage: () => ({
                getStoredMoney: () => makeMoneyView([makeCoinValue('main', 50000)])
              })
            })
          })
        };
      }
      if (className.endsWith('.TeamAPI')) {
        const sharedTeam = {
          getID: () => 42,
          hasBankAccount: () => true,
          canAccessBankAccount: () => true,
          getBankAccount: () => ({
            getMoneyStorage: () => ({
              getStoredMoney: () => makeMoneyView([makeCoinValue('main', 120000)])
            })
          })
        };
        const lockedTeam = {
          getID: () => 99,
          hasBankAccount: () => true,
          canAccessBankAccount: () => false,
          getBankAccount: () => ({
            getMoneyStorage: () => ({
              getStoredMoney: () => makeMoneyView([makeCoinValue('main', 777777)])
            })
          })
        };
        return {
          getApi: () => ({
            // Celowy duplikat sharedTeam (ID=42) + drużyna bez dostępu (ID=99)
            GetAllTeamsForPlayer: () => [sharedTeam, sharedTeam, lockedTeam]
          })
        };
      }
      throw new Error(`Nieoczekiwana klasa: ${className}`);
    }
  };

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    Java: mockJava,
    Text: makeTextProxy(),
    ServerEvents: {
      loaded: (fn) => (handlers.loaded = fn),
      tick: (fn) => (handlers.tick = fn),
      commandRegistry: (fn) => (handlers.commandRegistry = fn)
    },
    PlayerEvents: {
      loggedIn: (fn) => (handlers.loggedIn = fn)
    },
    assert
  };

  const inv = [
    { id: 'lightmanscurrency:coin_copper', count: 5, isEmpty: () => false }, // 5
    { id: 'lightmanscurrency:coin_gold', count: 3, isEmpty: () => false }, // 300
    { id: 'lightmanscurrency:coinpile_iron', count: 2, isEmpty: () => false }, // 180
    { id: 'lightmanscurrency:coinblock_copper', count: 1, isEmpty: () => false }, // 36
    { id: 'minecraft:bread', count: 64, isEmpty: () => false } // 0
  ];
  // Suma EQ = 5 + 300 + 180 + 36 = 521
  // Portfel = 2500, Bank Osobisty = 50000, Bank Drużynowy = 120000
  // Razem = 173021

  const player = {
    username: 'TycoonPlayer',
    stringUuid: 'uuid-1',
    inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
    tell: () => {}
  };
  const server = {
    players: [player],
    runCommandSilent: (cmd) => cmds.push(cmd)
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SCRIPT_SRC, ctx);

  handlers.loaded({ server });
  assert(
    cmds.some((c) => c.includes('scoreboard objectives add halucynacje_monety dummy')),
    'Utworzono objective halucynacje_monety'
  );
  assert(
    cmds.some((c) => c === 'scoreboard objectives setdisplay list halucynacje_monety'),
    'Podpięto halucynacje_monety pod slot list (TAB)'
  );

  handlers.loggedIn({ player, server });
  assert(
    cmds.some((c) => c === 'scoreboard players set TycoonPlayer halucynacje_monety 173021'),
    `Oczekiwano wyniku 173021 pod TAB, komendy: ${JSON.stringify(cmds)}`
  );

  // Throttling 60 ticków + cache: 59 ticków nie wysyła nic; na 60. ticku przy braku zmiany też nie spamuje
  const beforeTicks = cmds.length;
  for (let t = 0; t < 60; t++) {
    handlers.tick({ server });
  }
  assert(cmds.length === beforeTicks, 'Cache powinien zapobiec ponownemu scoreboard set przy braku zmiany');

  // Zmiana stanu ekwipunku (+1 diamentowa moneta = +10000 -> 183021)
  inv.push({ id: 'lightmanscurrency:coin_diamond', count: 1, isEmpty: () => false });
  for (let t = 0; t < 59; t++) {
    handlers.tick({ server });
  }
  assert(cmds.length === beforeTicks, 'Przed 60. tickiem nie powinno być odświeżenia');
  handlers.tick({ server });
  assert(
    cmds[cmds.length - 1] === 'scoreboard players set TycoonPlayer halucynacje_monety 183021',
    `Na 60. ticku oczekiwano 183021, było: ${cmds[cmds.length - 1]}`
  );
});

// 3. Bezpieczny fallback bez Java / gdy LC API rzuca wyjątki + clamping 32-bit int
test('Bezpieczny fallback bez Java API oraz clamping 32-bit integer overflow', () => {
  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    Java: {
      loadClass: () => {
        throw new Error('LC class unavailable in test');
      }
    },
    Text: makeTextProxy(),
    ServerEvents: { loaded: () => {}, tick: () => {}, commandRegistry: () => {} },
    PlayerEvents: { loggedIn: () => {} },
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SCRIPT_SRC, ctx);

  // Fallback na czyste fizyczne monety w EQ
  const inv = [{ id: 'lightmanscurrency:coin_netherite', count: 10, isEmpty: () => false }];
  const player = {
    username: 'FallbackUser',
    stringUuid: 'uuid-fb',
    inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] }
  };
  const breakdown = vm.runInContext('computePlayerBalanceBreakdown', ctx)(player);
  assert(breakdown.inventory === 1000000, 'Fallback EQ = 1 000 000');
  assert(breakdown.wallet === 0 && breakdown.personalBank === 0 && breakdown.teamBank === 0, 'API zwróciło 0 bez błędu');
  assert(breakdown.clampedScore === 1000000, 'clampedScore = 1 000 000');

  // Clamping overflow i wartości ujemne / NaN
  const clamp = vm.runInContext('clampScoreboardBalance', ctx);
  assert(clamp(-500) === 0, 'Ujemne -> 0');
  assert(clamp(NaN) === 0, 'NaN -> 0');
  assert(clamp(999999999999) === 2147483647, 'Overflow clamped do 2 147 483 647');
  assert(clamp(12345.9) === 12345, 'Floor dla ułamków');
});

// 4. Komenda `/saldo`
test('Rejestracja i wykonanie komendy /saldo', () => {
  let registeredCmd = null;
  const msgs = [];
  const cmds = [];

  const sandbox = {
    console: { info: () => {}, warn: () => {}, error: () => {} },
    Text: makeTextProxy(),
    ServerEvents: {
      loaded: () => {},
      tick: () => {},
      commandRegistry: (fn) => {
        fn({
          commands: {
            literal: (name) => ({
              name,
              executes(cb) {
                this.cb = cb;
                return this;
              }
            })
          },
          register: (node) => {
            registeredCmd = node;
          }
        });
      }
    },
    PlayerEvents: { loggedIn: () => {} },
    assert
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(SCRIPT_SRC, ctx);

  assert(registeredCmd && registeredCmd.name === 'saldo', 'Zarejestrowano komendę /saldo');
  const inv = [{ id: 'lightmanscurrency:coin_emerald', count: 7, isEmpty: () => false }];
  const res = registeredCmd.cb({
    source: {
      player: {
        username: 'SaldoTester',
        stringUuid: 'uuid-saldo',
        inventory: { getContainerSize: () => inv.length, getItem: (i) => inv[i] },
        tell: (t) => msgs.push(t.s)
      },
      server: {
        runCommandSilent: (c) => cmds.push(c)
      }
    }
  });
  assert(res === 1, '/saldo zwróciło 1');
  assert(msgs.some((m) => m.includes('7 000 monet')), `Komunikat /saldo zawiera 7 000 monet: ${JSON.stringify(msgs)}`);
  assert(
    cmds.some((c) => c === 'scoreboard players set SaldoTester halucynacje_monety 7000'),
    '/saldo wymusza natychmiastowe odświeżenie TAB'
  );
});

console.log(`🎉 Wszystkie ${passed}/4 testy economy_tab_balance.js ZALICZONE!`);
