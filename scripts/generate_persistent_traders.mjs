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

function makeTrader(id, name, ownerName, iconItemId, trades) {
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
    OwnerName: ownerName || OWNER_NAME,
    CustomIcon: makeItemIcon(iconItemId),
    Trades: trades
  };
}

function formatShortPrice(n) {
  const v = Number(n || 0);
  if (v >= 1000) {
    const k = v / 1000;
    return `${Number.isInteger(k) ? k : Number(k.toFixed(1))}k`;
  }
  return `${v}`;
}

function generatePersistentTraders(prices) {
  const blockedIds = new Set((prices.tier_0_blocked || []).map((x) => x.id));
  const traders = [];

  // 1. [KUP] 1. Żetony Etapów (Stage 1..5 — Issue #51: bez Creative Motor)
  const stageAndPrestigeTrades = [];
  for (const tok of prices.stage_tokens || []) {
    stageAndPrestigeTrades.push(makeTrade('SALE', tok.id, 1, tok.buy_price, tok.name));
  }
  const prestigeItems = (prices.buy_catalog || []).filter(
    (item) => item.category === 'prestige' || (!item.category && item.stage >= 5)
  );
  for (const item of prestigeItems) {
    const buyCount = item.count != null ? Number(item.count) : 1;
    stageAndPrestigeTrades.push(makeTrade('SALE', item.id, buyCount, item.buy_price, item.note || null));
  }
  traders.push(
    makeTrader(
      'halucynacje_kup_01_etapy',
      '[KUP] 1. Żetony Etapów',
      'Stage 1-5 (10k..1M monet)',
      'lightmanscurrency:coin_diamond',
      stageAndPrestigeTrades
    )
  );

  // 2..9. Osiem tematycznych sklepów zakupowych [KUP] z prices.json (RFC #46 + #83)
  const buyCategories = [
    {
      key: 'plants',
      id: 'halucynacje_kup_02_rosliny',
      name: '[KUP] 2. Rośliny i Sadzonki',
      subtitle: 'Drzewa, nasiona i uprawy FD',
      icon: 'minecraft:oak_sapling'
    },
    {
      key: 'livestock',
      id: 'halucynacje_kup_03_hodowla',
      name: '[KUP] 3. Zwierzęta i Hodowla',
      subtitle: 'Jajka mobów, pszczoły i ule',
      icon: 'minecraft:bee_nest'
    },
    {
      key: 'skyblock',
      id: 'halucynacje_kup_04_skyblock',
      name: '[KUP] 4. Skyblock i Bloki',
      subtitle: 'Lawa, lód, redstone i startery',
      icon: 'minecraft:lava_bucket'
    },
    {
      key: 'tech',
      id: 'halucynacje_kup_05_tech',
      name: '[KUP] 5. Maszyny i High-Tech',
      subtitle: 'Create, Waystone, AE2, Mekanism',
      icon: 'ae2:flawless_budding_quartz'
    },
    {
      key: 'machines',
      id: 'halucynacje_kup_06_maszyny',
      name: '[KUP] 6. Maszyny Create',
      subtitle: 'Kinetyka, przetwórstwo, logistyka, kolej',
      icon: 'create:mechanical_press'
    },
    {
      key: 'materials',
      id: 'halucynacje_kup_07_surowce',
      name: '[KUP] 7. Sztabki i Surowce',
      subtitle: 'Sztabki, blachy, obudowy i półprodukty',
      icon: 'create:brass_ingot'
    },
    {
      key: 'decor',
      id: 'halucynacje_kup_08_dekoracje',
      name: '[KUP] 8. Bloki Dekoracyjne',
      subtitle: 'Kamień Create, Create Deco, barwniki',
      icon: 'create:cut_andesite_bricks'
    },
    {
      key: 'tools',
      id: 'halucynacje_kup_09_narzedzia',
      name: '[KUP] 9. Narzędzia i Plecaki',
      subtitle: 'Klucz, plecaki, magazyn i gadżety',
      icon: 'create:wrench'
    }
  ];

  const assignedBuyIds = new Set(prestigeItems.map((x) => x.id));
  for (const cat of buyCategories) {
    const catItems = (prices.buy_catalog || []).filter((item) => item.category === cat.key);
    for (const item of catItems) {
      assignedBuyIds.add(item.id);
    }
    traders.push(
      makeTrader(
        cat.id,
        cat.name,
        cat.subtitle,
        cat.icon,
        catItems.map((item) => {
          const buyCount = item.count != null ? Number(item.count) : 1;
          return makeTrade('SALE', item.id, buyCount, item.buy_price);
        })
      )
    );
  }

  // Straż: żaden przedmiot z buy_catalog nie może wypaść poza kategorie!
  for (const item of prices.buy_catalog || []) {
    if (!assignedBuyIds.has(item.id)) {
      throw new Error(
        `Pozycja buy_catalog "${item.id}" ma nieznaną lub brakującą kategorię "${item.category}"!`
      );
    }
  }

  // 10..14. [SKUP] 1..5 — Skup Hurtowy Tier 1–5 (TradeType = PURCHASE, cena bazowa 100% z prices.json)
  // ID traderów zachowane bez zmian dla zgodności z blokadą Terminala LC (RFC #83 Część B).
  const tierMeta = {
    tier_1_start: {
      id: 'halucynacje_skup_01_start',
      num: 1,
      fallbackTitle: 'Farma i Piekarnia',
      icon: 'minecraft:bread'
    },
    tier_2_kitchen: {
      id: 'halucynacje_skup_02_kuchnia',
      num: 2,
      fallbackTitle: 'Kuchnia i Cukiernia',
      icon: 'farmersdelight:hamburger'
    },
    tier_3_luxury_bakery: {
      id: 'halucynacje_skup_03_cukiernia',
      num: 3,
      fallbackTitle: 'Nether i Mosiądz',
      icon: 'create:precision_mechanism'
    },
    tier_4_create_industry: {
      id: 'halucynacje_skup_04_przemysl',
      num: 4,
      fallbackTitle: 'Przemysł Ciężki',
      icon: 'mekanism:steel_casing'
    },
    tier_5_hightech_export: {
      id: 'halucynacje_skup_05_hightech',
      num: 5,
      fallbackTitle: 'High-Tech i End',
      icon: 'ae2:cell_component_64k'
    }
  };

  let fallbackNum = 0;
  for (const [tierKey, tierObj] of Object.entries(prices.sell_tiers || {})) {
    fallbackNum++;
    const meta = tierMeta[tierKey] || {
      id: `halucynacje_skup_${tierKey}`,
      num: fallbackNum,
      fallbackTitle: tierKey,
      icon: 'lightmanscurrency:coin_gold'
    };

    const shortTitle =
      tierObj.description && String(tierObj.description).includes('—')
        ? String(tierObj.description).split('—')[0].trim()
        : meta.fallbackTitle;
    const sellStage = Number.isInteger(tierObj.sell_stage) ? tierObj.sell_stage : meta.num - 1;

    const purchaseTrades = [];
    let minW = Infinity;
    let maxW = -Infinity;
    for (const item of tierObj.items || []) {
      if (blockedIds.has(item.id)) {
        throw new Error(
          `NARUSZENIE OCHRONY EKONOMII: surowiec Tier 0 (${item.id}) pojawił się w skupie ${tierKey}!`
        );
      }
      const packSize = item.pack_size && Number(item.pack_size) > 1 ? Number(item.pack_size) : 1;
      if (item.wholesale_gui < minW) minW = item.wholesale_gui;
      if (item.wholesale_gui > maxW) maxW = item.wholesale_gui;
      purchaseTrades.push(makeTrade('PURCHASE', item.id, packSize, item.wholesale_gui));
    }

    const rangeLabel =
      Number.isFinite(minW) && Number.isFinite(maxW)
        ? `${formatShortPrice(minW)}-${formatShortPrice(maxW)}${maxW < 1000 ? 'c' : ''}`
        : '';
    const subtitle = `Tier ${meta.num} (Etap ${sellStage}+)${rangeLabel ? ` | ${rangeLabel}` : ''}`;

    traders.push(
      makeTrader(meta.id, `[SKUP] ${meta.num}. ${shortTitle}`, subtitle, meta.icon, purchaseTrades)
    );
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
    const expectedCount = item.count != null ? Number(item.count) : 1;
    const found = seenSaleItems.get(item.id);
    if (!found || found.price !== item.buy_price || found.count !== expectedCount) {
      errors.push(
        `Brak lub niezgodna oferta zakupowa ${item.id} w PersistentTraders.json (oczekiwano x${expectedCount} za ${item.buy_price}).`
      );
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
