#!/usr/bin/env node
/**
 * Единый лаунчер Habit Tracker (production).
 *
 * Поднимает весь стек в одном терминале:
 *   [web]  — Next.js production server (http://localhost:3000), запускается всегда;
 *   [bot]  — Telegram-бот (grammY), только если задан TELEGRAM_BOT_TOKEN;
 *   [cron] — cron напоминаний (node-cron), только если задан TELEGRAM_BOT_TOKEN.
 *
 * Перед запуском проверяется папка .next: если сборки нет, лаунчер выполняет
 * `npm run build` и только потом запускает `next start`. Флаг --build (или
 * --rebuild) принудительно пересобирает проект даже при наличии .next.
 *
 * Вывод каждого процесса помечен цветным префиксом [web]/[bot]/[cron].
 * Ctrl+C (SIGINT) или SIGTERM останавливает все запущенные процессы.
 * Если один из процессов упал — остальные гасятся, лаунчер выходит с тем же кодом.
 *
 * Сторонних зависимостей нет: только встроенные модули node:*.
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IS_WINDOWS = process.platform === "win32";

/* --------------------------------- .env ---------------------------------- */

/**
 * Простой парсер .env: строки KEY=VALUE, комментарии `#`, кавычки опциональны.
 * Переменные, уже заданные в окружении, не перезаписываются.
 */
function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    if (key !== "" && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

loadDotEnv(join(ROOT, ".env"));

/* ---------------------------------- лог ---------------------------------- */

const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
const paint = (code, text) => (useColor ? `\u001B[${code}m${text}\u001B[0m` : text);

// cyan / green / magenta
const TAG_COLORS = { web: "36", bot: "32", cron: "35" };
const YELLOW = "33";
const GREEN = "32";
const RED = "31";
const DIM = "2";
const BOLD = "1";

function logTag(name, line) {
  const text = line.replace(/\r$/, "");
  if (text !== "") console.log(`${paint(TAG_COLORS[name], `[${name}]`)} ${text}`);
}

/** Строчный буфер: пересобирает разрезанные chunks и вешает префикс на каждую строку. */
function forward(stream, name) {
  if (!stream) return;
  stream.setEncoding("utf8");
  let pending = "";
  stream.on("data", (chunk) => {
    pending += chunk;
    let newline = pending.indexOf("\n");
    while (newline !== -1) {
      logTag(name, pending.slice(0, newline));
      pending = pending.slice(newline + 1);
      newline = pending.indexOf("\n");
    }
  });
  stream.on("end", () => {
    if (pending !== "") logTag(name, pending);
    pending = "";
  });
}

/* ------------------------------- процессы --------------------------------- */

const TELEGRAM_TOKEN = (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

const services = [
  {
    name: "web",
    script: "start",
    args: ["--", "--port", "3000"],
    label: "Next.js production server — http://localhost:3000",
  },
];
if (TELEGRAM_TOKEN !== "") {
  services.push({ name: "bot", script: "bot:dev", args: [], label: "Telegram-бот (grammY)" });
  services.push({ name: "cron", script: "reminders:dev", args: [], label: "Напоминания (node-cron)" });
}

/** @type {Map<string, import("node:child_process").ChildProcess>} */
const running = new Map();
let shuttingDown = false;

// npm.cmd нельзя запустить без shell (ограничение Node для .cmd/.bat),
// на POSIX shell не нужен — там используется отдельная процесс-группа.
const NPM = IS_WINDOWS ? "npm.cmd" : "npm";

/** Папка production-сборки Next.js. */
const BUILD_DIR = join(ROOT, ".next");

/**
 * Проверяет, что в .next лежит именно production-сборка.
 *
 * Одного `existsSync(BUILD_DIR)` мало: `next dev` пишет в ту же папку, и после
 * дев-сервера в .next остаются dev-манифесты (в routes-manifest.json нет
 * pages404/staticRoutes). `next start` на таком манифесте падает с
 * `TypeError: routesManifest.dataRoutes is not iterable`, поэтому такой .next
 * считается отсутствующим и пересобирается.
 */
function hasProductionBuild() {
  const required = ["BUILD_ID", "routes-manifest.json", "required-server-files.json"];
  if (!required.every((file) => existsSync(join(BUILD_DIR, file)))) return false;

  try {
    const manifest = JSON.parse(
      readFileSync(join(BUILD_DIR, "routes-manifest.json"), "utf8"),
    );
    return (
      manifest.pages404 === true &&
      Array.isArray(manifest.staticRoutes) &&
      Array.isArray(manifest.dynamicRoutes) &&
      Array.isArray(manifest.dataRoutes)
    );
  } catch {
    return false;
  }
}

/** Принудительная пересборка: `npm run start:all -- --build`. */
const FORCE_BUILD = process.argv.includes("--build") || process.argv.includes("--rebuild");

/**
 * Собирает production-версию синхронно, чтобы `next start` не стартовал
 * с недособранным .next. Возвращает true при успешной сборке.
 */
function buildApp() {
  const args = ["run", "build"];
  console.log(paint(BOLD, "\n  Собираю production-версию (npm run build)…"));
  console.log(paint(DIM, "  Это может занять несколько минут.\n"));

  const result = IS_WINDOWS
    ? spawnSync([NPM, ...args].join(" "), {
        cwd: ROOT,
        env: process.env,
        stdio: "inherit",
        shell: true,
      })
    : spawnSync(NPM, args, {
        cwd: ROOT,
        env: process.env,
        stdio: "inherit",
      });

  if (result.error) {
    console.error(paint(RED, `\nНе удалось запустить сборку: ${result.error.message}`));
    return false;
  }
  if (result.status !== 0) {
    console.error(paint(RED, `\nСборка завершилась с ошибкой (код ${result.status ?? "?"}).`));
    return false;
  }

  console.log(paint(GREEN, "\n  Сборка готова.\n"));
  return true;
}

function startService({ name, script, args }) {
  // На Windows Node не запускает .cmd без shell, а shell:true вместе с массивом
  // args вызывает DEP0190 — склеиваем командную строку сами (в наших аргументах
  // нет пробелов и метасимволов). На POSIX shell не нужен: там используется
  // отдельная процесс-группа для kill(-pid).
  const spawnArgs = ["run", script, ...args];
  const child = IS_WINDOWS
    ? spawn([NPM, ...spawnArgs].join(" "), {
        cwd: ROOT,
        env: process.env,
        shell: true,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      })
    : spawn(NPM, spawnArgs, {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        detached: true,
      });

  running.set(name, child);
  forward(child.stdout, name);
  forward(child.stderr, name);

  child.on("error", (error) => {
    if (shuttingDown) return;
    console.error(paint(RED, `Не удалось запустить [${name}]: ${error.message}`));
    void shutdown(1, `ошибка запуска [${name}]`);
  });

  child.on("exit", (code, signal) => {
    running.delete(name);
    if (shuttingDown) return;
    const exitCode = code ?? (signal ? 1 : 0);
    void shutdown(exitCode, `[${name}] завершился (код ${code ?? signal ?? "?"})`);
  });
}

/**
 * Останавливает один процесс вместе с его потомками.
 * Windows: taskkill /T /F по дереву (cmd → npm → node → next/tsx).
 * POSIX: SIGTERM всей процесс-группе (-pid), затем SIGKILL, если не помогло.
 */
function terminate(child) {
  return new Promise((resolveDone) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolveDone();
      return;
    }

    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(escalate);
      resolveDone();
    };

    // Страховка: если процесс не отреагировал на SIGTERM — добиваем.
    const escalate = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        /* уже мёртв */
      }
      setTimeout(finish, 1000);
    }, 3000);

    child.once("exit", finish);

    try {
      if (IS_WINDOWS) {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          child.kill("SIGTERM");
        }
      }
    } catch {
      try {
        child.kill("SIGTERM");
      } catch {
        /* уже мёртв */
      }
    }
  });
}

