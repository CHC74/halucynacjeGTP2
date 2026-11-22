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
#   3. Zawsze świeże kopie `config/` i `kubejs/` z bieżącego checkoutu repo.
#   4. Pełny rozruch świata `level-type=skyblockbuilder\:skyblock` (`eula=true`,
#      `online-mode=false`, `-Xmx4G`) aż do komunikatu `Done (` w logu.
#   5. Wykonanie komend smoke-testowych przez stdin konsoli:
#      - `halucynacje_reload_economy`
#      - `halucynacje_sync_shoppers`
#      - `halucynacje_sync_stages`
#      - `stop` (czyste zamknięcie z kodem wyjścia 0).
#   6. Twardą weryfikację logów:
#      - brak błędów `ERROR` / `[ERR]` / wyjątków Rhino w `logs/kubejs/startup.log`,
#        `logs/kubejs/server.log` oraz wpisów KubeJS w `logs/latest.log`,
#      - brak ostrzeżeń o fallbackach (`Nie udało się`, `Fallback komendowy`),
#      - brak regresji `ArrowFunction(` oraz `Unknown event`,
#      - obecność potwierdzeń uruchomienia KubeJS i wszystkich 3 komend konsolowych.
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
# 4. Przygotowanie świeżego katalogu roboczego serwera (nigdy nie cache'ujemy config/ i kubejs/)
# ----------------------------------------------------------------------------
echo "🧹 Przygotowuję czysty katalog roboczy serwera: ${BOOT_WORK_DIR}"
rm -rf "${BOOT_WORK_DIR}"
mkdir -p "${BOOT_WORK_DIR}/mods"

ln -s "${NEOFORGE_CACHE_DIR}/libraries" "${BOOT_WORK_DIR}/libraries"
cp -a "${MODS_CACHE_DIR}"/*.jar "${BOOT_WORK_DIR}/mods/"
cp -a "${REPO_ROOT}/config" "${BOOT_WORK_DIR}/config"
cp -a "${REPO_ROOT}/kubejs" "${BOOT_WORK_DIR}/kubejs"

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
echo "📦 Gotowe środowisko rozruchu: ${BOOT_MOD_COUNT} JAR-ów + świeże config/ + świeże kubejs/ + eula=true + online-mode=false."

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
    "halucynacje_sync_stages"
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
  "Zsynchronizowano etapy co-op i taski FTB Quests"
do
  if [ "${#SEARCH_LOGS[@]}" -gt 0 ] && grep -Fq "${expected_marker}" "${SEARCH_LOGS[@]}"; then
    pass_check "Potwierdzono wpis w logach: '${expected_marker}'."
  else
    add_failure "Brak oczekiwanego potwierdzenia w logach: '${expected_marker}'!"
  fi
done

# 7.9 Podgląd logów KubeJS dla przejrzystości w CI
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
  echo "📁 Pełne logi wyeksportowano do: ${LOG_EXPORT_DIR}"
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
