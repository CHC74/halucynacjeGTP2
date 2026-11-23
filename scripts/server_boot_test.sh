#!/usr/bin/env bash
# ============================================================================
# HalucynacjeGTP2 — Smoke test rozruchu prawdziwego serwera NeoForge 1.21.1
#
# Uruchamiany automatycznie w CI (`.github/workflows/ci.yml`, job `server-boot`)
# oraz lokalnie przez:
#   bash scripts/server_boot_test.sh
#
# Co weryfikuje:
#   1. Instalację NeoForge (wersja z `packwiz/pack.toml`) z cache (`--installServer`).
#   2. Komplet 55/55 serwerowych JAR-ów z `scripts/export_server_pack.mjs` (z cache
#      kluczowanym hashem SHA-256 pliku `packwiz/index.toml`).
#   3. Zawsze świeże kopie `config/`, `defaultconfigs/` i `kubejs/` z bieżącego checkoutu repo.
#   4. Pełny rozruch świata `level-type=skyblockbuilder\:skyblock` (`eula=true`,
#      `online-mode=false`, `-Xmx4G`) aż do komunikatu `Done (` w logu.
#   5. Wykonanie komend smoke-testowych przez stdin konsoli:
#      - `halucynacje_reload_economy`
#      - `halucynacje_sync_shoppers`
#      - `halucynacje_sync_stages`
#      - `halucynacje_test_export_dock` + `forceload query 152 0` (weryfikacja Doku Eksportowego #89)
#      - `stop` (czyste zamknięcie z kodem wyjścia 0).
#   6. Twardą weryfikację logów:
#      - brak błędów `ERROR` / `[ERR]` / wyjątków Rhino w `logs/kubejs/startup.log`,
#        `logs/kubejs/server.log` oraz wpisów KubeJS w `logs/latest.log`,
#      - brak ostrzeżeń o fallbackach (`Nie udało się`, `Fallback komendowy`),
#      - brak regresji `ArrowFunction(` oraz `Unknown event`,
#      - obecność potwierdzeń uruchomienia KubeJS i wszystkich 3 komend konsolowych.
#   7. Audyt ścieżek i wartości konfiguracji modów po `stop` (#80):
#      - wykrywanie nowo wygenerowanych / zduplikowanych plików konfiguracyjnych
#        w `config/`, `defaultconfigs/` i `world/serverconfig/`,
#      - asercje aktywnych wartości zapisanych przez serwer dla: FTB Chunks,
#        FTB Essentials, Sophisticated Storage (`config/sophisticatedstorage-server.toml`),
#        Shoppers, Carry On, Lightman's Currency oraz Jade.
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

# ----------------------------------------------------------------------------
# Konfiguracja (nadpisywalna przez zmienne środowiskowe)
# ----------------------------------------------------------------------------
if [ -z "${NEOFORGE_VERSION:-}" ]; then
  NEOFORGE_VERSION="$(sed -n 's/^neoforge[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "${REPO_ROOT}/packwiz/pack.toml" | head -n 1)"
fi
if [ -z "${NEOFORGE_VERSION}" ]; then
  echo "❌ Nie udało się odczytać wersji NeoForge z packwiz/pack.toml!" >&2
  exit 1
fi

BOOT_WORK_DIR="${BOOT_WORK_DIR:-/tmp/halucynacje-server-boot}"
CACHE_DIR="${CACHE_DIR:-${HOME}/.cache/halucynacje-server-boot}"
LOG_EXPORT_DIR="${LOG_EXPORT_DIR:-${BOOT_WORK_DIR}/exported-logs}"
BOOT_TIMEOUT_SECONDS="${BOOT_TIMEOUT_SECONDS:-600}"
STOP_TIMEOUT_SECONDS="${STOP_TIMEOUT_SECONDS:-90}"
SERVER_XMS="${SERVER_XMS:-1G}"
SERVER_XMX="${SERVER_XMX:-4G}"

UNIX_ARGS_REL="libraries/net/neoforged/neoforge/${NEOFORGE_VERSION}/unix_args.txt"
NEOFORGE_INSTALLER_URL="https://maven.neoforged.net/releases/net/neoforged/neoforge/${NEOFORGE_VERSION}/neoforge-${NEOFORGE_VERSION}-installer.jar"

SERVER_PID=""
FD3_OPEN=0
CONSOLE_FIFO=""
CONSOLE_LOG="${BOOT_WORK_DIR}/console.log"
LOGS_EXPORTED=0

sha256_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | awk '{print $1}'
  elif command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    python3 -c 'import hashlib, sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$1"
  fi
}

