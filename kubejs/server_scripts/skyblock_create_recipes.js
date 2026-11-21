// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Receptury Pure-Create Skyblock (bez Ex Deorum / Ex Nihilo)
// Platforma: Minecraft 1.21.1 | NeoForge | Create 6.x | KubeJS 7
//
// Cel skryptu:
// Uzupełnienie naturalnych luk surowcowych Skyblocka w 100% przez maszyny Create
// (Mixing, Compacting, Crushing, Splashing, Haunting) — bez sit i bez magii.
//
// UWAGA DO WERYFIKACJI I BALANSU (Issue #4 — z agentem partnerskim):
// - Sprawdzić dokładny schemat JSON receptur Create 6.0.x na Minecraft 1.21.1
//   (w MC 1.21.1 NeoForge część wyników używa klucza `"id"` zamiast `"item"` oraz
//   płynów jako `{ "type": "fluid_stack", "fluid": "...", "amount": ... }` w Create 6).
// - Dostroić szanse (`chance`) i ilości po pierwszych playtestach na Exaroton,
//   aby żadna maszyna nie była zbyt tania ani zbyt wolna.
// ============================================================================

ServerEvents.recipes((event) => {
  // --------------------------------------------------------------------------
  // 1. Wczesny Andezyt (Stage 0) — alternatywa obok Mechanical Extruder
  //    Gravel + Flint + woda -> Andesite (Mixing, bez podgrzewania)
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:mixing',
      ingredients: [
        { item: 'minecraft:gravel' },
        { item: 'minecraft:flint' },
        { type: 'fluid_stack', fluid: 'minecraft:water', amount: 250 }
      ],
      results: [{ id: 'minecraft:andesite', count: 2 }]
    })
    .id('halucynacje:create/mixing/skyblock_andesite');

  // --------------------------------------------------------------------------
  // 2. Veridium -> ścieżka Miedzi (Stage 0-1)
  //    Mielenie Veridium w Create daje Crushed Raw Copper.
  //    TODO (balans): Dostroić koszt w glinie/piasku po testach linii miedzianej.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:compacting',
      ingredients: [
        { item: 'minecraft:gravel' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:sand' },
        { type: 'fluid_stack', fluid: 'minecraft:water', amount: 250 }
      ],
      results: [{ id: 'create:veridium', count: 2 }]
    })
    .id('halucynacje:create/compacting/skyblock_veridium');

  // --------------------------------------------------------------------------
  // 3. Asurine -> ścieżka Cynku (Stage 1, pod Brass Age)
  //    Mielenie Asurine w Crushing Wheels daje Crushed Raw Zinc + Zinc Nuggets.
  //    TODO (balans): Sprawdzić, czy wymagać podgrzewania `heated` czy zostawić
  //    bez grzania dla płynnego wejścia w Stage 1.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:compacting',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:flint' },
        { type: 'fluid_stack', fluid: 'minecraft:water', amount: 250 }
      ],
      results: [{ id: 'create:asurine', count: 1 }]
    })
    .id('halucynacje:create/compacting/skyblock_asurine');

  // --------------------------------------------------------------------------
  // 4. Crimsite -> wydajna ścieżka Żelaza w mid-game (Stage 1-2)
  //    Pozwala przejść z samego płukania żwiru na skalowalną fabrykę Crushing Wheels.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:red_sand' },
        { type: 'fluid_stack', fluid: 'minecraft:lava', amount: 100 }
      ],
      results: [{ id: 'create:crimsite', count: 2 }]
    })
    .id('halucynacje:create/mixing/skyblock_crimsite');

  // --------------------------------------------------------------------------
  // 5. Ochrum -> wydajna ścieżka Złota w mid-game (Stage 1-2)
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'minecraft:sandstone' },
        { item: 'minecraft:terracotta' },
        { type: 'fluid_stack', fluid: 'minecraft:lava', amount: 100 }
      ],
      results: [{ id: 'create:ochrum', count: 2 }]
    })
    .id('halucynacje:create/mixing/skyblock_ochrum');

  // --------------------------------------------------------------------------
  // 6. Netherrack przed odblokowaniem Netheru (Stage 1 — pod Cinder Flour i Empty Blaze Burner)
  //    Celowo wymaga małej ilości lawy, aby po odblokowaniu Netheru (Stage 2)
  //    ekspedycje nadal były dużo bardziej opłacalne.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:mixing',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:red_sand' },
        { type: 'fluid_stack', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [{ id: 'minecraft:netherrack', count: 1 }]
    })
    .id('halucynacje:create/mixing/skyblock_netherrack');

  // --------------------------------------------------------------------------
  // 7. Wczesne źródło Cynku i Miedzi przez płukanie (Bulk Washing — Stage 0-1)
  //    Uzupełnia sytuację przed zbudowaniem pierwszych Crushing Wheels.
  //    TODO (balans): Uzgodnić z partnerem czy zostawić płukanie Tuff/Deepslate
  //    czy oprzeć cynk w 100% na Asurine + Millstone.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:splashing',
      ingredients: [{ item: 'minecraft:tuff' }],
      results: [
        { id: 'create:zinc_nugget', count: 1, chance: 0.25 },
        { id: 'create:copper_nugget', count: 1, chance: 0.25 },
        { id: 'minecraft:flint', count: 1, chance: 0.15 }
      ]
    })
    .id('halucynacje:create/splashing/skyblock_tuff_nuggets');

  // --------------------------------------------------------------------------
  // 8. Kruszenie Asurine i Veridium w Millstone (wczesny dostęp przed Crushing Wheels)
  //    Niższa wydajność niż w Crushing Wheels, aby motywować do ulepszenia fabryki.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:milling',
      processing_time: 250,
      ingredients: [{ item: 'create:asurine' }],
      results: [
        { id: 'create:zinc_nugget', count: 2 },
        { id: 'create:zinc_nugget', count: 1, chance: 0.5 }
      ]
    })
    .id('halucynacje:create/milling/skyblock_asurine_early');

  event
    .custom({
      type: 'create:milling',
      processing_time: 250,
      ingredients: [{ item: 'create:veridium' }],
      results: [
        { id: 'create:copper_nugget', count: 2 },
        { id: 'create:copper_nugget', count: 1, chance: 0.5 }
      ]
    })
    .id('halucynacje:create/milling/skyblock_veridium_early');
});
