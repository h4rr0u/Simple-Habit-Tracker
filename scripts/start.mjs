#!/usr/bin/env node
/**
 * Единый dev-лаунчер Habit Tracker.
 *
 * Поднимает весь стек в одном терминале:
 *   [web]  — Next.js dev server (http://localhost:3000), запускается всегда;
 *   [bot]  — Telegram-бот (grammY), только если задан TELEGRAM_BOT_TOKEN;
 *   [cron] — cron напоминаний (node-cron), только если задан TELEGRAM_BOT_TOKEN.
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
    script: "dev",
    args: ["--", "--port", "3000"],
    label: "Next.js dev server — http://localhost:3000",
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
  console.log(paint(BOLD, "  🐾 Habit Tracker — единый запуск dev-стека"));
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

for (const service of services) startService(service);

if (TELEGRAM_TOKEN === "") {
  console.log(
    paint(YELLOW, "Telegram отключён: TELEGRAM_BOT_TOKEN не задан. Трекер работает без напоминаний."),
  );
  console.log(paint(DIM, "Добавь токен в .env (см. .env.example) и перезапусти, чтобы включить бота."));
}
