// priority: 10
// ============================================================================
// HalucynacjeGTP2 — Rejestracja Żetonów Etapów (Stage Tokens)
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7
//
// Zasoby klienckie (zweryfikowane w CI — Issue #53):
// - Tekstury 16x16 RGBA: `kubejs/assets/kubejs/textures/item/stage_1..5_token.png`
// - Modele item/generated: `kubejs/assets/kubejs/models/item/stage_1..5_token.json`
// - Polskie nazwy: `kubejs/assets/kubejs/lang/pl_pl.json`
// ============================================================================

const STAGE_TOKENS = [
  {
    id: 'stage_1_token',
    name: 'Żeton Etapu 1: Rzemiosło i Handel',
    rarity: 'uncommon',
    cost: '10 000 monet',
    unlocks: 'Gastronomia, rolnictwo zaawansowane, startowe Blaze Burnery i wyższe magazyny'
  },
  {
    id: 'stage_2_token',
    name: 'Żeton Etapu 2: Ekspansja i Nether',
    rarity: 'rare',
    cost: '50 000 monet',
    unlocks: 'Normalny Nether, kolej Steam \'n\' Rails, Hypertubes, cukiernia i elektryczność Create'
  },
  {
    id: 'stage_3_token',
    name: 'Żeton Etapu 3: Przemysł Ciężki',
    rarity: 'rare',
    cost: '100 000 monet',
    unlocks: 'Zaawansowana inżynieria, rzadkie surowce startowe AE2/Mekanism, Trading Floor'
  },
  {
    id: 'stage_4_token',
    name: 'Żeton Etapu 4: High-Tech i End',
    rarity: 'epic',
    cost: '250 000 monet',
    unlocks: 'Normalny End, pełny Applied Energistics 2 + Applied Kinetics, Mekanism & Generators'
  },
  {
    id: 'stage_5_token',
    name: 'Żeton Etapu 5: Imperium Tycoona',
    rarity: 'epic',
    cost: '1 000 000 monet',
    unlocks: 'Certyfikat Imperium Tycoona, kontrakty endgame i zamknięcie księgi FTB Quests'
  }
];

StartupEvents.registry('item', (event) => {
  STAGE_TOKENS.forEach((token) => {
    event
      .create(token.id)
      .displayName(token.name)
      .maxStackSize(1)
      .rarity(token.rarity)
      .glow(true)
      .tooltip(Text.gold(`Koszt katalogowy: ${token.cost}`))
      .tooltip(Text.aqua(`Odblokowuje: ${token.unlocks}`))
      .tooltip(Text.gray('Kliknij PPM, aby aktywować etap dla siebie i serwera/drużyny.'));
  });
});
