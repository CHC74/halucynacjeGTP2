// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Realizacja Żetonów Etapów, Gating Wymiarów i keepInventory
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7
//
// Funkcje skryptu:
// 1. Wymuszenie `keepInventory = true` przy każdym załadowaniu serwera.
// 2. Realizacja `kubejs:stage_1_token`..`stage_5_token` po kliknięciu PPM
//    z globalnym/drużynowym współdzieleniem co-op (`halucynacje_global_stages`
//    w persistentData serwera, automatycznie synchronizowanym z graczami).
// 3. Soft gating wymiarów (dwuwarstwowy):
//    - Warstwa główna: `EntityTravelToDimensionEvent` (blokada przed przejściem
//      przez portal bez ładowania docelowego wymiaru).
//    - Warstwa zapasowa (fallback): `PlayerEvents.changedDimension` (natychmiastowy
//      powrót na Wyspę Startową `(0, 65, 0)` w Overworldzie).
//    - Wymagania: `minecraft:the_nether` -> `stage_2` (50k), `minecraft:the_end` -> `stage_4` (250k).
//
// UWAGA DO WERYFIKACJI NA PIERWSZYM URUCHOMIENIU SERWERA 1.21.1 (Issue #4):
// - [VERIFY ON 1.21.1 BOOT] Potwierdzić w logach serwera, że `NativeEvents.onEvent`
//   poprawnie rejestruje `net.neoforged.neoforge.event.entity.EntityTravelToDimensionEvent`
//   i czy `event.setCanceled(true)` zatrzymuje przejście przez portal Netheru/Endu.
// - [TODO — kolejna iteracja] Podłączyć integrację per-team `FTB Teams` oraz
//   automatyczne zaliczanie zadań `FTB Quests` po zdefiniowaniu ID questów.
// ============================================================================

const GLOBAL_STAGES_KEY = 'halucynacje_global_stages';
const PLAYER_STAGES_KEY = 'halucynacje_stages';
const PORTAL_MSG_COOLDOWN_KEY = 'halucynacje_portal_msg_tick';
const PORTAL_MSG_COOLDOWN_TICKS = 40; // 2 sekundy (zapobiega spamowi na czacie w portalu)

const STAGE_CONFIG = {
  'kubejs:stage_1_token': {
    stageId: 'stage_1',
    label: 'Etap 1: Rzemiosło i Handel',
    requiredPrevious: null
  },
  'kubejs:stage_2_token': {
    stageId: 'stage_2',
    label: 'Etap 2: Ekspansja i Nether',
    requiredPrevious: 'stage_1'
  },
  'kubejs:stage_3_token': {
    stageId: 'stage_3',
    label: 'Etap 3: Przemysł Ciężki',
    requiredPrevious: 'stage_2'
  },
  'kubejs:stage_4_token': {
    stageId: 'stage_4',
    label: 'Etap 4: High-Tech i End',
    requiredPrevious: 'stage_3'
  },
  'kubejs:stage_5_token': {
    stageId: 'stage_5',
    label: 'Etap 5: Imperium Tycoona',
    requiredPrevious: 'stage_4'
  }
};

const ALL_STAGE_IDS = ['stage_1', 'stage_2', 'stage_3', 'stage_4', 'stage_5'];

// Deterministyczna mapa ID tasków `type: "custom"` z `config/ftbquests/README.md` (PR #12).
// [VERIFY ON 1.21.1 BOOT]: Potwierdzić działanie komendy `ftbquests change_progress <gracz> complete <task_id>`.
const FTB_QUEST_STAGE_TASK_IDS = {
  stage_1: 'C100000000000102',
  stage_2: 'C200000000000102',
  stage_3: 'C300000000000102',
  stage_4: 'C400000000000102',
  stage_5: 'C500000000000102'
};

