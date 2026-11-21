#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Deterministyczny generator i walidator `PersistentTraders.json`
 * dla Lightman's Currency 1.21-2.3.0.6 (NeoForge 1.21.1).
 *
 * Jedno źródło prawdy: `config/halucynacje_economy/prices.json`.
 * Plik wynikowy: `config/lightmanscurrency/PersistentTraders.json`
 * (ścieżka i schemat JSON w 100% zweryfikowane w bajtkodzie:
 *  - `TraderDataCache.PERSISTENT_TRADER_FILENAME` = `"config/lightmanscurrency/PersistentTraders.json"`
 *  - `TraderDataCache.loadPersistentTrader`: tablica `"Traders"`, klucz `"ID"` (wielkie litery!)
 *  - `TraderData.Deserialize` / `loadFromJson`: `"Type": "lightmanscurrency:item_trader"`, `"Name"`, `"OwnerName"`, `"CustomIcon"`
 *  - `ItemTraderData.loadAdditionalFromJson`: `"Trades"` (limit <= 100 na tradera), `"TradeType": "SALE" | "PURCHASE"`, `"SellItem": { "id", "count" }` (`ItemStack.CODEC` MC 1.21.1), `"Price"`
 *  - `MoneyValue.loadFromJson` / `CoinValue.loadCoinValue`: `{ "type": "lightmanscurrency:coins", "Chain": "main", "Value": [{ "Coin": "...", "Amount": N }] }`
 * )
 *
 * Użycie:
 *   node scripts/generate_persistent_traders.mjs           # generuje config/lightmanscurrency/PersistentTraders.json
 *   node scripts/generate_persistent_traders.mjs --check   # waliduje w CI bez nadpisywania pliku
 *   node scripts/generate_persistent_traders.mjs --verify  # alias dla --check
 */

import fs from 'node:fs';
import path from 'node:path';

const PRICES_PATH = path.resolve('config/halucynacje_economy/prices.json');
const OUTPUT_PATH = path.resolve('config/lightmanscurrency/PersistentTraders.json');
const CHECK_MODE = process.argv.includes('--check') || process.argv.includes('--verify');

const OWNER_NAME = 'Giełda HalucynacjeGTP2';
const MAX_TRADES_PER_TRADER = 100;

const LC_COINS = [
  { id: 'lightmanscurrency:coin_netherite', value: 100000 },
  { id: 'lightmanscurrency:coin_diamond', value: 10000 },
  { id: 'lightmanscurrency:coin_emerald', value: 1000 },
  { id: 'lightmanscurrency:coin_gold', value: 100 },
  { id: 'lightmanscurrency:coin_iron', value: 10 },
  { id: 'lightmanscurrency:coin_copper', value: 1 }
];

const LC_COIN_VALUES = Object.fromEntries(LC_COINS.map((c) => [c.id, c.value]));

/**
 * Konwertuje dodatnią kwotę w monetach bazowych (copper) na strukturę `CoinValue`
 * zgodną z `MoneyValue.loadFromJson` / `CoinValue.loadCoinValue` w LC 2.3.0.6.
 */
function buildCoinPrice(copperAmount) {
  let remaining = Math.floor(Number(copperAmount));
  if (!Number.isFinite(remaining) || remaining <= 0) {
    throw new Error(`Nieprawidłowa cena w monetach (musi być > 0): ${copperAmount}`);
  }

  const pairs = [];
  for (const coin of LC_COINS) {
    if (remaining >= coin.value) {
      const amount = Math.floor(remaining / coin.value);
      remaining = remaining % coin.value;
      pairs.push({ Coin: coin.id, Amount: amount });
    }
  }

  return {
    type: 'lightmanscurrency:coins',
    Chain: 'main',
    Value: pairs
  };
}

function sumCoinPrice(priceObj) {
  if (!priceObj || priceObj.type !== 'lightmanscurrency:coins' || priceObj.Chain !== 'main') {
    return -1;
  }
  if (!Array.isArray(priceObj.Value) || priceObj.Value.length === 0) {
    return -1;
  }
  let sum = 0;
  for (const pair of priceObj.Value) {
    const val = LC_COIN_VALUES[pair.Coin];
    if (!val || !Number.isInteger(pair.Amount) || pair.Amount <= 0) {
      return -1;
    }
    sum += val * pair.Amount;
  }
  return sum;
}

