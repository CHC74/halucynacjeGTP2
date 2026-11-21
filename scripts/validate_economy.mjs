#!/usr/bin/env node
/**
 * HalucynacjeGTP2 — Walidator cennika i ochrony anty-arbitrażowej (RFC #5)
 *
 * Sprawdza:
 * 1. Poprawność struktury `config/halucynacje_economy/prices.json`.
 * 2. Zgodność progów Żetonów Etapów z nienegocjowalnymi zasadami (`10k / 50k / 100k / 250k / 1M`).
 * 3. Twardą blokadę Tier 0 (wszystkie surowe bloki / sztabki = 0 monet).
 * 4. Premię NPC `Shoppers` w bezpiecznym przedziale +15%..+30% względem hurtu (cel +20%).
 * 5. Brak duplikatów ID między Tier 0 a Tier 1–5 oraz brak pętli arbitrażowych (buy < sell).
 */

import fs from 'node:fs';
import path from 'node:path';

const PRICES_PATH = path.resolve('config/halucynacje_economy/prices.json');
const EXPECTED_STAGE_PRICES = [10000, 50000, 100000, 250000, 1000000];

const raw = fs.readFileSync(PRICES_PATH, 'utf8');
const data = JSON.parse(raw);

const errors = [];

// 1. Walidacja progów Żetonów Etapów (Guardrail AGENTS.md sekcja 5)
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
  });
}

// 2. Walidacja Tier 0 (Blokada surowizny)
const tier0Set = new Set();
for (const entry of data.tier_0_blocked ?? []) {
  tier0Set.add(entry.id);
  if (entry.wholesale_gui !== 0 || entry.npc_shoppers !== 0) {
    errors.push(`Tier 0 naruszenie dla "${entry.id}": ceny muszą wynosić 0.`);
  }
}
if (tier0Set.size < 10) {
  errors.push('Lista `tier_0_blocked` jest podejrzanie krótka (<10 surowców).');
}

// 3. Walidacja Tier 1–5 (marża NPC ~+20% i brak kolizji z Tier 0)
const sellById = new Map();
for (const [tierKey, tierObj] of Object.entries(data.sell_tiers ?? {})) {
  for (const item of tierObj.items ?? []) {
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
    }
    sellById.set(item.id, item);
  }
}

// 4. Walidacja katalogu Buy vs Sell (zero bezpośredniego arbitrażu buy <= sell)
const buyById = new Map();
for (const item of data.buy_catalog ?? []) {
  if (!(item.buy_price > 0)) {
    errors.push(`buy_catalog -> "${item.id}": buy_price musi być > 0.`);
  }
  buyById.set(item.id, item);
  const sell = sellById.get(item.id);
  if (sell && item.buy_price <= Math.max(sell.wholesale_gui, sell.npc_shoppers)) {
    errors.push(
      `Arbitraż bezpośredni dla "${item.id}": buy=${item.buy_price} <= sell=${Math.max(sell.wholesale_gui, sell.npc_shoppers)}.`
    );
  }
}

// 5. Walidacja zadeklarowanych reguł anty-arbitrażowych (kupione składniki >= cena sprzedaży produktu)
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