const DIMENSION_REQUIREMENTS = {
  'minecraft:the_nether': {
    stageId: 'stage_2',
    tokenName: 'Żeton Etapu 2: Ekspansja i Nether (50 000 monet)'
  },
  'minecraft:the_end': {
    stageId: 'stage_4',
    tokenName: 'Żeton Etapu 4: High-Tech i End (250 000 monet)'
  }
};

/**
 * Normalizuje dowolną reprezentację wymiaru z KubeJS 7 / NeoForge 1.21.1
 * do kanonicznego formatu `namespace:path` (np. `'minecraft:the_nether'`).
 * Obsługuje:
 * - obiekty ResourceKey z metodą `.location()`,
 * - stringi postaci `ResourceKey[minecraft:dimension / minecraft:the_nether]`,
 * - czyste stringi `'minecraft:the_nether'`.
 */
function normalizeDimensionId(dimLike) {
  if (!dimLike) {
    return '';
  }

  try {
    if (typeof dimLike.location === 'function') {
      return String(dimLike.location()).trim();
    }
  } catch (e) {
    // Fallback na konwersję tekstową poniżej
  }

  const raw = String(dimLike).trim();
  const rkMatch = raw.match(/\/\s*([a-z0-9_.-]+:[a-z0-9_./-]+)\s*\]/i);
  if (rkMatch && rkMatch[1]) {
    return rkMatch[1].trim();
  }

  return raw;
}

/**
 * Bezpiecznie wyciąga kanoniczne ID wymiaru z obiektu `level` (KubeJS 7 / NeoForge 1.21.1).
 */
function getDimensionId(level) {
  if (!level) {
    return '';
  }

  try {
    if (level.dimensionKey) {
      return normalizeDimensionId(level.dimensionKey);
    }
  } catch (e) {
    // Przejdź do kolejnych wariantów
  }

  try {
    if (typeof level.dimension === 'function') {
      return normalizeDimensionId(level.dimension());
    }
    if (level.dimension) {
      return normalizeDimensionId(level.dimension);
    }
  } catch (e) {
    // Ignoruj i zwróć pusty string
  }

  return '';
}

/**
 * Sprawdza, czy dany etap został odblokowany globalnie (co-op) lub na koncie gracza.
 */
function hasUnlockedStage(player, server, stageId) {
  if (server && server.persistentData) {
    const globalStages = server.persistentData.getCompound(GLOBAL_STAGES_KEY);
    if (globalStages && globalStages.getBoolean(stageId)) {
      return true;
    }

    // Zgodność wsteczna ze starym kluczem serwerowym z PR #1
    const legacyServerStages = server.persistentData.getCompound(PLAYER_STAGES_KEY);
    if (legacyServerStages && legacyServerStages.getBoolean(stageId)) {
      return true;
    }
  }

  if (player && player.persistentData) {
    const playerStages = player.persistentData.getCompound(PLAYER_STAGES_KEY);
    if (playerStages && playerStages.getBoolean(stageId)) {
      return true;
    }
  }

  return false;
}

/**
 * Zalicza odpowiadający task typu `custom` w księdze `FTB Quests` dla gracza/drużyny.
 */
function completeFtbQuestStageTask(player, server, stageId) {
  if (!player || !server || !stageId) {
    return;
  }
  const taskId = FTB_QUEST_STAGE_TASK_IDS[stageId];
  if (!taskId) {
    return;
  }
  server.runCommandSilent(`ftbquests change_progress ${player.username} complete ${taskId}`);
}

/**
 * Synchronizuje wszystkie odblokowane globalnie etapy co-op na persistentData gracza
 * oraz uzupełnia odpowiadające taski w `FTB Quests` (np. gdy gracz dołączy później).
 */