function makeItemIcon(itemId) {
  return {
    Type: 'lightmanscurrency:item',
    Item: { id: itemId, count: 1 }
  };
}

function makeTrade(tradeType, itemId, count, copperPrice, displayName = null) {
  const trade = {
    TradeType: tradeType,
    SellItem: {
      id: itemId,
      count: count
    },
    Price: buildCoinPrice(copperPrice)
  };
  if (displayName) {
    trade.DisplayName = displayName;
  }
  return trade;
}

function makeTrader(id, name, iconItemId, trades) {
  if (trades.length === 0) {
    throw new Error(`Trader "${id}" nie ma żadnych ofert!`);
  }
  if (trades.length > MAX_TRADES_PER_TRADER) {
    throw new Error(
      `Trader "${id}" przekracza limit ${MAX_TRADES_PER_TRADER} ofert ItemTraderData (${trades.length})!`
    );
  }
  return {
    Type: 'lightmanscurrency:item_trader',
    ID: id,
    Name: name,
    OwnerName: OWNER_NAME,
    CustomIcon: makeItemIcon(iconItemId),
    Trades: trades
  };
}

function generatePersistentTraders(prices) {
  const blockedIds = new Set((prices.tier_0_blocked || []).map((x) => x.id));
  const traders = [];

  // 1. Żetony Etapów (Stage 1..5) + Prestiżowy Creative Motor (2M)
  const stageAndPrestigeTrades = [];
  for (const tok of prices.stage_tokens || []) {
    stageAndPrestigeTrades.push(makeTrade('SALE', tok.id, 1, tok.buy_price, tok.name));
  }
  const prestigeItems = (prices.buy_catalog || []).filter((item) => item.stage >= 5);
  for (const item of prestigeItems) {
    const label =
      item.id === 'create:creative_motor'
        ? 'Creative Motor (Prestiż 2M — cel końcowy)'
        : item.note || null;
    stageAndPrestigeTrades.push(makeTrade('SALE', item.id, 1, item.buy_price, label));
  }
  traders.push(
    makeTrader(
      'halucynacje_stage_tokens',
      'Żetony Etapów & Prestiż',
      'lightmanscurrency:coin_diamond',
      stageAndPrestigeTrades
    )
  );

  // 2. Startery Skyblocka — Rośliny, Farmy i Hodowla (Etapy 0–1)
  const earlyStarters = (prices.buy_catalog || []).filter((item) => item.stage <= 1);
  traders.push(
    makeTrader(
      'halucynacje_starters_early',
      'Startery Skyblocka — Rośliny i Hodowla (S0–S1)',
      'minecraft:oak_sapling',
      earlyStarters.map((item) => makeTrade('SALE', item.id, 1, item.buy_price))
    )
  );

  // 3. Startery Logistyki i High-Tech (Etapy 2–4: Terminal, Waystone, AE2, Mekanism)
  const techStarters = (prices.buy_catalog || []).filter(
    (item) => item.stage >= 2 && item.stage < 5
  );
  traders.push(
    makeTrader(
      'halucynacje_starters_tech',
      'Startery Logistyki i High-Tech (S2–S3)',
      'ae2:flawless_budding_quartz',
      techStarters.map((item) => makeTrade('SALE', item.id, 1, item.buy_price))
    )
  );

  // 4..8. Skup Hurtowy Tier 1–5 (TradeType = PURCHASE, cena bazowa 100% z prices.json)
  const tierMeta = {
    tier_1_start: {
      id: 'halucynacje_skup_tier_1',
      name: 'Skup Hurtowy — Tier 1: Wypieki i Start',
      icon: 'minecraft:bread'
    },
    tier_2_kitchen: {
      id: 'halucynacje_skup_tier_2',
      name: 'Skup Hurtowy — Tier 2: Kuchnia FD & Create:Food',
      icon: 'farmersdelight:hamburger'
    },
    tier_3_luxury_bakery: {
      id: 'halucynacje_skup_tier_3',
      name: 'Skup Hurtowy — Tier 3: Cukiernia i Słodycze',
      icon: 'create:sweet_roll'
    },
    tier_4_create_industry: {
      id: 'halucynacje_skup_tier_4',
      name: 'Skup Hurtowy — Tier 4: Przemysł Create 6',
      icon: 'create:precision_mechanism'
    },
    tier_5_hightech_export: {
      id: 'halucynacje_skup_tier_5',
      name: 'Skup Hurtowy — Tier 5: Eksport AE2 & Mekanism',
      icon: 'ae2:engineering_processor'
    }
  };

  for (const [tierKey, tierObj] of Object.entries(prices.sell_tiers || {})) {
    const meta = tierMeta[tierKey] || {
      id: `halucynacje_skup_${tierKey}`,
      name: `Skup Hurtowy — ${tierKey}`,
      icon: 'lightmanscurrency:coin_gold'
    };

    const purchaseTrades = [];
    for (const item of tierObj.items || []) {
      if (blockedIds.has(item.id)) {
        throw new Error(
          `NARUSZENIE OCHRONY EKONOMII: surowiec Tier 0 (${item.id}) pojawił się w skupie ${tierKey}!`
        );
      }
      const packSize = item.pack_size && Number(item.pack_size) > 1 ? Number(item.pack_size) : 1;
      purchaseTrades.push(makeTrade('PURCHASE', item.id, packSize, item.wholesale_gui));
    }

    traders.push(makeTrader(meta.id, meta.name, meta.icon, purchaseTrades));
  }

  return {
    Traders: traders,
    Auctions: []
  };
}

