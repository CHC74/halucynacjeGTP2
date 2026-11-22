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

// 3b. Walidacja centralnej sekcji market_bonuses (#79) i obliczenie maksymalnych mnożników
const mb = data.market_bonuses;
let maxEffectiveMultiplier = 1.0;
let maxRemoteMultiplier = 0.85;
if (!mb || typeof mb !== 'object') {
  errors.push('Brak wymaganej sekcji `market_bonuses` w prices.json (jedno źródło prawdy, #79).');
} else {
  const divTiers = Array.isArray(mb.diversity_tiers) ? mb.diversity_tiers : [];
  const stagePcts = Array.isArray(mb.stage_trade_bonus_percents) ? mb.stage_trade_bonus_percents : [];
  const maxDivPct = divTiers.reduce((m, t) => Math.max(m, Number(t.bonus_percent || 0)), 0);
  const maxStagePct = stagePcts.reduce((m, p) => Math.max(m, Number(p || 0)), 0);
  const dockPct = Number(mb.export_dock_bonus_percent || 0);
  const boomPct = Number(mb.market_boom_bonus_percent || 0);
  const capNonBoom = Number(mb.max_non_boom_bonus_percent || 0);
  const capCombined = Number(mb.max_combined_bonus_percent || 0);
  const remoteMult = Number(mb.remote_sell_multiplier || 0);
  const allowRemoteBonuses = Boolean(mb.remote_allows_dynamic_bonuses);

  if (!(remoteMult > 0 && remoteMult < 1)) {
    errors.push(`market_bonuses.remote_sell_multiplier musi być w (0, 1) (jest ${remoteMult}).`);
  }
  if (!(mb.diversity_min_item_value > 0)) {
    errors.push(`market_bonuses.diversity_min_item_value musi być > 0 (ochrona przed cheesem 1 sztuki, #79).`);
  }
  if (!(capNonBoom > 0) || !(capCombined >= capNonBoom)) {
    errors.push(
      `Niepoprawne limity premii: max_non_boom=${capNonBoom}, max_combined=${capCombined}.`
    );
  }

  const maxNonBoomPct = Math.min(capNonBoom, dockPct + maxDivPct + maxStagePct);
  const maxCombinedPct = Math.min(capCombined, maxNonBoomPct + boomPct);
  maxEffectiveMultiplier = 1.0 + maxCombinedPct / 100.0;
  maxRemoteMultiplier = allowRemoteBonuses ? maxEffectiveMultiplier * remoteMult : remoteMult;

  // Kryterium akceptacji #79: dla KAŻDEGO towaru sprzedaż zdalna z dowolnymi premiami < cena NPC!
  for (const [id, item] of sellById.entries()) {
    const maxRemotePrice = Math.round(item.wholesale_gui * maxRemoteMultiplier);
    if (maxRemotePrice >= item.npc_shoppers) {
      errors.push(
        `Naruszenie marży Rynku (#79) dla "${id}": maks. sprzedaż zdalna (${maxRemotePrice}, mnożnik ×${maxRemoteMultiplier.toFixed(3)}) >= cena NPC (${item.npc_shoppers}).`
      );
    }
  }
}

// 4. Walidacja katalogu Buy vs Sell (zero bezpośredniego arbitrażu buy <= sell przy maks. mnożniku, unikalne aliasy i poprawne kategorie)
const ALLOWED_BUY_CATEGORIES = new Set(['plants', 'livestock', 'skyblock', 'tech', 'prestige']);
const buyById = new Map();
for (const item of data.buy_catalog ?? []) {
  if (!(item.buy_price > 0)) {
    errors.push(`buy_catalog -> "${item.id}": buy_price musi być > 0.`);
  }
  if (buyById.has(item.id)) {
    errors.push(`Duplikat w buy_catalog: "${item.id}".`);
  }
  if (!ALLOWED_BUY_CATEGORIES.has(item.category)) {
    errors.push(
      `buy_catalog -> "${item.id}": niepoprawna kategoria "${item.category}" (dozwolone: ${[...ALLOWED_BUY_CATEGORIES].join(', ')}).`
    );
  }
  if (item.alias) {
    if (seenAliases.has(item.alias)) {
      errors.push(`Duplikat aliasu "${item.alias}" w buy_catalog.`);
    }
    seenAliases.add(item.alias);
  }
  buyById.set(item.id, item);
  const sell = sellById.get(item.id);
  const maxDirectSell = sell
    ? Math.max(Math.round(sell.wholesale_gui * maxEffectiveMultiplier), sell.npc_shoppers)
    : 0;
  if (sell && item.buy_price <= maxDirectSell) {
    errors.push(
      `Arbitraż bezpośredni dla "${item.id}": buy=${item.buy_price} <= maks. sprzedaż z premiami=${maxDirectSell} (×${maxEffectiveMultiplier.toFixed(2)}).`
    );
  }
}