function syncGlobalStagesToPlayer(player, server) {
  if (!player || !server || !server.persistentData || !player.persistentData) {
    return;
  }

  const globalStages = server.persistentData.getCompound(GLOBAL_STAGES_KEY);
  const playerStages = player.persistentData.getCompound(PLAYER_STAGES_KEY);
  let changed = false;

  ALL_STAGE_IDS.forEach((stageId) => {
    if (globalStages && globalStages.getBoolean(stageId) && !playerStages.getBoolean(stageId)) {
      playerStages.putBoolean(stageId, true);
      completeFtbQuestStageTask(player, server, stageId);
      changed = true;
    }
  });

  if (changed) {
    player.persistentData.put(PLAYER_STAGES_KEY, playerStages);
  }
}

/**
 * Zapisuje odblokowanie etapu w globalnych danych co-op serwera, synchronizuje
 * wszystkich zalogowanych graczy i zalicza task milowy w `FTB Quests`.
 */
function grantStage(player, server, stageId) {
  if (server && server.persistentData) {
    const globalStages = server.persistentData.getCompound(GLOBAL_STAGES_KEY);
    globalStages.putBoolean(stageId, true);
    server.persistentData.put(GLOBAL_STAGES_KEY, globalStages);

    // Synchronizuj wszystkich aktywnych graczy co-op na serwerze
    if (server.players) {
      server.players.forEach((onlinePlayer) => {
        syncGlobalStagesToPlayer(onlinePlayer, server);
      });
    }
  }

  if (player && player.persistentData) {
    const playerStages = player.persistentData.getCompound(PLAYER_STAGES_KEY);
    playerStages.putBoolean(stageId, true);
    player.persistentData.put(PLAYER_STAGES_KEY, playerStages);
  }

  // Zaliczenie taska w FTB Quests (w drużynie FTB Teams rozpropaguje się na cały zespół)
  completeFtbQuestStageTask(player, server, stageId);
}

/**
 * Wysyła komunikat o blokadzie wymiaru z krótkim cooldownem (ochrona przed spamem w portalu).
 */
function notifyDimensionLocked(player, targetDim, requirement) {
  if (!player) {
    return;
  }

  const currentTick = Number(player.age || 0);
  const lastTick = player.persistentData
    ? Number(player.persistentData.getInt(PORTAL_MSG_COOLDOWN_KEY) || 0)
    : 0;

  if (currentTick > 0 && lastTick > 0 && currentTick - lastTick < PORTAL_MSG_COOLDOWN_TICKS) {
    return;
  }

  if (player.persistentData && currentTick > 0) {
    player.persistentData.putInt(PORTAL_MSG_COOLDOWN_KEY, currentTick);
  }

  player.tell(
    Text.red(`[Blokada Wymiaru] Dostęp do wymiaru ${targetDim} jest zablokowany! `)
      .append(Text.yellow(`Wymagany: ${requirement.tokenName}.`))
  );
}

// ----------------------------------------------------------------------------
// 1. Permanentne keepInventory = true przy starcie serwera
// ----------------------------------------------------------------------------
ServerEvents.loaded((event) => {
  event.server.runCommandSilent('gamerule keepInventory true');
  console.info('[HalucynacjeGTP2] Wymuszono gamerule keepInventory = true.');
});

// ----------------------------------------------------------------------------
// 1b. Synchronizacja globalnych etapów co-op przy logowaniu gracza
// ----------------------------------------------------------------------------
PlayerEvents.loggedIn((event) => {
  if (!event.player || !event.server) {
    return;
  }
  syncGlobalStagesToPlayer(event.player, event.server);
});