export_logs() {
  if [ "${LOGS_EXPORTED}" -eq 1 ]; then
    return 0
  fi
  LOGS_EXPORTED=1
  mkdir -p "${LOG_EXPORT_DIR}"
  if [ -d "${BOOT_WORK_DIR}/logs" ]; then
    rm -rf "${LOG_EXPORT_DIR}/logs"
    cp -a "${BOOT_WORK_DIR}/logs" "${LOG_EXPORT_DIR}/logs" || true
  fi
  if [ -f "${CONSOLE_LOG}" ]; then
    cp -a "${CONSOLE_LOG}" "${LOG_EXPORT_DIR}/console.log" || true
  fi
  if [ -d "${BOOT_WORK_DIR}/crash-reports" ]; then
    rm -rf "${LOG_EXPORT_DIR}/crash-reports"
    cp -a "${BOOT_WORK_DIR}/crash-reports" "${LOG_EXPORT_DIR}/crash-reports" || true
  fi
  # Eksport tekstowych configów po rozruchu (diagnostyka CI przy ewentualnej niezgodności #80)
  rm -rf "${LOG_EXPORT_DIR}/configs-after-boot"
  mkdir -p "${LOG_EXPORT_DIR}/configs-after-boot"
  for cfg_sub in "config" "defaultconfigs" "world/serverconfig"; do
    if [ -d "${BOOT_WORK_DIR}/${cfg_sub}" ]; then
      python3 - "${BOOT_WORK_DIR}/${cfg_sub}" "${LOG_EXPORT_DIR}/configs-after-boot/${cfg_sub}" <<'PY' || true
import os, shutil, sys
src_root, dst_root = sys.argv[1], sys.argv[2]
allowed_ext = (".snbt", ".toml", ".txt", ".json", ".json5", ".properties", ".cfg")
for root, _, files in os.walk(src_root):
    for fn in files:
        if fn.lower().endswith(allowed_ext):
            src = os.path.join(root, fn)
            rel = os.path.relpath(src, src_root)
            dst = os.path.join(dst_root, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copy2(src, dst)
PY
    fi
  done
}

cleanup() {
  local exit_code=$?
  if [ "${FD3_OPEN}" -eq 1 ]; then
    exec 3>&- || true
    FD3_OPEN=0
  fi
  if [ -n "${SERVER_PID}" ] && kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill -TERM "${SERVER_PID}" 2>/dev/null || true
    sleep 2
    kill -KILL "${SERVER_PID}" 2>/dev/null || true
  fi
  if [ -n "${CONSOLE_FIFO}" ] && [ -p "${CONSOLE_FIFO}" ]; then
    rm -f "${CONSOLE_FIFO}" || true
  fi
  export_logs || true
  exit "${exit_code}"
}
trap cleanup EXIT

# ----------------------------------------------------------------------------
# 1. Preflight (Java 21 + Node.js)
# ----------------------------------------------------------------------------
echo "============================================================================"
echo "🚀 HalucynacjeGTP2 — Smoke test rozruchu serwera NeoForge ${NEOFORGE_VERSION}"
echo "   REPO_ROOT            = ${REPO_ROOT}"
echo "   BOOT_WORK_DIR        = ${BOOT_WORK_DIR}"
echo "   CACHE_DIR            = ${CACHE_DIR}"
echo "   LOG_EXPORT_DIR       = ${LOG_EXPORT_DIR}"
echo "   SERVER_XMS/XMX       = ${SERVER_XMS} / ${SERVER_XMX}"
echo "   BOOT_TIMEOUT_SECONDS = ${BOOT_TIMEOUT_SECONDS}s"
echo "============================================================================"

if ! command -v java >/dev/null 2>&1; then
  echo "❌ Brak komendy 'java' w PATH! Wymagana Java 21 (Eclipse Temurin)." >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo "❌ Brak komendy 'node' w PATH! Wymagany Node.js 22." >&2
  exit 1
fi
if ! command -v python3 >/dev/null 2>&1; then
  echo "❌ Brak komendy 'python3' w PATH! Wymagany Python 3.11+ (tomllib + audyt configów)." >&2
  exit 1
fi

JAVA_VERSION_RAW="$(java -version 2>&1 | head -n 1)"
JAVA_MAJOR="$(java -version 2>&1 | sed -n 's/.*version "\([0-9][0-9]*\).*/\1/p' | head -n 1)"
echo "☕ Wykryta Java: ${JAVA_VERSION_RAW} (major=${JAVA_MAJOR:-unknown})"
if [ -n "${JAVA_MAJOR}" ] && [ "${JAVA_MAJOR}" -lt 21 ]; then
  echo "❌ NeoForge ${NEOFORGE_VERSION} (MC 1.21.1) wymaga Java 21+, wykryto Java ${JAVA_MAJOR}!" >&2
  exit 1
fi

mkdir -p "${CACHE_DIR}"

# ----------------------------------------------------------------------------
# 2. Cache A — Instalator i biblioteki NeoForge
# ----------------------------------------------------------------------------
NEOFORGE_CACHE_DIR="${CACHE_DIR}/neoforge-${NEOFORGE_VERSION}"
if [ -f "${NEOFORGE_CACHE_DIR}/${UNIX_ARGS_REL}" ] && [ -d "${NEOFORGE_CACHE_DIR}/libraries" ]; then
  echo "✅ [CACHE HIT] NeoForge ${NEOFORGE_VERSION}: ${NEOFORGE_CACHE_DIR}"
else
  echo "⬇️  [CACHE MISS] Instaluję serwer NeoForge ${NEOFORGE_VERSION} w ${NEOFORGE_CACHE_DIR}..."
  # Usuń stare wersje NeoForge z cache, żeby nie puchł w actions/cache
  find "${CACHE_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'neoforge-*' -exec rm -rf {} +
  mkdir -p "${NEOFORGE_CACHE_DIR}"

  INSTALLER_JAR="${NEOFORGE_CACHE_DIR}/neoforge-${NEOFORGE_VERSION}-installer.jar"
  curl -fsSL --retry 3 --retry-delay 3 -o "${INSTALLER_JAR}" "${NEOFORGE_INSTALLER_URL}"

  (
    cd "${NEOFORGE_CACHE_DIR}"
    java -Djava.awt.headless=true -jar "$(basename "${INSTALLER_JAR}")" --installServer
  )

  rm -f "${NEOFORGE_CACHE_DIR}"/*.log

  if [ ! -f "${NEOFORGE_CACHE_DIR}/${UNIX_ARGS_REL}" ]; then
    echo "❌ Po --installServer brak oczekiwanego pliku ${UNIX_ARGS_REL}!" >&2
    exit 1
  fi
  echo "✅ Zainstalowano NeoForge ${NEOFORGE_VERSION} w cache."
fi

# ----------------------------------------------------------------------------
# 3. Cache B — Komplet serwerowych JAR-ów (klucz = SHA-256 packwiz/index.toml)
# ----------------------------------------------------------------------------
INDEX_HASH="$(sha256_file "${REPO_ROOT}/packwiz/index.toml")"
MODS_CACHE_DIR="${CACHE_DIR}/mods-${INDEX_HASH}"
EXPECTED_SERVER_MODS="$(node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const dir = path.join(process.argv[1], "packwiz", "mods");
  let count = 0;
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith(".pw.toml")) continue;
    const txt = fs.readFileSync(path.join(dir, f), "utf8");
    const m = txt.match(/^side\s*=\s*"([^"]+)"/m);
    const side = m ? m[1] : "both";
    if (side === "both" || side === "server") count++;
  }
  console.log(count);
' "${REPO_ROOT}")"

CACHED_JAR_COUNT=0
if [ -d "${MODS_CACHE_DIR}" ]; then
  CACHED_JAR_COUNT="$(find "${MODS_CACHE_DIR}" -maxdepth 1 -type f -name '*.jar' | wc -l | tr -d ' ')"
fi

if [ -f "${MODS_CACHE_DIR}/.complete" ] \
  && grep -qx "${INDEX_HASH}" "${MODS_CACHE_DIR}/.complete" \
  && [ "${CACHED_JAR_COUNT}" -eq "${EXPECTED_SERVER_MODS}" ]; then
  echo "✅ [CACHE HIT] ${CACHED_JAR_COUNT}/${EXPECTED_SERVER_MODS} serwerowych JAR-ów (index=${INDEX_HASH:0:12})"
  (cd "${REPO_ROOT}" && node scripts/export_server_pack.mjs --dry-run)
else
  echo "⬇️  [CACHE MISS] Pobieram i weryfikuję ${EXPECTED_SERVER_MODS} serwerowych JAR-ów przez export_server_pack.mjs..."
  (cd "${REPO_ROOT}" && node scripts/export_server_pack.mjs)

  EXPORTED_MODS_DIR="${REPO_ROOT}/dist/exaroton-server/mods"
  EXPORTED_JAR_COUNT="$(find "${EXPORTED_MODS_DIR}" -maxdepth 1 -type f -name '*.jar' | wc -l | tr -d ' ')"
  if [ "${EXPORTED_JAR_COUNT}" -ne "${EXPECTED_SERVER_MODS}" ]; then
    echo "❌ Oczekiwano ${EXPECTED_SERVER_MODS} JAR-ów w ${EXPORTED_MODS_DIR}, znaleziono ${EXPORTED_JAR_COUNT}!" >&2
    exit 1
  fi

  # Usuń stare zestawy JAR-ów z cache
  find "${CACHE_DIR}" -maxdepth 1 -mindepth 1 -type d -name 'mods-*' -exec rm -rf {} +
  mkdir -p "${MODS_CACHE_DIR}"
  cp -a "${EXPORTED_MODS_DIR}"/*.jar "${MODS_CACHE_DIR}/"
  printf '%s\n' "${INDEX_HASH}" > "${MODS_CACHE_DIR}/.complete"
  echo "✅ Zapisano ${EXPORTED_JAR_COUNT} zweryfikowanych JAR-ów w cache (${MODS_CACHE_DIR})."
fi

# ----------------------------------------------------------------------------
# 4. Przygotowanie świeżego katalogu roboczego serwera (nigdy nie cache'ujemy config/, defaultconfigs/ i kubejs/)
# ----------------------------------------------------------------------------
echo "🧹 Przygotowuję czysty katalog roboczy serwera: ${BOOT_WORK_DIR}"
rm -rf "${BOOT_WORK_DIR}"
mkdir -p "${BOOT_WORK_DIR}/mods"

ln -s "${NEOFORGE_CACHE_DIR}/libraries" "${BOOT_WORK_DIR}/libraries"
cp -a "${MODS_CACHE_DIR}"/*.jar "${BOOT_WORK_DIR}/mods/"
cp -a "${REPO_ROOT}/config" "${BOOT_WORK_DIR}/config"
if [ -d "${REPO_ROOT}/defaultconfigs" ]; then
  cp -a "${REPO_ROOT}/defaultconfigs" "${BOOT_WORK_DIR}/defaultconfigs"
else
  mkdir -p "${BOOT_WORK_DIR}/defaultconfigs"
fi
cp -a "${REPO_ROOT}/kubejs" "${BOOT_WORK_DIR}/kubejs"

# Snapshot plików konfiguracyjnych PRZED rozruchem (do wykrywania zignorowanych/duplikowanych configów #80)
PRE_BOOT_CONFIG_SNAPSHOT="${BOOT_WORK_DIR}/.pre_boot_config_files.txt"
PRE_BOOT_DEFAULTCONFIGS_SNAPSHOT="${BOOT_WORK_DIR}/.pre_boot_defaultconfigs_files.txt"
(cd "${BOOT_WORK_DIR}/config" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) > "${PRE_BOOT_CONFIG_SNAPSHOT}"
(cd "${BOOT_WORK_DIR}/defaultconfigs" && find . -type f | sed 's|^\./||' | LC_ALL=C sort) > "${PRE_BOOT_DEFAULTCONFIGS_SNAPSHOT}"

printf 'eula=true\n' > "${BOOT_WORK_DIR}/eula.txt"
cp "${REPO_ROOT}/server.properties.template" "${BOOT_WORK_DIR}/server.properties"
if grep -q '^online-mode=' "${BOOT_WORK_DIR}/server.properties"; then
  sed -i.bak 's/^online-mode=.*/online-mode=false/' "${BOOT_WORK_DIR}/server.properties"
  rm -f "${BOOT_WORK_DIR}/server.properties.bak"
else
  printf '\nonline-mode=false\n' >> "${BOOT_WORK_DIR}/server.properties"
fi

if ! grep -Fq 'level-type=skyblockbuilder\:skyblock' "${BOOT_WORK_DIR}/server.properties"; then
  echo "❌ server.properties nie zawiera level-type=skyblockbuilder\\:skyblock!" >&2
  exit 1
fi

BOOT_MOD_COUNT="$(find "${BOOT_WORK_DIR}/mods" -maxdepth 1 -type f -name '*.jar' | wc -l | tr -d ' ')"
echo "📦 Gotowe środowisko rozruchu: ${BOOT_MOD_COUNT} JAR-ów + świeże config/ + świeże defaultconfigs/ + świeże kubejs/ + eula=true + online-mode=false."

# ----------------------------------------------------------------------------
# 5. Start serwera NeoForge z FIFO dla stdin i watchdogiem rozruchu
# ----------------------------------------------------------------------------
CONSOLE_FIFO="${BOOT_WORK_DIR}/console.fifo"
mkfifo "${CONSOLE_FIFO}"
# Otwarcie read-write na FD 3 nie blokuje przed startem Javy i utrzymuje otwarty strumień stdin
exec 3<>"${CONSOLE_FIFO}"
FD3_OPEN=1

: > "${CONSOLE_LOG}"
START_EPOCH="$(date +%s)"
echo "▶️  Uruchamiam serwer NeoForge ${NEOFORGE_VERSION} (-Xms${SERVER_XMS} -Xmx${SERVER_XMX})..."

(
  cd "${BOOT_WORK_DIR}"
  exec 3>&-
  exec java \
    -Xms"${SERVER_XMS}" \
    -Xmx"${SERVER_XMX}" \
    -Djava.awt.headless=true \
    @"${UNIX_ARGS_REL}" \
    nogui
) < "${CONSOLE_FIFO}" > "${CONSOLE_LOG}" 2>&1 &
SERVER_PID=$!

BOOT_DONE=0
BOOT_TIMED_OUT=0
EXITED_EARLY=0
BOOT_ELAPSED=0
LAST_PROGRESS_PRINT=0

while true; do
  NOW_EPOCH="$(date +%s)"
  BOOT_ELAPSED="$((NOW_EPOCH - START_EPOCH))"

  if grep -Fq 'Done (' "${CONSOLE_LOG}" 2>/dev/null \
    || { [ -f "${BOOT_WORK_DIR}/logs/latest.log" ] && grep -Fq 'Done (' "${BOOT_WORK_DIR}/logs/latest.log" 2>/dev/null; }; then
    BOOT_DONE=1
    echo "✅ Serwer uruchomił się poprawnie ('Done (') po ${BOOT_ELAPSED}s!"
    break
  fi

  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    EXITED_EARLY=1
    echo "❌ Proces serwera zakończył się przedwcześnie po ${BOOT_ELAPSED}s (brak 'Done (')!"
    break
  fi

  if [ "${BOOT_ELAPSED}" -ge "${BOOT_TIMEOUT_SECONDS}" ]; then
    BOOT_TIMED_OUT=1
    echo "❌ Przekroczono limit czasu rozruchu (${BOOT_TIMEOUT_SECONDS}s) — brak 'Done ('!"
    break
  fi

  if [ "$((BOOT_ELAPSED - LAST_PROGRESS_PRINT))" -ge 20 ]; then
    LAST_PROGRESS_PRINT="${BOOT_ELAPSED}"
    LAST_LINE="$(tail -n 1 "${CONSOLE_LOG}" 2>/dev/null || true)"
    echo "⏳ [${BOOT_ELAPSED}s / ${BOOT_TIMEOUT_SECONDS}s] Ładowanie... ${LAST_LINE}"
  fi

  sleep 2
done

# ----------------------------------------------------------------------------
# 6. Komendy smoke-testowe przez stdin + czysty `stop`
# ----------------------------------------------------------------------------
STOP_TIMED_OUT=0
SERVER_EXIT_CODE=1

send_console_cmd() {
  local cmd="$1"
  if ! kill -0 "${SERVER_PID}" 2>/dev/null; then
    echo "❌ Serwer przestał działać przed wysłaniem komendy '${cmd}'!"
    return 1
  fi
  echo "💬 [stdin -> server] ${cmd}"
  printf '%s\n' "${cmd}" >&3
  return 0
}

if [ "${BOOT_DONE}" -eq 1 ]; then
  echo "⏳ Czekam 5s na ustabilizowanie ticków po 'Done ('..."
  sleep 5

  for cmd in \
    "halucynacje_reload_economy" \
    "halucynacje_sync_shoppers" \
    "halucynacje_sync_stages" \
    "halucynacje_test_export_dock forceload_on" \
    "execute in minecraft:overworld run forceload query 152 0" \
    "halucynacje_test_export_dock run" \
    "execute in minecraft:overworld run forceload query 152 0"
  do
    send_console_cmd "${cmd}" || break
    sleep 3
  done

  send_console_cmd "stop" || true

  # Zamknij FD 3, żeby proces Javy dostał czysty EOF na stdin po przetworzeniu `stop`
  exec 3>&-
  FD3_OPEN=0

  STOP_START="$(date +%s)"
  while kill -0 "${SERVER_PID}" 2>/dev/null; do
    STOP_ELAPSED="$(( $(date +%s) - STOP_START ))"
    if [ "${STOP_ELAPSED}" -ge "${STOP_TIMEOUT_SECONDS}" ]; then
      STOP_TIMED_OUT=1
      echo "❌ Serwer nie zamknął się czysto w ciągu ${STOP_TIMEOUT_SECONDS}s po komendzie 'stop' — wymuszam zatrzymanie!"
      kill -TERM "${SERVER_PID}" 2>/dev/null || true
      sleep 5
      kill -KILL "${SERVER_PID}" 2>/dev/null || true
      break
    fi
    sleep 1
  done

  set +e
  wait "${SERVER_PID}"
  SERVER_EXIT_CODE=$?
  set -e
  SERVER_PID=""
  echo "🛑 Proces serwera zakończył się z kodem wyjścia: ${SERVER_EXIT_CODE}"
else
  exec 3>&- || true
  FD3_OPEN=0
  if kill -0 "${SERVER_PID}" 2>/dev/null; then
    kill -TERM "${SERVER_PID}" 2>/dev/null || true
    sleep 5
    kill -KILL "${SERVER_PID}" 2>/dev/null || true
  fi
  set +e
  wait "${SERVER_PID}"
  SERVER_EXIT_CODE=$?
  set -e
  SERVER_PID=""
fi

# Wyeksportuj logi od razu (na wypadek porażki i pod artefakt GitHub Actions)
export_logs

# ----------------------------------------------------------------------------
# 7. Twarda weryfikacja logów KubeJS, fallbacków i komend konsolowych
# ----------------------------------------------------------------------------
echo ""
echo "============================================================================"
echo "🔍 Weryfikacja logów rozruchu (KubeJS + fallbacki + komendy)"
echo "============================================================================"

FAILURES=()

add_failure() {
  FAILURES+=("$1")
  echo "❌ FAIL: $1"
}

pass_check() {
  echo "✅ PASS: $1"
}

LATEST_LOG="${BOOT_WORK_DIR}/logs/latest.log"
KUBEJS_STARTUP_LOG="${BOOT_WORK_DIR}/logs/kubejs/startup.log"
KUBEJS_SERVER_LOG="${BOOT_WORK_DIR}/logs/kubejs/server.log"

# 7.1 Rozruch Done (
if [ "${BOOT_DONE}" -eq 1 ]; then
  pass_check "Rozruch zakończony komunikatem 'Done (' w ${BOOT_ELAPSED}s (limit ${BOOT_TIMEOUT_SECONDS}s)."
else
  add_failure "Serwer nie osiągnął komunikatu 'Done (' (timed_out=${BOOT_TIMED_OUT}, exited_early=${EXITED_EARLY}, exit_code=${SERVER_EXIT_CODE})."
fi

# 7.2 Czyste zamknięcie po `stop`
if [ "${BOOT_DONE}" -eq 1 ] && [ "${STOP_TIMED_OUT}" -eq 0 ] && [ "${SERVER_EXIT_CODE}" -eq 0 ]; then
  pass_check "Serwer zamknął się czysto po komendzie 'stop' (exit_code=0)."
else
  add_failure "Nieczyste zamknięcie serwera po 'stop' (stop_timed_out=${STOP_TIMED_OUT}, exit_code=${SERVER_EXIT_CODE})."
fi

# 7.3 Brak crash-reports
if [ -d "${BOOT_WORK_DIR}/crash-reports" ] && [ -n "$(ls -A "${BOOT_WORK_DIR}/crash-reports" 2>/dev/null)" ]; then
  add_failure "Wykryto raporty crashy w crash-reports/: $(ls "${BOOT_WORK_DIR}/crash-reports" | tr '\n' ' ')"
else
  pass_check "Brak raportów crash-reports/."
fi

# 7.4 Obecność logów KubeJS (potwierdza, że KubeJS w ogóle załadował skrypty)
if [ -s "${KUBEJS_STARTUP_LOG}" ] && [ -s "${KUBEJS_SERVER_LOG}" ]; then
  pass_check "Pliki logs/kubejs/startup.log i logs/kubejs/server.log istnieją i są niepuste."
else
  add_failure "Brak lub puste pliki logów KubeJS (startup.log / server.log) — KubeJS nie załadował skryptów!"
fi

# 7.5 Brak błędów w logs/kubejs/startup.log i logs/kubejs/server.log
KUBEJS_ERR_PATTERN='\[ERR[[:space:]]*\]|\[ERROR\]|/ERROR\]|Error in '\''|InternalError:|TypeError:|SyntaxError:|ReferenceError:|with [1-9][0-9]* error|with [1-9][0-9]* failed recipe'
for klog in "${KUBEJS_STARTUP_LOG}" "${KUBEJS_SERVER_LOG}"; do
  rel_name="${klog#${BOOT_WORK_DIR}/}"
  if [ -f "${klog}" ]; then
    MATCHES="$(grep -En "${KUBEJS_ERR_PATTERN}" "${klog}" || true)"
    if [ -n "${MATCHES}" ]; then
      add_failure "Wykryto błędy KubeJS w ${rel_name}:"
      echo "${MATCHES}" | head -n 40
    else
      pass_check "Zero błędów w ${rel_name}."
    fi
  fi
done

# 7.6 Brak błędów oznaczonych [KubeJS...] w logs/latest.log i console.log
LATEST_KUBEJS_ERR_PATTERN='(/ERROR\]|\[ERROR\]).*\[KubeJS|\[KubeJS[^]]*\].*(\[ERR|Error in '\''|InternalError:|TypeError:|SyntaxError:|ReferenceError:)|Error in '\''(server_scripts|startup_scripts):'
for slog in "${LATEST_LOG}" "${CONSOLE_LOG}"; do
  rel_name="${slog#${BOOT_WORK_DIR}/}"
  if [ -f "${slog}" ]; then
    MATCHES="$(grep -En "${LATEST_KUBEJS_ERR_PATTERN}" "${slog}" || true)"
    if [ -n "${MATCHES}" ]; then
      add_failure "Wykryto błędy KubeJS w ${rel_name}:"
      echo "${MATCHES}" | head -n 40
    else
      pass_check "Zero błędów KubeJS w ${rel_name}."
    fi
  fi
