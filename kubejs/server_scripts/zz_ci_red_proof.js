// [TEMP CI RED PROOF — Issue #59, do natychmiastowego revertu po Run 2]
// Top-level `const LC_COINS` łapie już test kolizji w `test_kubejs_logic.mjs` (#60),
// więc aby dowieść, że sam job `server-boot` łapie realny błąd Rhino/KubeJS
// przechodzący przez `validate-and-build`, prowokujemy redeclaration `const LC_COINS`
// wewnątrz pętli w prawdziwym silniku Rhino 2101.2.7 na starcie serwera NeoForge:
ServerEvents.loaded((event) => {
  for (var ciProbeIdx = 0; ciProbeIdx < 2; ciProbeIdx++) {
    const LC_COINS = [];
    if (LC_COINS.length < 0) break;
  }
  if (event && event.server && typeof event.server.overworld === 'function') {
    Java.loadClass('com.halucynacje.ci.IntentionalRedProof_DuplicateConst_LC_COINS');
  }
});
