#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Walidator ekonomii, ochrony anty-arbitrażowej i symulator tempa progresji (RFC #5)
 *
 * Sprawdza:
 * 1. Poprawność struktury `config/halucynacje_economy/prices.json` i nominałów Lightman's Currency.
 * 2. Zgodność progów Żetonów Etapów z nienegocjowalnymi zasadami (`10k / 50k / 100k / 250k / 1M`).
 * 3. Twardą blokadę Tier 0 (wszystkie surowe bloki / rudy / sztabki / dropy mobów = 0 monet).
 * 4. Premię NPC `Shoppers` w bezpiecznym przedziale +15%..+30% względem hurtu (cel +20%).
 * 5. Monotoniczność wartości pomiędzy Tierami (każdy wyższy Tier średnio wyraźnie przebija poprzedni).
 * 6. Unikalność aliasów w `buy_catalog` i `stage_tokens` (dla komendy `/kup <alias>`).
 * 7. Brak duplikatów ID oraz brak pętli arbitrażowych (buy <= sell, także dla wieloskładnikowych receptur).
 * 8. Raport tempa progresji (ile sztuk / stacków z danego Tieru daje kolejny Żeton Etapu).
 */

import fs from 'node:fs';
import path from 'node:path';

const PRICES_PATH = path.resolve('config/halucynacje_economy/prices.json');
const EXPECTED_STAGE_PRICES = [10000, 50000, 100000, 250000, 1000000];
const EXPECTED_LC_VALUES = [100000, 10000, 1000, 100, 10, 1];

const raw = fs.readFileSync(PRICES_PATH, 'utf8');
const data = JSON.parse(raw);

const errors = [];

// 0. Walidacja nominałów Lightman's Currency (jeśli obecne)
if (Array.isArray(data.currency?.denominations)) {
  const vals = data.currency.denominations.map((d) => d.value);
  if (JSON.stringify(vals) !== JSON.stringify(EXPECTED_LC_VALUES)) {
    errors.push(
      `Niepoprawny łańcuch nominałów LC: ${JSON.stringify(vals)} (oczekiwano ${JSON.stringify(EXPECTED_LC_VALUES)}).`
    );
  }
}

// 1. Walidacja progów Żetonów Etapów (Guardrail AGENTS.md sekcja 5)
const seenAliases = new Set();
if (!Array.isArray(data.stage_tokens) || data.stage_tokens.length !== 5) {
  errors.push('Oczekiwano dokładnie 5 wpisów w `stage_tokens`.');
} else {
  data.stage_tokens.forEach((token, idx) => {
    const expectedPrice = EXPECTED_STAGE_PRICES[idx];
    const expectedId = `kubejs:stage_${idx + 1}_token`;
    if (token.id !== expectedId) {
      errors.push(`Stage ${idx + 1}: niepoprawne ID "${token.id}" (oczekiwano "${expectedId}").`);
    }
    if (token.buy_price !== expectedPrice) {
      errors.push(
        `Stage ${idx + 1}: koszt ${token.buy_price} narusza guardrail (oczekiwano ${expectedPrice}).`
      );
    }
    if (token.alias) {
      if (seenAliases.has(token.alias)) {
        errors.push(`Duplikat aliasu "${token.alias}" w stage_tokens.`);
      }
      seenAliases.add(token.alias);
    }
  });
}

// 2. Walidacja Tier 0 (Blokada surowizny)
const tier0Set = new Set();
for (const entry of data.tier_0_blocked ?? []) {
  if (tier0Set.has(entry.id)) {
    errors.push(`Duplikat w tier_0_blocked: "${entry.id}".`);
  }
  tier0Set.add(entry.id);
  if (entry.wholesale_gui !== 0 || entry.npc_shoppers !== 0) {
    errors.push(`Tier 0 naruszenie dla "${entry.id}": ceny muszą wynosić 0.`);
  }
}
if (tier0Set.size < 15) {
  errors.push('Lista `tier_0_blocked` jest podejrzanie krótka (<15 surowców).');
}

// 3. Walidacja Tier 1–5 (marża NPC ~+20%, monotoniczność i brak kolizji z Tier 0)
const sellById = new Map();
const tierStats = [];