done

# 7.7 Brak ostrzeżeń o fallbackach i znanych regresji KubeJS/Rhino we wszystkich logach
ALL_LOGS=()
for cand in "${LATEST_LOG}" "${KUBEJS_STARTUP_LOG}" "${KUBEJS_SERVER_LOG}" "${CONSOLE_LOG}"; do
  [ -f "${cand}" ] && ALL_LOGS+=("${cand}")
done

for forbidden in \
  "Nie udało się" \
  "Fallback komendowy" \
  "ArrowFunction(" \
  "Unknown event"
do
  if [ "${#ALL_LOGS[@]}" -gt 0 ]; then
    MATCHES="$(grep -Fn "${forbidden}" "${ALL_LOGS[@]}" || true)"
    if [ -n "${MATCHES}" ]; then
      add_failure "Wykryto niedozwolony wzorzec '${forbidden}' w logach:"
      echo "${MATCHES}" | head -n 20
    else
      pass_check "Brak wzorca '${forbidden}' we wszystkich logach."
    fi
  fi
done

# 7.8 Pozytywna weryfikacja wykonania hooka startowego i wszystkich 3 komend smoke-testowych
SEARCH_LOGS=()
[ -f "${LATEST_LOG}" ] && SEARCH_LOGS+=("${LATEST_LOG}")
[ -f "${KUBEJS_SERVER_LOG}" ] && SEARCH_LOGS+=("${KUBEJS_SERVER_LOG}")
[ -f "${CONSOLE_LOG}" ] && SEARCH_LOGS+=("${CONSOLE_LOG}")