function validateGeneratedData(data, prices) {
  const errors = [];
  const blockedIds = new Set((prices.tier_0_blocked || []).map((x) => x.id));

  if (!Array.isArray(data.Traders) || data.Traders.length === 0) {
    errors.push('Brak tablicy `Traders` w PersistentTraders.json.');
  }
  if (!Array.isArray(data.Auctions)) {
    errors.push('Brak tablicy `Auctions` w PersistentTraders.json.');
  }

  const seenTraderIds = new Set();
  const seenSaleItems = new Map();
  const seenPurchaseItems = new Map();
  let totalTrades = 0;

  for (const trader of data.Traders || []) {
    if (trader.Type !== 'lightmanscurrency:item_trader') {
      errors.push(`Nieznany Type tradera "${trader.ID}": ${trader.Type}`);
    }
    if (!trader.ID || typeof trader.ID !== 'string' || trader.ID.trim() === '') {
      errors.push('Trader ma puste pole `ID`.');
    } else if (seenTraderIds.has(trader.ID)) {
      errors.push(`Duplikat ID tradera: ${trader.ID}`);
    } else {
      seenTraderIds.add(trader.ID);
    }

    if (!Array.isArray(trader.Trades) || trader.Trades.length === 0) {
      errors.push(`Trader "${trader.ID}" ma pustą listę Trades.`);
      continue;
    }
    if (trader.Trades.length > MAX_TRADES_PER_TRADER) {
      errors.push(
        `Trader "${trader.ID}" przekracza limit ${MAX_TRADES_PER_TRADER} ofert (${trader.Trades.length}).`
      );
    }

    for (const trade of trader.Trades) {
      totalTrades++;
      if (trade.TradeType !== 'SALE' && trade.TradeType !== 'PURCHASE') {
        errors.push(`Nieprawidłowy TradeType w "${trader.ID}": ${trade.TradeType}`);
      }
      if (!trade.SellItem || typeof trade.SellItem.id !== 'string' || !Number.isInteger(trade.SellItem.count) || trade.SellItem.count < 1 || trade.SellItem.count > 64) {
        errors.push(`Nieprawidłowy SellItem w "${trader.ID}": ${JSON.stringify(trade.SellItem)}`);
      }
      const priceSum = sumCoinPrice(trade.Price);
      if (priceSum <= 0) {
        errors.push(`Nieprawidłowe Price w "${trader.ID}" dla ${trade.SellItem?.id}`);
      }
      if (trade.TradeType === 'PURCHASE') {
        if (blockedIds.has(trade.SellItem.id)) {
          errors.push(`Naruszenie ochrony ekonomii: surowiec Tier 0 w skupie GUI (${trade.SellItem.id})!`);
        }
        seenPurchaseItems.set(trade.SellItem.id, {
          count: trade.SellItem.count,
          price: priceSum
        });
      } else if (trade.TradeType === 'SALE') {
        seenSaleItems.set(trade.SellItem.id, {
          count: trade.SellItem.count,
          price: priceSum
        });
      }
    }
  }

  // Weryfikacja 1:1 względem prices.json
  for (const tok of prices.stage_tokens || []) {
    const found = seenSaleItems.get(tok.id);
    if (!found || found.price !== tok.buy_price) {
      errors.push(`Brak lub niezgodna cena Żetonu Etapu ${tok.id} w PersistentTraders.json.`);
    }
  }
  for (const item of prices.buy_catalog || []) {
    const found = seenSaleItems.get(item.id);
    if (!found || found.price !== item.buy_price) {
      errors.push(`Brak lub niezgodna cena towaru zakupowego ${item.id} w PersistentTraders.json.`);
    }
  }
  let expectedPurchaseCount = 0;
  for (const tierObj of Object.values(prices.sell_tiers || {})) {
    for (const item of tierObj.items || []) {
      expectedPurchaseCount++;
      const expectedCount = item.pack_size && Number(item.pack_size) > 1 ? Number(item.pack_size) : 1;
      const found = seenPurchaseItems.get(item.id);
      if (!found || found.price !== item.wholesale_gui || found.count !== expectedCount) {
        errors.push(
          `Brak lub niezgodna oferta skupu ${item.id} (oczekiwano x${expectedCount} za ${item.wholesale_gui}).`
        );
      }
    }
  }

  if (seenPurchaseItems.size !== expectedPurchaseCount) {
    errors.push(
      `Liczba pozycji skupu GUI (${seenPurchaseItems.size}) != prices.json (${expectedPurchaseCount}).`
    );
  }

  return {
    errors,
    stats: {
      traders: (data.Traders || []).length,
      totalTrades,
      saleTrades: seenSaleItems.size,
      purchaseTrades: seenPurchaseItems.size
    }
  };
}