async function stopAll() {
  const children = [...running.values()];
  running.clear();
  await Promise.all(children.map(terminate));
}

async function shutdown(code, reason) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(paint(DIM, `\nОстановка (${reason}), гашу все процессы…`));
  await stopAll();
  console.log(paint(DIM, "Все процессы остановлены."));
  process.exit(code);
}

for (const signal of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) {
  try {
    process.on(signal, () => {
      void shutdown(0, signal === "SIGINT" ? "Ctrl+C" : signal);
    });
  } catch {
    /* сигнала нет на этой платформе */
  }
}

process.on("uncaughtException", (error) => {
  console.error(paint(RED, `Сбой лаунчера: ${error instanceof Error ? error.message : String(error)}`));
  void shutdown(1, "необработанная ошибка");
});

/* -------------------------------- баннер ---------------------------------- */

function printBanner() {
  const rule = "─".repeat(60);
  console.log();
  console.log(paint(BOLD, "  🐾 Habit Tracker — единый запуск production-стека"));
  console.log(paint(DIM, `  ${rule}`));
  console.log(`  Web:  ${paint(BOLD, "http://localhost:3000")}`);
  console.log("  Процессы:");
  for (const { name, label } of services) {
    console.log(`    ${paint(TAG_COLORS[name], `[${name}]`)}  ${label}`);
  }
  console.log(paint(DIM, "  Остановка: Ctrl+C"));
  console.log(paint(DIM, `  ${rule}`));
  console.log();
}

/* --------------------------------- main ----------------------------------- */

printBanner();

if (FORCE_BUILD || !hasProductionBuild()) {
  if (!buildApp()) {
    console.error(paint(RED, "Запуск отменён: production-сборка не удалась."));
    process.exit(1);
  }
} else {
  console.log(paint(DIM, "  Найдена готовая сборка (.next) — пересборка не требуется."));
  console.log(paint(DIM, "  Пересобрать принудительно: npm run start:all -- --build\n"));
}

for (const service of services) startService(service);

if (TELEGRAM_TOKEN === "") {
  console.log(
    paint(YELLOW, "Telegram отключён: TELEGRAM_BOT_TOKEN не задан. Трекер работает без напоминаний."),
  );
  console.log(paint(DIM, "Добавь токен в .env (см. .env.example) и перезапусти, чтобы включить бота."));
}