for expected_marker in \
  "Wymuszono gamerule keepInventory = true" \
  "Przeładowano prices.json" \
  "cen Shoppers z prices.json" \
  "Zsynchronizowano etapy co-op i taski FTB Quests" \
  "Chunk at [9, 0] in Overworld is marked for force loading" \
  "[ExportDockTest] PASS: hasChunk=true" \
  "Chunk at [9, 0] in Overworld is not marked for force loading"
do
  if [ "${#SEARCH_LOGS[@]}" -gt 0 ] && grep -Fq "${expected_marker}" "${SEARCH_LOGS[@]}"; then
    pass_check "Potwierdzono wpis w logach: '${expected_marker}'."
  else
    add_failure "Brak oczekiwanego potwierdzenia w logach: '${expected_marker}'!"
  fi
done

# 7.9 Audyt ścieżek i wartości konfiguracji modów po rozruchu (#80)
echo ""
echo "============================================================================"
echo "🔍 Audyt ścieżek i wartości konfiguracji modów po rozruchu (#80)"
echo "============================================================================"

if [ "${BOOT_DONE}" -eq 1 ]; then
  set +e
  python3 - \
    "${BOOT_WORK_DIR}" \
    "${PRE_BOOT_CONFIG_SNAPSHOT}" \
    "${PRE_BOOT_DEFAULTCONFIGS_SNAPSHOT}" \
    "${LATEST_LOG}" <<'PY'