// ----------------------------------------------------------------------------
// 2. Realizacja Żetonów Etapów (PPM)
// ----------------------------------------------------------------------------
ItemEvents.rightClicked((event) => {
  const { item, player, server } = event;
  if (!player || !server || player.level.isClientSide()) {
    return;
  }

  const tokenDef = STAGE_CONFIG[item.id];
  if (!tokenDef) {
    return;
  }

  if (hasUnlockedStage(player, server, tokenDef.stageId)) {
    player.tell(
      Text.yellow(`[Progresja] ${tokenDef.label} jest już odblokowany! Żeton nie został zużyty.`)
    );
    event.cancel();
    return;
  }

  if (tokenDef.requiredPrevious && !hasUnlockedStage(player, server, tokenDef.requiredPrevious)) {
    player.tell(
      Text.red(
        `[Progresja] Najpierw musisz odblokować poprzedni etap (${tokenDef.requiredPrevious}), zanim aktywujesz ${tokenDef.label}.`
      )
    );
    event.cancel();
    return;
  }

  grantStage(player, server, tokenDef.stageId);

  if (!player.isCreative()) {
    item.shrink(1);
  }

  server.tell(
    Text.gold('★ ')
      .append(Text.green(`${player.username}`))
      .append(Text.white(' odblokował(a) dla całej drużyny '))
      .append(Text.aqua(tokenDef.label))
      .append(Text.gold(' ★'))
  );

  // Odtwórz dźwięk awansu dla graczy na serwerze
  server.runCommandSilent(
    `execute at ${player.username} run playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1 1`
  );
});

// ----------------------------------------------------------------------------
// 3a. Soft gating wymiarów — WARSTWA GŁÓWNA (EntityTravelToDimensionEvent)
//     Anuluje wejście w portal jeszcze przed załadowaniem docelowego wymiaru.
// ----------------------------------------------------------------------------
if (typeof NativeEvents !== 'undefined') {
  try {
    NativeEvents.onEvent(
      'net.neoforged.neoforge.event.entity.EntityTravelToDimensionEvent',
      (event) => {
        const entity = event.entity;
        if (!entity || !entity.isPlayer || !entity.isPlayer()) {
          return;
        }
        if (entity.level && entity.level.isClientSide && entity.level.isClientSide()) {
          return;
        }

        const targetDim = normalizeDimensionId(
          typeof event.getDimension === 'function' ? event.getDimension() : event.dimension
        );
        const requirement = DIMENSION_REQUIREMENTS[targetDim];
        if (!requirement) {
          return;
        }

        const server = entity.server || (entity.level && entity.level.server);
        if (hasUnlockedStage(entity, server, requirement.stageId)) {
          return;
        }

        notifyDimensionLocked(entity, targetDim, requirement);
        event.setCanceled(true);
      }
    );
    console.info('[HalucynacjeGTP2] Zarejestrowano główny gating wymiarów (EntityTravelToDimensionEvent).');
  } catch (err) {
    console.warn(
      `[HalucynacjeGTP2] Nie udało się zarejestrować EntityTravelToDimensionEvent (${err}); aktywny pozostaje fallback PlayerEvents.changedDimension.`
    );
  }
}

// ----------------------------------------------------------------------------
// 3b. Soft gating wymiarów — WARSTWA ZAPASOWA (PlayerEvents.changedDimension)
//     Działa niezależnie od metody teleportu (portale, komendy, Waystones).
// ----------------------------------------------------------------------------
PlayerEvents.changedDimension((event) => {
  const { player, server } = event;
  if (!player || !server) {
    return;
  }

  const targetDim = getDimensionId(player.level);
  const requirement = DIMENSION_REQUIREMENTS[targetDim];
  if (!requirement) {
    return;
  }

  if (hasUnlockedStage(player, server, requirement.stageId)) {
    return;
  }

  notifyDimensionLocked(player, targetDim, requirement);

  // Bezpieczny powrót na płytę Wyspy Startowej Overworlda (zgodnie z docs/ISLAND_DESIGN.md: 0, 65, 0)
  // TODO (Issue #4 — kolejna iteracja): Zastąpić fallback `(0, 65, 0)` dynamicznym spawnem
  // wyspy drużyny z Skyblock Builder / FTB Essentials (`/spawn`), jeśli zagra wiele drużyn.
  server.runCommandSilent(
    `execute in minecraft:overworld run tp ${player.username} 0 65 0`
  );
});
