// priority: 0
// ============================================================================
// HalucynacjeGTP2 — Realizacja Żetonów Etapów, Gating Wymiarów i keepInventory
// Platforma: Minecraft 1.21.1 | NeoForge | KubeJS 7
//
// Funkcje skryptu:
// 1. Wymuszenie `keepInventory = true` przy każdym załadowaniu serwera.
// 2. Realizacja `kubejs:stage_1_token`..`stage_5_token` po kliknięciu PPM
//    (zapis w persistentData gracza i serwera + gotowe haki pod FTB Teams / FTB Quests).
// 3. Soft gating wymiarów:
//    - `minecraft:the_nether` wymaga odblokowanego `stage_2` (50k monet)
//    - `minecraft:the_end` wymaga odblokowanego `stage_4` (250k monet)
//
// UWAGA DO WERYFIKACJI NA PIERWSZYM URUCHOMIENIU SERWERA 1.21.1:
// - Sprawdzić w KubeJS 7 dokładną nazwę eventu zmiany wymiaru (`PlayerEvents.changedDimension`
//   vs `EntityEvents.teleport` / `NativeEvents.onEvent('net.neoforged.neoforge.event.entity.EntityTravelToDimensionEvent', ...)`).
// - Jeśli `EntityTravelToDimensionEvent` działa z `event.setCanceled(true)`, blokada
//   zadziała jeszcze przed przejściem przez portal (najczystszy UX). Poniżej zastosowano
//   bezpieczny szkielet z opisem obu ścieżek i fallbackiem cofającym na spawn Overworlda.
// - Dodać synchronizację FTB Teams + FTB Quests po zamknięciu RFC #2 (Issue #2 i #4).
// ============================================================================

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
 * Sprawdza, czy dany etap został odblokowany przez gracza lub globalnie na serwerze.
 * TODO (Issue #4): Podłączyć docelowo pod FTB Teams, jeśli RFC #2 wybierze gating per-team.
 */
function hasUnlockedStage(player, server, stageId) {
  const playerStages = player.persistentData.getCompound('halucynacje_stages');
  if (playerStages && playerStages.getBoolean(stageId)) {
    return true;
  }

  if (server && server.persistentData) {
    const serverStages = server.persistentData.getCompound('halucynacje_stages');
    if (serverStages && serverStages.getBoolean(stageId)) {
      return true;
    }
  }

  return false;
}

/**
 * Zapisuje odblokowanie etapu w danych gracza oraz serwera.
 */
function grantStage(player, server, stageId) {
  const playerStages = player.persistentData.getCompound('halucynacje_stages');
  playerStages.putBoolean(stageId, true);
  player.persistentData.put('halucynacje_stages', playerStages);

  if (server && server.persistentData) {
    const serverStages = server.persistentData.getCompound('halucynacje_stages');
    serverStages.putBoolean(stageId, true);
    server.persistentData.put('halucynacje_stages', serverStages);
  }

  // TODO (Issue #4): Wywołać trigger zadania FTB Quests / FTB XMod Compat dla gracza/drużyny,
  // np. `server.runCommandSilent(\`ftbquests change_progress ${player.username} complete <TASK_ID>\`)`.
}

// ----------------------------------------------------------------------------
// 1. Permanentne keepInventory = true przy starcie serwera
// ----------------------------------------------------------------------------
ServerEvents.loaded((event) => {
  event.server.runCommandSilent('gamerule keepInventory true');
  console.info('[HalucynacjeGTP2] Wymuszono gamerule keepInventory = true.');
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
      .append(Text.white(' odblokował(a) '))
      .append(Text.aqua(tokenDef.label))
      .append(Text.gold(' ★'))
  );

  // Odtwórz dźwięk awansu dla graczy na serwerze
  server.runCommandSilent(
    `execute at ${player.username} run playsound minecraft:ui.toast.challenge_complete master @a ~ ~ ~ 1 1`
  );
});

// ----------------------------------------------------------------------------
// 3. Soft gating wymiarów (Nether @ Stage 2, End @ Stage 4)
// ----------------------------------------------------------------------------
// Wersja podstawowa na `PlayerEvents.changedDimension`: jeśli gracz wejdzie do
// zablokowanego wymiaru, natychmiast cofa go na spawn Overworlda z czytelną
// informacją o wymaganym Żetonie Etapu.
// TODO (Issue #4): Podczas testów na żywym NeoForge 1.21.1 rozważyć przejście na
// `NativeEvents.onEvent('net.neoforged.neoforge.event.entity.EntityTravelToDimensionEvent', ...)`
// w celu anulowania samego wejścia w portal bez ładowania docelowego wymiaru.
PlayerEvents.changedDimension((event) => {
  const { player, server } = event;
  if (!player || !server) {
    return;
  }

  const targetDim = String(player.level.dimension);
  const requirement = DIMENSION_REQUIREMENTS[targetDim];
  if (!requirement) {
    return;
  }

  if (hasUnlockedStage(player, server, requirement.stageId)) {
    return;
  }

  player.tell(
    Text.red(`[Blokada Wymiaru] Dostęp do wymiaru ${targetDim} jest zablokowany! `)
      .append(Text.yellow(`Wymagany: ${requirement.tokenName}.`))
  );

  // Bezpieczny powrót na punkt odrodzenia Overworlda (unikamy pętli w portalu)
  server.runCommandSilent(
    `execute in minecraft:overworld run tp ${player.username} 0 80 0`
  );
  // TODO (Issue #3 & #4): Zastąpić stałe koordynaty `0 80 0` faktycznym spawnem wyspy
  // drużyny ze Skyblock Builder (lub `/spawn` z FTB Essentials).
});