import json
import math
import os
import re
import sys
import tomllib

boot_dir, pre_cfg_file, pre_def_file, latest_log_path = sys.argv[1:5]
cfg_dir = os.path.join(boot_dir, "config")
def_dir = os.path.join(boot_dir, "defaultconfigs")
srv_cfg_dir = os.path.join(boot_dir, "world", "serverconfig")

errors = []
passes = []


def ok(msg):
    passes.append(msg)
    print(f"✅ PASS [config-audit]: {msg}")


def fail(msg):
    errors.append(msg)
    print(f"❌ FAIL [config-audit]: {msg}")


def walk_rel(root):
    out = set()
    if not os.path.isdir(root):
        return out
    for r, _, files in os.walk(root):
        for fn in files:
            rel = os.path.relpath(os.path.join(r, fn), root).replace(os.sep, "/")
            out.add(rel)
    return out


def read_snapshot(path):
    if not os.path.isfile(path):
        return set()
    with open(path, encoding="utf-8") as f:
        return {line.strip() for line in f if line.strip()}


# ----------------------------------------------------------------------------
# Parser SNBT (FTB Library 1.21.1: komentarze `#`, grupy `{}`, listy `[]`,
# liczby z sufiksami NBT `d`/`f`/`L`/`b`/`s`, stringi w cudzysłowach)
# ----------------------------------------------------------------------------
class SNBTParser:
    def __init__(self, text):
        self.text = text
        self.n = len(text)
        self.i = 0

    def skip_ws_and_comments(self):
        while self.i < self.n:
            ch = self.text[self.i]
            if ch in " \t\r\n,":
                self.i += 1
            elif ch == "#":
                while self.i < self.n and self.text[self.i] != "\n":
                    self.i += 1
            else:
                break

    def parse(self):
        self.skip_ws_and_comments()
        val = self.parse_value()
        self.skip_ws_and_comments()
        return val

    def parse_value(self):
        self.skip_ws_and_comments()
        if self.i >= self.n:
            raise ValueError("Unexpected EOF in SNBT")
        ch = self.text[self.i]
        if ch == "{":
            return self.parse_compound()
        if ch == "[":
            return self.parse_list()
        if ch in ('"', "'"):
            return self.parse_string()
        return self.parse_atom()

    def parse_compound(self):
        assert self.text[self.i] == "{"
        self.i += 1
        obj = {}
        while True:
            self.skip_ws_and_comments()
            if self.i >= self.n:
                raise ValueError("Unterminated SNBT compound '{'")
            if self.text[self.i] == "}":
                self.i += 1
                return obj
            if self.text[self.i] in ('"', "'"):
                key = self.parse_string()
            else:
                start = self.i
                while self.i < self.n and self.text[self.i] not in " \t\r\n:{}[],#":
                    self.i += 1
                key = self.text[start:self.i]
                if not key:
                    raise ValueError(f"Expected SNBT key at offset {self.i}")
            self.skip_ws_and_comments()
            if self.i >= self.n or self.text[self.i] != ":":
                raise ValueError(f"Expected ':' after key {key!r} at offset {self.i}")
            self.i += 1
            val = self.parse_value()
            obj[key] = val

    def parse_list(self):
        assert self.text[self.i] == "["
        self.i += 1
        self.skip_ws_and_comments()
        # Obsługa nagłówka tablic typowanych NBT ([I; ...], [L; ...], [B; ...])
        if self.i + 1 < self.n and self.text[self.i] in "ILB" and self.text[self.i + 1] == ";":
            self.i += 2
        items = []
        while True:
            self.skip_ws_and_comments()
            if self.i >= self.n:
                raise ValueError("Unterminated SNBT list '['")
            if self.text[self.i] == "]":
                self.i += 1
                return items
            items.append(self.parse_value())

    def parse_string(self):
        quote = self.text[self.i]
        self.i += 1
        buf = []
        while self.i < self.n:
            ch = self.text[self.i]
            if ch == "\\":
                self.i += 1
                if self.i >= self.n:
                    raise ValueError("Unterminated escape in SNBT string")
                esc = self.text[self.i]
                buf.append({"n": "\n", "t": "\t", "r": "\r"}.get(esc, esc))
                self.i += 1
            elif ch == quote:
                self.i += 1
                return "".join(buf)
            else:
                buf.append(ch)
                self.i += 1
        raise ValueError("Unterminated SNBT string")

    def parse_atom(self):
        start = self.i
        while self.i < self.n and self.text[self.i] not in " \t\r\n,{}[]#":
            self.i += 1
        raw = self.text[start:self.i]
        if raw == "true":
            return True
        if raw == "false":
            return False
        if re.fullmatch(r"-?\d+[bBsSlL]?", raw):
            return int(re.sub(r"[bBsSlL]$", "", raw))
        if re.fullmatch(r"-?(?:\d+\.\d*|\.\d+|\d+(?:[eE][+-]?\d+)?)[fFdD]?", raw):
            return float(re.sub(r"[fFdD]$", "", raw))
        return raw


def parse_snbt_file(path):
    with open(path, encoding="utf-8") as f:
        return SNBTParser(f.read()).parse()


def parse_lc_txt_file(path):
    sections = {}
    cur = ""
    with open(path, encoding="utf-8") as f:
        for raw_line in f:
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith("[") and line.endswith("]"):
                cur = line[1:-1].strip()
                continue
            if "=" in line:
                k, v = line.split("=", 1)
                full_key = f"{cur}.{k.strip()}" if cur else k.strip()
                sections[full_key] = v.strip()
    return sections