// 4b. Spójność całych ciast Farmer's Delight względem 4 kawałków (1.0x..1.5x, brak anomalii 3.5x)
const piePairs = [
  ['farmersdelight:apple_pie', 'farmersdelight:apple_pie_slice'],
  ['farmersdelight:sweet_berry_cheesecake', 'farmersdelight:sweet_berry_cheesecake_slice'],
  ['farmersdelight:chocolate_pie', 'farmersdelight:chocolate_pie_slice']
];
for (const [pieId, sliceId] of piePairs) {
  const pie = sellById.get(pieId);
  const slice = sellById.get(sliceId);
  if (pie && slice) {
    const fourSlices = slice.wholesale_gui * 4;
    if (pie.wholesale_gui < fourSlices || pie.wholesale_gui > fourSlices * 1.5) {
      errors.push(
        `Niespójna wycena ciasta "${pieId}" (${pie.wholesale_gui}c) względem 4x "${sliceId}" (${fourSlices}c) — oczekiwano 1.0x–1.5x.`
      );
    }
  }
}

// 4c. Gwarancja dostępności Endu na Skyblocku (Issue #64):
//     ramy portalu i Oczy Endu muszą być dostępne w Stage 4 z limitem 12 szt./drużynę
//     i NIE mogą pojawiać się w żadnym tierze skupu (`sell_tiers`) ani w skupie NPC (`tier_0_blocked`).
const REQUIRED_END_PORTAL_ITEMS = ['minecraft:end_portal_frame', 'minecraft:ender_eye'];
for (const portalId of REQUIRED_END_PORTAL_ITEMS) {
  const buyEntry = buyById.get(portalId);
  if (!buyEntry) {
    errors.push(`Brak wymaganego elementu portalu Endu "${portalId}" w buy_catalog (Issue #64).`);
  } else {
    if (buyEntry.stage !== 4) {
      errors.push(
        `Element portalu Endu "${portalId}" musi mieć stage=4 w buy_catalog (obecnie: ${buyEntry.stage}).`
      );
    }
    if (buyEntry.team_limit !== 12) {
      errors.push(
        `Element portalu Endu "${portalId}" musi mieć team_limit=12 w buy_catalog (obecnie: ${buyEntry.team_limit}).`
      );
    }
  }
  if (sellById.has(portalId)) {
    errors.push(
      `NARUSZENIE OCHRONY EKONOMII (Issue #64): "${portalId}" nie może występować w sell_tiers!`
    );
  }
  if (!tier0Set.has(portalId)) {
    errors.push(
      `Element portalu Endu "${portalId}" powinien znajdować się w tier_0_blocked (0 monet w skupie i NPC Shoppers).`
    );
  }
}

// 5. Walidacja zadeklarowanych reguł anty-arbitrażowych przy MAKSYMALNYM mnożniku premii (#79)
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
  const maxBoostedWholesale = Math.round(out.wholesale_gui * maxEffectiveMultiplier);
  const maxSell = Math.max(maxBoostedWholesale, out.npc_shoppers);
  if (inputCost <= maxSell) {
    errors.push(
      `Ryzyko arbitrażu (${check.name}): koszt zakupu składników (${inputCost}) <= maks. sprzedaż z premiami (${maxSell} = hurt ${out.wholesale_gui} × ${maxEffectiveMultiplier.toFixed(2)} lub NPC ${out.npc_shoppers}) dla "${check.output_id}".`
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
  `✅ Walidacja ekonomii OK: ${data.stage_tokens.length} Żetonów Etapów, ${tier0Set.size} blokad Tier 0, ${sellById.size} towarów Tier 1–5, ${buyById.size} pozycji Buy, ${(data.anti_arbitrage_checks ?? []).length} reguł anty-arbitrażowych (maks. mnożnik Rynku: ×${maxEffectiveMultiplier.toFixed(2)}, maks. zdalny: ×${maxRemoteMultiplier.toFixed(2)} < NPC).`
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