for (const [tierKey, tierObj] of Object.entries(data.sell_tiers ?? {})) {
  const items = tierObj.items ?? [];
  if (items.length === 0) {
    errors.push(`Pusty tier w sell_tiers: "${tierKey}".`);
    continue;
  }

  let sumWholesale = 0;
  let sumNpc = 0;
  let minW = Infinity;
  let maxW = -Infinity;

  for (const item of items) {
    if (tier0Set.has(item.id)) {
      errors.push(`Konflikt: "${item.id}" znajduje się jednocześnie w Tier 0 i ${tierKey}.`);
    }
    if (sellById.has(item.id)) {
      errors.push(`Duplikat w sell_tiers: "${item.id}".`);
    }
    if (!(item.wholesale_gui > 0) || !(item.npc_shoppers > 0)) {
      errors.push(`${tierKey} -> "${item.id}": ceny sprzedaży muszą być dodatnie.`);
    } else {
      const ratio = item.npc_shoppers / item.wholesale_gui;
      if (ratio < 1.15 || ratio > 1.30) {
        errors.push(
          `${tierKey} -> "${item.id}": premia NPC (${((ratio - 1) * 100).toFixed(1)}%) poza przedziałem 15%–30%.`
        );
      }
      sumWholesale += item.wholesale_gui;
      sumNpc += item.npc_shoppers;
      if (item.wholesale_gui < minW) minW = item.wholesale_gui;
      if (item.wholesale_gui > maxW) maxW = item.wholesale_gui;
    }
    sellById.set(item.id, item);
  }

  tierStats.push({
    key: tierKey,
    count: items.length,
    minW,
    maxW,
    avgWholesale: sumWholesale / items.length,
    avgNpc: sumNpc / items.length,
    target: tierObj.next_stage_target ?? null
  });
}

// Monotoniczność Tierów (wyższy Tier musi być średnio droższy niż poprzedni)
for (let i = 1; i < tierStats.length; i++) {
  if (tierStats[i].avgWholesale <= tierStats[i - 1].avgWholesale * 1.5) {
    errors.push(
      `Słaba progresja między ${tierStats[i - 1].key} (śr. ${tierStats[i - 1].avgWholesale.toFixed(1)}) a ${tierStats[i].key} (śr. ${tierStats[i].avgWholesale.toFixed(1)}).`
    );
  }
}

// 4. Walidacja katalogu Buy vs Sell (zero bezpośredniego arbitrażu buy <= sell + unikalne aliasy)
const buyById = new Map();
for (const item of data.buy_catalog ?? []) {
  if (!(item.buy_price > 0)) {
    errors.push(`buy_catalog -> "${item.id}": buy_price musi być > 0.`);
  }
  if (buyById.has(item.id)) {
    errors.push(`Duplikat w buy_catalog: "${item.id}".`);
  }
  if (item.alias) {
    if (seenAliases.has(item.alias)) {
      errors.push(`Duplikat aliasu "${item.alias}" w buy_catalog.`);
    }
    seenAliases.add(item.alias);
  }
  buyById.set(item.id, item);
  const sell = sellById.get(item.id);
  if (sell && item.buy_price <= Math.max(sell.wholesale_gui, sell.npc_shoppers)) {
    errors.push(
      `Arbitraż bezpośredni dla "${item.id}": buy=${item.buy_price} <= sell=${Math.max(sell.wholesale_gui, sell.npc_shoppers)}.`
    );
  }
}

// 5. Walidacja zadeklarowanych reguł anty-arbitrażowych (kupione składniki > maks. sprzedaż produktu)
for (const check of data.anti_arbitrage_checks ?? []) {
  const out = sellById.get(check.output_id);
  if (!out) {
    errors.push(`anti_arbitrage_checks: brak produktu "${check.output_id}" w sell_tiers.`);
    continue;
  }
  let inputCost = 0;
  for (const inp of check.bought_inputs ?? []) {
    const buyItem = buyById.get(inp.id);
    if (!buyItem) {
      errors.push(`anti_arbitrage_checks: brak składnika "${inp.id}" w buy_catalog.`);
      continue;
    }
    inputCost += buyItem.buy_price * (inp.count ?? 1);
  }
  const maxSell = Math.max(out.wholesale_gui, out.npc_shoppers);
  if (inputCost <= maxSell) {
    errors.push(
      `Ryzyko arbitrażu (${check.name}): koszt zakupu składników (${inputCost}) <= maks. sprzedaż (${maxSell}) dla "${check.output_id}".`
    );
  }
}

if (errors.length > 0) {
  console.error('❌ Walidacja ekonomii NIE POWIODŁA SIĘ:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(
  `✅ Walidacja ekonomii OK: ${data.stage_tokens.length} Żetonów Etapów, ${tier0Set.size} blokad Tier 0, ${sellById.size} towarów Tier 1–5, ${buyById.size} pozycji Buy, ${(data.anti_arbitrage_checks ?? []).length} reguł anty-arbitrażowych.`
);
console.log('📊 Symulacja tempa progresji (średnia cena hurt / NPC +20% -> cel kolejnego Etapu):');
for (const st of tierStats) {
  const targetStr = st.target
    ? ` | cel ${st.target.toLocaleString('en-US')} -> ~${Math.ceil(st.target / st.avgWholesale)} paczek hurt / ~${Math.ceil(st.target / st.avgNpc)} NPC`
    : '';
  console.log(
    `   - ${st.key.padEnd(24)} (${String(st.count).padStart(2)} poz.): śr. ${st.avgWholesale.toFixed(1)} / ${st.avgNpc.toFixed(1)} monet${targetStr}`
  );
}