def dig(data, dotted_key):
    cur = data
    for part in dotted_key.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None, False
        cur = cur[part]
    return cur, True


def expect_eq(label, data, dotted_key, expected):
    actual, found = dig(data, dotted_key)
    if not found:
        fail(f"{label}: brak klucza '{dotted_key}' (oczekiwano {expected!r})")
    elif isinstance(expected, float):
        if not isinstance(actual, (int, float)) or not math.isclose(float(actual), expected, rel_tol=1e-6, abs_tol=1e-6):
            fail(f"{label}: '{dotted_key}' = {actual!r} (oczekiwano {expected!r})")
    elif actual != expected or type(actual) is not type(expected):
        fail(f"{label}: '{dotted_key}' = {actual!r} ({type(actual).__name__}), oczekiwano {expected!r} ({type(expected).__name__})")


# ----------------------------------------------------------------------------
# CHECK A: Wykrywanie nowo utworzonych / zduplikowanych plików konfiguracyjnych
# ----------------------------------------------------------------------------
pre_cfg = read_snapshot(pre_cfg_file)
post_cfg = walk_rel(cfg_dir)
new_cfg = sorted(post_cfg - pre_cfg)

pre_def = read_snapshot(pre_def_file)
post_def = walk_rel(def_dir)
new_def = sorted(post_def - pre_def)

srv_cfg_files = sorted(walk_rel(srv_cfg_dir))

print(f"📄 Nowo utworzone pliki w config/ ({len(new_cfg)}):")
for f in new_cfg:
    print(f"   + config/{f}")
print(f"📄 Pliki w world/serverconfig/ ({len(srv_cfg_files)}):")
for f in srv_cfg_files:
    print(f"   * world/serverconfig/{f}")
print(f"📄 Nowo utworzone pliki w defaultconfigs/ ({len(new_def)}):")
for f in new_def:
    print(f"   + defaultconfigs/{f}")

MANAGED_PREFIXES = (
    "ftbchunks",
    "ftbessentials",
    "carryon",
    "shoppers",
    "sophisticatedstorage",
    "lightmanscurrency",
    "jade",
)


def is_managed_path(rel_path):
    low = rel_path.lower()
    base = os.path.basename(low)
    first_dir = low.split("/", 1)[0]
    return any(base.startswith(p) or first_dir.startswith(p) for p in MANAGED_PREFIXES)


# Dozwolone automatycznie tworzone pliki poboczne dla zarządzanych modów
def is_allowed_new_config_file(rel_path):
    low = rel_path.lower()
    # NeoForge ModConfigSpec.correct() tworzy kopie zapasowe `*-N.toml.bak` przy uzupełnianiu
    # komentarzy lub opcjonalnych kluczy (Check B poniżej weryfikuje, że żadna nasza wartość nie została zresetowana!)
    if re.search(r"-\d+\.toml\.bak$", low):
        return True
    # Jade na dedykowanym serwerze tworzy pliki pomocnicze pluginów
    if low in ("jade/server-plugin-overrides.json", "jade/sort-order.json"):
        return True
    # Lightman's Currency generuje pliki danych w podkatalogu lightmanscurrency/ (MasterCoinList.json, SeasonalEvents.json),
    # ale NIE może tworzyć nowych plików głównych lightmanscurrency-*.txt / .toml!
    if low.startswith("lightmanscurrency/") and not low.endswith((".txt", ".toml")):
        return True
    return False


unexpected_new_cfg = [
    f for f in new_cfg if is_managed_path(f) and not is_allowed_new_config_file(f)
]
if unexpected_new_cfg:
    fail(
        "Serwer sam wygenerował nowe pliki konfiguracyjne dla naszych modów w config/ "
        "(oznacza to złą ścieżkę lub brakujący plik w repo!): "
        + ", ".join(f"config/{f}" for f in unexpected_new_cfg)
    )
else:
    ok("Brak nieoczekiwanych/zduplikowanych plików naszych modów w config/ (żaden nasz config nie został zignorowany).")

# W world/serverconfig/ NeoForge 1.21.1 dopuszcza wyłącznie opcjonalne nadpisania per-świat.
# FTB Essentials automatycznie zapisuje tam 2-liniowy komentarz informacyjny `# File has moved!` —
# sprawdzamy, że nie zawiera on ŻADNYCH danych SNBT i że żaden inny nasz mod nie ma tam pliku!
unexpected_srv_cfg = []
for f in srv_cfg_files:
    if not is_managed_path(f):
        continue
    if f.lower() == "ftbessentials.snbt":
        full_p = os.path.join(srv_cfg_dir, f)
        with open(full_p, encoding="utf-8", errors="replace") as sf:
            non_comment = [ln.strip() for ln in sf if ln.strip() and not ln.strip().startswith("#")]
        if non_comment:
            unexpected_srv_cfg.append(f"{f} (zawiera dane zamiast samego komunikatu przekierowania!)")
    else:
        unexpected_srv_cfg.append(f)

if unexpected_srv_cfg:
    fail(
        "Wykryto nieoczekiwane pliki naszych modów w world/serverconfig/ (ryzyko nadpisania/cienia config/): "
        + ", ".join(f"world/serverconfig/{f}" for f in unexpected_srv_cfg)
    )
else:
    ok("Brak konfliktujących plików naszych modów w world/serverconfig/ (ftbessentials.snbt to wyłącznie 2-liniowa notatka przekierowania).")

# Zakaz martwych legacy ścieżek w config/
for legacy_rel in (
    "ftbchunks/ftbchunks-world.snbt",
    "ftbchunks/ftbchunks-common.snbt",
    "ftbessentials/ftbessentials.snbt",
    "jade/jade-common.json",
):
    if os.path.exists(os.path.join(cfg_dir, legacy_rel)):
        fail(f"Wykryto martwy/zignorowany plik legacy w repo: config/{legacy_rel}")

# ----------------------------------------------------------------------------
# CHECK B: Twarde asercje wartości w plikach zapisanych przez żywy serwer
# ----------------------------------------------------------------------------

# 1. FTB Chunks (`config/ftbchunks-world.snbt`)
ftb_chunks_path = os.path.join(cfg_dir, "ftbchunks-world.snbt")
if not os.path.isfile(ftb_chunks_path):
    fail("Brak pliku config/ftbchunks-world.snbt po rozruchu serwera!")
else:
    before_err = len(errors)
    fc = parse_snbt_file(ftb_chunks_path)
    expect_eq("FTB Chunks", fc, "ally_mode", "default")
    expect_eq("FTB Chunks", fc, "disable_protection", False)
    expect_eq("FTB Chunks", fc, "force_disable_minimap", True)
    expect_eq("FTB Chunks", fc, "piston_protection", True)
    expect_eq("FTB Chunks", fc, "protect_unknown_explosions", True)
    expect_eq("FTB Chunks", fc, "require_game_stage", False)
    expect_eq("FTB Chunks", fc, "claiming.max_claimed_chunks", 100)
    expect_eq("FTB Chunks", fc, "claiming.hard_team_claim_limit", 0)
    expect_eq("FTB Chunks", fc, "claiming.party_limit_mode", "largest")
    expect_eq("FTB Chunks", fc, "force_loading.max_force_loaded_chunks", 20)
    expect_eq("FTB Chunks", fc, "force_loading.force_load_mode", "default")
    expect_eq("FTB Chunks", fc, "force_loading.hard_team_force_limit", 0)
    expect_eq("FTB Chunks", fc, "fake_players.fake_players", "allow")
    expect_eq("FTB Chunks", fc, "fake_players.max_prevented_log_age", 7)
    expect_eq("FTB Chunks", fc, "team_prop_defaults.def_fake_players", True)
    expect_eq("FTB Chunks", fc, "team_prop_defaults.def_fake_player_ids", True)
    if len(errors) == before_err:
        ok("FTB Chunks (`config/ftbchunks-world.snbt`): 16/16 kluczowych wartości (100 claimów, 20 force-load, fake_players=allow, force_disable_minimap=true) załadowane i zachowane.")