// --- Główny przebieg ---
if (!fs.existsSync(PRICES_PATH)) {
  console.error(`❌ Nie znaleziono pliku źródłowego cennika: ${PRICES_PATH}`);
  process.exit(1);
}

const prices = JSON.parse(fs.readFileSync(PRICES_PATH, 'utf8'));
const generated = generatePersistentTraders(prices);
const { errors, stats } = validateGeneratedData(generated, prices);

if (errors.length > 0) {
  console.error('❌ Błąd walidacji generowanych PersistentTraders.json:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const serialized = JSON.stringify(generated, null, 2) + '\n';

if (CHECK_MODE) {
  if (!fs.existsSync(OUTPUT_PATH)) {
    console.error(
      `❌ Brak pliku ${path.relative(process.cwd(), OUTPUT_PATH)}. Uruchom: node scripts/generate_persistent_traders.mjs`
    );
    process.exit(1);
  }
  const existing = fs.readFileSync(OUTPUT_PATH, 'utf8');
  if (existing !== serialized) {
    console.error(
      `❌ Plik ${path.relative(process.cwd(), OUTPUT_PATH)} jest nieaktualny względem prices.json! Uruchom: node scripts/generate_persistent_traders.mjs`
    );
    process.exit(1);
  }
  // Dodatkowe sprawdzenie, czy na dysku jest poprawny JSON bez blokowanych surowców Tier 0
  const parsedExisting = JSON.parse(existing);
  const checkExisting = validateGeneratedData(parsedExisting, prices);
  if (checkExisting.errors.length > 0) {
    console.error('❌ Walidacja pliku PersistentTraders.json nie powiodła się:');
    for (const e of checkExisting.errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(
    `✅ PersistentTraders.json zweryfikowany i 100% spójny z prices.json (${stats.traders} sklepów sieciowych, ${stats.totalTrades} ofert: ${stats.saleTrades} sprzedaż SALE + ${stats.purchaseTrades} skup PURCHASE, 0 surowców Tier 0).`
  );
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, serialized, 'utf8');
console.log(
  `✅ Wygenerowano ${path.relative(process.cwd(), OUTPUT_PATH)} (${stats.traders} sklepów sieciowych, ${stats.totalTrades} ofert: ${stats.saleTrades} SALE + ${stats.purchaseTrades} PURCHASE).`
);
