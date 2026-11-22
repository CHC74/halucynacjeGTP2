// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Receptury Pure-Create Skyblock (bez Ex Deorum / Ex Nihilo)
// Platforma: Minecraft 1.21.1 | NeoForge | Create 6.x | KubeJS 7
//
// Cel skryptu:
// Uzupełnienie naturalnych luk surowcowych Skyblocka w 100% przez maszyny Create
// (Mechanical Extruder, Mixing, Compacting, Milling, Splashing) — bez sit i bez magii.
//
// Poprawki z review Issue #4 (`agent:partner`):
// - Domknięto generację `minecraft:tuff` (Create: Mechanical Extruder + Create Compacting),
//   dzięki czemu receptura płukania Tuff nie jest martwa w JEI.
// - Dodano wczesne ścieżki `minecraft:red_sand` (Millstone z terakoty oraz Mixing z piasku
//   i czerwonego barwnika), aby `crimsite` i `netherrack` były osiągalne w Stage 1
//   jeszcze przed zbudowaniem Crushing Wheels.
//
// Zweryfikowane bezpośrednio na prawdziwych plikach JSON z JAR-ów 1.21.1:
// - `create-1.21.1-6.0.10.jar`: składniki płynne wymagają `"type": "neoforge:single"`
//   (NIE `"fluid_stack"`!) oraz `"results": [{ "id": "...", "count": ... }]`.
// - `create_mechanical_extruder-1.21.1-2.2.2-6.0.10.jar`: format `extruding` używa
//   `blockIngredients: { first: { blocks }, second: { blocks } }` i `catalyst: { blocks }`.
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
        { type: 'neoforge:single', fluid: 'minecraft:water', amount: 250 }
      ],
      results: [{ id: 'minecraft:andesite', count: 2 }]
    })
    .id('halucynacje:create/mixing/skyblock_andesite');

  // --------------------------------------------------------------------------
  // 1b. Wczesny Czerwony Piasek (Stage 0-1 — przed Crushing Wheels!)
  //     Odblokowuje płynną ścieżkę do `crimsite` oraz wczesnego `netherrack`
  //     w Stage 1 bez konieczności budowy Mechanical Crafterów.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:milling',
      processing_time: 200,
      ingredients: [{ item: 'minecraft:terracotta' }],
      results: [{ id: 'minecraft:red_sand', count: 1 }]
    })
    .id('halucynacje:create/milling/skyblock_terracotta_to_red_sand');

  event
    .custom({
      type: 'create:mixing',
      ingredients: [
        { item: 'minecraft:sand' },
        { item: 'minecraft:red_dye' }
      ],
      results: [{ id: 'minecraft:red_sand', count: 1 }]
    })
    .id('halucynacje:create/mixing/skyblock_red_sand_dye');

  // --------------------------------------------------------------------------
  // 2. Veridium -> ścieżka Miedzi (Stage 0-1)
  //    Mielenie Veridium w Create daje Crushed Raw Copper (lub Copper Nuggets w Millstone).
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:compacting',
      ingredients: [
        { item: 'minecraft:gravel' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:sand' },
        { type: 'neoforge:single', fluid: 'minecraft:water', amount: 250 }
      ],
      results: [{ id: 'create:veridium', count: 2 }]
    })
    .id('halucynacje:create/compacting/skyblock_veridium');

  // --------------------------------------------------------------------------
  // 3. Asurine -> ścieżka Cynku (Stage 1, pod Brass Age)
  //    Mielenie Asurine w Crushing Wheels daje Crushed Raw Zinc + Zinc Nuggets.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:compacting',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:flint' },
        { type: 'neoforge:single', fluid: 'minecraft:water', amount: 250 }
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
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 100 }
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
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 100 }
      ],
      results: [{ id: 'create:ochrum', count: 2 }]
    })
    .id('halucynacje:create/mixing/skyblock_ochrum');

  // --------------------------------------------------------------------------
  // 6. Netherrack przed odblokowaniem Netheru (Stage 1 — pod Cinder Flour i Empty Blaze Burner)
  //    Celowo wymaga małej ilości lawy, aby po odblokowaniu Netheru (Stage 2)
  //    ekspedycje i pociągi-cysterny nadal były dużo bardziej opłacalne.
  // --------------------------------------------------------------------------
  event
    .custom({
      type: 'create:mixing',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:red_sand' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [{ id: 'minecraft:netherrack', count: 1 }]
    })
    .id('halucynacje:create/mixing/skyblock_netherrack');

  // --------------------------------------------------------------------------
  // 7. Generacja i płukanie Tuff (Stage 0-1 — domknięcie ścieżki z review Issue #4)
  //    7a. Create: Mechanical Extruder (woda + lawa na katalizatorze z Andezytu)
  //    7b. Alternatywna receptura Create: Compacting (gwarancja pełnej automatyzacji
  //        w czystym Create bez ryzyka martwej receptury w JEI)
  //    7c. Bulk Washing Tuff -> wczesne samorodki Cynku i Miedzi
  // --------------------------------------------------------------------------
  // Schemat zweryfikowany w `create_mechanical_extruder-1.21.1-2.2.2-6.0.10.jar`!
  event
    .custom({
      type: 'create_mechanical_extruder:extruding',
      blockIngredients: {
        first: { blocks: 'minecraft:water' },
        second: { blocks: 'minecraft:lava' }
      },
      catalyst: { blocks: 'minecraft:andesite' },
      result: { id: 'minecraft:tuff', count: 1 }
    })
    .id('halucynacje:mechanical_extruder/skyblock_tuff');

  event
    .custom({
      type: 'create:compacting',
      ingredients: [
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:cobblestone' },
        { item: 'minecraft:andesite' },
        { type: 'neoforge:single', fluid: 'minecraft:water', amount: 100 }
      ],
      results: [{ id: 'minecraft:tuff', count: 2 }]
    })
    .id('halucynacje:create/compacting/skyblock_tuff');

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

  // --------------------------------------------------------------------------
  // 9. Odnawialne łańcuchy surowych rud Mekanism w Pure-Create Skyblock (Stage 3–4, Issue #49)
  //    Produkcja surowych rud (`mekanism:raw_*`) zamiast gotowych sztabek pozwala
  //    graczom wpiąć Create prosto w 3x–5x mnożniki rud Mekanism (Enrichment /
  //    Purification / Chemical Injection / Dissolution), łącząc oba mody w jedną
  //    pętlę fabryczną! Wszystkie ID zweryfikowane w `Mekanism-1.21.1-10.7.19.85.jar`.
  // --------------------------------------------------------------------------

  // 9a. Raw Tin (Stage 3 — Heated Mixing z Veridium + Clay + Zinc + Lava)
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'create:veridium' },
        { item: 'create:veridium' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:clay_ball' },
        { item: 'create:zinc_nugget' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [
        { id: 'mekanism:raw_tin', count: 1 },
        { id: 'mekanism:raw_tin', count: 1, chance: 0.25 }
      ]
    })
    .id('halucynacje:create/mixing/skyblock_mekanism_raw_tin');

  // 9b. Raw Lead (Stage 3 — Heated Mixing z Basalt + Crimsite + Flint + Lava)
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'minecraft:basalt' },
        { item: 'minecraft:basalt' },
        { item: 'create:crimsite' },
        { item: 'create:crimsite' },
        { item: 'minecraft:flint' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [
        { id: 'mekanism:raw_lead', count: 1 },
        { id: 'mekanism:raw_lead', count: 1, chance: 0.25 }
      ]
    })
    .id('halucynacje:create/mixing/skyblock_mekanism_raw_lead');

  // 9c. Raw Osmium (Stage 3 — Heated Mixing z Asurine + Crimsite + Quartz + Lava)
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'heated',
      ingredients: [
        { item: 'create:asurine' },
        { item: 'create:asurine' },
        { item: 'create:crimsite' },
        { item: 'minecraft:quartz' },
        { item: 'minecraft:quartz' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [
        { id: 'mekanism:raw_osmium', count: 1 },
        { id: 'mekanism:raw_osmium', count: 1, chance: 0.25 }
      ]
    })
    .id('halucynacje:create/mixing/skyblock_mekanism_raw_osmium');

  // 9d. Fluorite Gem (Stage 4 — Superheated Mixing z Quartz + Glowstone + Clay + Lava)
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'superheated',
      ingredients: [
        { item: 'minecraft:quartz' },
        { item: 'minecraft:quartz' },
        { item: 'minecraft:glowstone_dust' },
        { item: 'minecraft:glowstone_dust' },
        { item: 'minecraft:clay_ball' },
        { item: 'minecraft:clay_ball' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [
        { id: 'mekanism:fluorite_gem', count: 2 },
        { id: 'mekanism:fluorite_gem', count: 1, chance: 0.5 }
      ]
    })
    .id('halucynacje:create/mixing/skyblock_mekanism_fluorite');

  // 9e. Raw Uranium (Stage 4 — Superheated Mixing z End Stone + Raw Osmium + Fluorite + Lava)
  event
    .custom({
      type: 'create:mixing',
      heat_requirement: 'superheated',
      ingredients: [
        { item: 'minecraft:end_stone' },
        { item: 'minecraft:end_stone' },
        { item: 'mekanism:raw_osmium' },
        { item: 'mekanism:fluorite_gem' },
        { type: 'neoforge:single', fluid: 'minecraft:lava', amount: 250 }
      ],
      results: [
        { id: 'mekanism:raw_uranium', count: 1 },
        { id: 'mekanism:raw_uranium', count: 1, chance: 0.35 }
      ]
    })
    .id('halucynacje:create/mixing/skyblock_mekanism_raw_uranium');
});