# 2. FTB Essentials (`config/ftbessentials.snbt`)
ftb_ess_path = os.path.join(cfg_dir, "ftbessentials.snbt")
if not os.path.isfile(ftb_ess_path):
    fail("Brak pliku config/ftbessentials.snbt po rozruchu serwera!")
else:
    before_err = len(errors)
    fe = parse_snbt_file(ftb_ess_path)
    # Teleporty włączone + limity
    expect_eq("FTB Essentials", fe, "teleportation.home.enabled", True)
    expect_eq("FTB Essentials", fe, "teleportation.home.max", 5)
    expect_eq("FTB Essentials", fe, "teleportation.home.cooldown", 5)
    expect_eq("FTB Essentials", fe, "teleportation.home.warmup", 0)
    expect_eq("FTB Essentials", fe, "teleportation.back.enabled", True)
    expect_eq("FTB Essentials", fe, "teleportation.back.max", 5)
    expect_eq("FTB Essentials", fe, "teleportation.back.cooldown", 10)
    expect_eq("FTB Essentials", fe, "teleportation.back.warmup", 0)
    expect_eq("FTB Essentials", fe, "teleportation.tpa.enabled", True)
    expect_eq("FTB Essentials", fe, "teleportation.tpa.cooldown", 5)
    expect_eq("FTB Essentials", fe, "teleportation.spawn.enabled", True)
    expect_eq("FTB Essentials", fe, "teleportation.spawn.cooldown", 5)
    expect_eq("FTB Essentials", fe, "teleportation.warp.enabled", True)
    expect_eq("FTB Essentials", fe, "teleportation.warp.cooldown", 5)
    # Teleporty wyłączone
    expect_eq("FTB Essentials", fe, "teleportation.rtp.enabled", False)
    expect_eq("FTB Essentials", fe, "teleportation.jump.enabled", False)
    # Komendy admin/cheat wyłączone
    for adm_cmd in ("fly", "god", "heal", "feed", "extinguish", "speed"):
        expect_eq("FTB Essentials", fe, f"admin.{adm_cmd}.enabled", False)
    # Komendy misc (przenośne stanowiska/trashcan wyłączone, kosmetyczne włączone)
    for misc_off in ("anvil", "crafting", "enderchest", "smithing", "stonecutter", "trashcan", "kickme", "near"):
        expect_eq("FTB Essentials", fe, f"misc.{misc_off}.enabled", False)
    for misc_on in ("hat", "nick", "leaderboard", "rec"):
        expect_eq("FTB Essentials", fe, f"misc.{misc_on}.enabled", True)
    if len(errors) == before_err:
        ok("FTB Essentials (`config/ftbessentials.snbt`): wszystkie 34 sprawdzane ustawienia (home max=5, tpa/spawn/back/warp ON, rtp/jump/admin/przenośne stoły OFF) załadowane i zachowane.")

# 3. Sophisticated Storage (`config/sophisticatedstorage-server.toml` + `config/sophisticatedstorage-common.toml`)
ss_srv_path = os.path.join(cfg_dir, "sophisticatedstorage-server.toml")
ss_com_path = os.path.join(cfg_dir, "sophisticatedstorage-common.toml")
if not os.path.isfile(ss_srv_path):
    fail("Brak pliku config/sophisticatedstorage-server.toml po rozruchu serwera!")
else:
    before_err = len(errors)
    with open(ss_srv_path, "rb") as f:
        ss_srv = tomllib.load(f)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.controllerRange", 15)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.tooManyItemEntityDrops", 200)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.magnetUpgrade.magnetRange", 3)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.advancedMagnetUpgrade.magnetRange", 4)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.hopperUpgrade.transferSpeedTicks", 8)
    expect_eq("Sophisticated Storage (server)", ss_srv, "server.advancedHopperUpgrade.transferSpeedTicks", 4)
    if os.path.isfile(ss_com_path):
        with open(ss_com_path, "rb") as f:
            ss_com = tomllib.load(f)
        expect_eq("Sophisticated Storage (common)", ss_com, "common.dropPacked", False)
    else:
        fail("Brak config/sophisticatedstorage-common.toml po rozruchu!")
    if len(errors) == before_err:
        ok("Sophisticated Storage (`config/sophisticatedstorage-server.toml` + `common.toml`): controllerRange=15, advancedMagnetRange=4, advancedHopperTicks=4, dropPacked=false zweryfikowane.")

# 4. Shoppers (`config/shoppers-common.toml`)
shoppers_path = os.path.join(cfg_dir, "shoppers-common.toml")
if not os.path.isfile(shoppers_path):
    fail("Brak pliku config/shoppers-common.toml po rozruchu!")
else:
    before_err = len(errors)
    with open(shoppers_path, "rb") as f:
        sh = tomllib.load(f)
    expect_eq("Shoppers", sh, "spawnRate", 200)
    expect_eq("Shoppers", sh, "maxShoppers", 10)
    expect_eq("Shoppers", sh, "spawnRadiusMin", 5.0)
    expect_eq("Shoppers", sh, "spawnRadiusMax", 15.0)
    expect_eq("Shoppers", sh, "overpriceMultiplier", 1.25)
    expect_eq("Shoppers", sh, "simulatorTickRate", 600)
    expect_eq("Shoppers", sh, "simulatorChance", 0.35)
    expect_eq("Shoppers", sh, "auctionBidChance", 0.15)
    expect_eq("Shoppers", sh, "atmSpawnChance", 0.25)
    expect_eq("Shoppers", sh, "peasant.spawnWeight", 35)
    expect_eq("Shoppers", sh, "citizen.spawnWeight", 35)
    expect_eq("Shoppers", sh, "merchant.spawnWeight", 20)
    expect_eq("Shoppers", sh, "tycoon.spawnWeight", 10)
    if len(errors) == before_err:
        ok("Shoppers (`config/shoppers-common.toml`): spawnRadius=5.0..15.0, maxShoppers=10, overpriceMultiplier=1.25, simulator=600/0.35 i 4 klasy NPC załadowane i zachowane.")

# 5. Carry On (`config/carryon-common.toml`)
carryon_path = os.path.join(cfg_dir, "carryon-common.toml")
if not os.path.isfile(carryon_path):
    fail("Brak pliku config/carryon-common.toml po rozruchu!")
else:
    before_err = len(errors)
    with open(carryon_path, "rb") as f:
        co = tomllib.load(f)
    expect_eq("Carry On", co, "settings.pickupHostileMobs", False)
    expect_eq("Carry On", co, "settings.slownessInCreative", False)
    expect_eq("Carry On", co, "settings.maxDistance", 2.5)
    tiles, tiles_found = dig(co, "blacklist.forbiddenTiles")
    if not tiles_found or not isinstance(tiles, list):
        fail("Carry On: brak listy blacklist.forbiddenTiles!")
    else:
        for required_tile in (
            "create:*",
            "railways:*",
            "create_hypertube:*",
            "mekanism:*",
            "ae2:*",
            "lightmanscurrency:*",
            "shoppers:*",
            "waystones:*",
            "sophisticatedstorage:controller",
            "ftbquests:*",
        ):
            if required_tile not in tiles:
                fail(f"Carry On: brak wymaganego wpisu {required_tile!r} w blacklist.forbiddenTiles!")
    entities, ent_found = dig(co, "blacklist.forbiddenEntities")
    if not ent_found or not isinstance(entities, list):
        fail("Carry On: brak listy blacklist.forbiddenEntities!")
    else:
        for required_ent in ("shoppers:*", "create:contraption", "create:carriage_contraption"):
            if required_ent not in entities:
                fail(f"Carry On: brak wymaganego wpisu {required_ent!r} w blacklist.forbiddenEntities!")
    if len(errors) == before_err:
        ok("Carry On (`config/carryon-common.toml`): pickupHostileMobs=false, slownessInCreative=false oraz czarna lista Create/LC/Shoppers/Mekanism/AE2/Waystones zachowane.")

# 6. Lightman's Currency (`config/lightmanscurrency-common.txt` & `config/lightmanscurrency-server.txt`)
lc_com_path = os.path.join(cfg_dir, "lightmanscurrency-common.txt")
lc_srv_path = os.path.join(cfg_dir, "lightmanscurrency-server.txt")
if not os.path.isfile(lc_com_path) or not os.path.isfile(lc_srv_path):
    fail("Brak plików config/lightmanscurrency-common.txt lub config/lightmanscurrency-server.txt!")
else:
    before_err = len(errors)
    lc_com = parse_lc_txt_file(lc_com_path)
    lc_srv = parse_lc_txt_file(lc_srv_path)
    for k, exp in (
        ("crafting.canCraftTaxCollector", "false"),
        ("crafting.coin_mint.canCraftCoinMint", "false"),
        ("crafting.coin_mint.canMint", "false"),
        ("crafting.coin_mint.canMelt", "false"),
    ):
        if lc_com.get(k) != exp:
            fail(f"Lightman's Currency (common): '{k}' = {lc_com.get(k)!r}, oczekiwano {exp!r}")
    for k, exp in (
        ("terminal.lcterminalCommand", "true"),
        ("terminal.sortUnnamedTradersToBottom", "true"),
        ("bank_accounts.forceInterest", "false"),
        ("taxes.adminOnlyActivation", "true"),
    ):
        if lc_srv.get(k) != exp:
            fail(f"Lightman's Currency (server): '{k}' = {lc_srv.get(k)!r}, oczekiwano {exp!r}")
    interest_raw = lc_srv.get("bank_accounts.interest")
    try:
        if interest_raw is None or not math.isclose(float(interest_raw), 0.0, abs_tol=1e-9):
            fail(f"Lightman's Currency (server): 'bank_accounts.interest' = {interest_raw!r}, oczekiwano 0.0")
    except ValueError:
        fail(f"Lightman's Currency (server): nieprawidłowa wartość 'bank_accounts.interest' = {interest_raw!r}")
    if len(errors) == before_err:
        ok("Lightman's Currency (`lightmanscurrency-common.txt` + `server.txt`): canMint=false, canCraftCoinMint=false, lcterminalCommand=true, interest=0.0 zweryfikowane.")

# 7. Jade (`config/jade/jade.json` + brak błędów odczytu w latest.log)
jade_path = os.path.join(cfg_dir, "jade", "jade.json")
if not os.path.isfile(jade_path):
    fail("Brak pliku config/jade/jade.json po rozruchu!")
else:
    before_err = len(errors)
    with open(jade_path, encoding="utf-8") as f:
        jade_data = json.load(f)
    expect_eq("Jade", jade_data, "general.displayMode", "TOGGLE")
    expect_eq("Jade", jade_data, "general.bossBarOverlapMode", "PUSH_DOWN")
    expect_eq("Jade", jade_data, "general.hideFromTabList", True)
    expect_eq("Jade", jade_data, "general.fluidMode", "ANY")
    expect_eq("Jade", jade_data, "general.itemModNameTooltip", True)
    if os.path.isfile(latest_log_path):
        with open(latest_log_path, encoding="utf-8", errors="replace") as lf:
            log_txt = lf.read()
        for bad_jade in ("Failed to read config file", "Failed to read server plugin config file"):
            if bad_jade in log_txt:
                fail(f"Jade zgłosił błąd odczytu konfiguracji w logs/latest.log: {bad_jade!r}")
    if len(errors) == before_err:
        ok("Jade (`config/jade/jade.json`): poprawny schemat WailaConfig.CODEC i zero błędów odczytu w logach serwera.")

if errors:
    print(f"\n❌ Audyt konfiguracji modów NIE POWIÓDŁ SIĘ ({len(errors)} niezgodności)!")
    sys.exit(1)

print(f"\n✅ Audyt konfiguracji modów zaliczony w 100% ({len(passes)}/9 sprawdzeń PASS)!")
PY
  CONFIG_AUDIT_RC=$?
  set -e
  if [ "${CONFIG_AUDIT_RC}" -ne 0 ]; then
    add_failure "Audyt ścieżek i wartości konfiguracji modów (#80) wykrył niezgodność (szczegóły powyżej oraz w ${LOG_EXPORT_DIR}/configs-after-boot/)."
  fi
else
  add_failure "Pominięto audyt konfiguracji modów (#80), ponieważ serwer nie ukończył rozruchu ('Done (')."
fi

# 7.10 Podgląd logów KubeJS dla przejrzystości w CI
echo ""
echo "---------------- logs/kubejs/startup.log ----------------"
if [ -f "${KUBEJS_STARTUP_LOG}" ]; then
  cat "${KUBEJS_STARTUP_LOG}"
else
  echo "(brak pliku)"
fi
echo "---------------- logs/kubejs/server.log -----------------"
if [ -f "${KUBEJS_SERVER_LOG}" ]; then
  cat "${KUBEJS_SERVER_LOG}"
else
  echo "(brak pliku)"
fi
echo "---------------------------------------------------------"

if [ "${#FAILURES[@]}" -gt 0 ]; then
  echo ""
  echo "❌ SMOKE TEST ROZRUCHU SERWERA NIE POWIÓDŁ SIĘ (${#FAILURES[@]} błędów)!"
  echo "📁 Pełne logi i zrzut configów wyeksportowano do: ${LOG_EXPORT_DIR}"
  if [ -f "${CONSOLE_LOG}" ]; then
    echo "---------------- Ostatnie 60 linii console.log ----------------"
    tail -n 60 "${CONSOLE_LOG}"
    echo "---------------------------------------------------------------"
  fi
  exit 1
fi

TOTAL_ELAPSED="$(( $(date +%s) - START_EPOCH ))"
echo ""
echo "🎉 SMOKE TEST ROZRUCHU SERWERA NEOFORGE ${NEOFORGE_VERSION} ZALICZONY W 100%! (czas rozruch+test+stop: ${TOTAL_ELAPSED}s)"
