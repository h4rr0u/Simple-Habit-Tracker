#!/usr/bin/env node
/**
 * Habit Tracker Updater.
 *
 * Безопасное обновление проекта для обычных пользователей:
 *   • сначала делает резервную копию базы данных в ./backup;
 *   • для Git-версии выполняет git pull, при необходимости npm install,
 *     затем применяет миграции Drizzle;
 *   • для ZIP-версии показывает пошаговую инструкцию по ручному обновлению.
 *
 * Сторонних зависимостей нет: только встроенные модули node:*.
 * better-sqlite3 используется опционально (если установлен) для целостной
 * копии базы вместе с WAL; иначе база копируется как обычный файл.
 */

import { spawn, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { connect } from "node:net";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BACKUP_DIR = join(ROOT, "backup");
const IS_WINDOWS = process.platform === "win32";
const PORT = 3000;
const RELEASES_URL = "https://github.com/h4rr0u/habit-tracker/releases/latest";

/* ---------------------------------- лог ---------------------------------- */

const useColor = Boolean(process.stdout.isTTY) && process.env.NO_COLOR === undefined;
const paint = (code, text) => (useColor ? `\u001B[${code}m${text}\u001B[0m` : text);
const BOLD = "1";
const DIM = "2";
const RED = "31";
const GREEN = "32";
const YELLOW = "33";
const CYAN = "36";

const BANNER = `
 _   _     _     ____   ___  _____    _____  ____      _      ____  _  __ _____  ____
| | | |   / \\   | __ ) |_ _||_   _|  |_   _||  _ \\    / \\    / ___|| |/ /| ____||  _ \\
| |_| |  / _ \\  |  _ \\  | |   | |      | |  | |_) |  / _ \\  | |    | ' / |  _|  | |_) |
|  _  | / ___ \\ | |_) | | |   | |      | |  |  _ <  / ___ \\ | |___ | . \\ | |___ |  _ <
|_| |_|/_/   \\_\\|____/ |___|  |_|      |_|  |_| \\_\\/_/   \\_\\ \\____||_|\\_\\|_____||_| \\_\\

 _   _  ____   ____      _     _____  _____  ____
| | | ||  _ \\ |  _ \\    / \\   |_   _|| ____||  _ \\
| | | || |_) || | | |  / _ \\    | |  |  _|  | |_) |
| |_| ||  __/ | |_| | / ___ \\   | |  | |___ |  _ <
 \\___/ |_|    |____/ /_/   \\_\\  |_|  |_____||_| \\_\\
`;

function printBanner() {
  console.log();
  console.log(paint(CYAN, BANNER));
  console.log(paint(DIM, "  Безопасное обновление с резервной копией базы данных"));
  console.log();
}

function section(title) {
  console.log();
  console.log(paint(BOLD, `▸ ${title}`));
}

function center(text, width) {
  const left = Math.max(0, Math.floor((width - text.length) / 2));
  return " ".repeat(left) + text + " ".repeat(Math.max(0, width - text.length - left));
}

/* ------------------------------- утилиты ---------------------------------- */

const pad2 = (value) => String(value).padStart(2, "0");

function formatDate(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function formatTime(date) {
  return `${pad2(date.getHours())}-${pad2(date.getMinutes())}-${pad2(date.getSeconds())}`;
}

function readText(filePath) {
  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
}

/**
 * Проверяет, слушает ли кто-нибудь порт. Никаких зависимостей — только TCP.
 * @returns {Promise<boolean>}
 */
function isPortInUse(port, host) {
  return new Promise((done) => {
    const socket = connect({ port, host });
    let settled = false;

    const finish = (busy) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      done(busy);
    };

    socket.setTimeout(800);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
  });
}

async function serverIsRunning() {
  if (await isPortInUse(PORT, "127.0.0.1")) return true;
  // На некоторых системах Next.js слушает только IPv6 (::1).
  return isPortInUse(PORT, "::1");
}

function openUrl(url) {
  try {
    if (IS_WINDOWS) {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------ база данных ------------------------------- */

/** Ищет основную базу: data/habit-tracker.db, затем habit-tracker.db, затем любой *.db. */
function findDatabases() {
  const preferred = [join(ROOT, "data", "habit-tracker.db"), join(ROOT, "habit-tracker.db")];
  const existing = preferred.filter((file) => existsSync(file));
  if (existing.length > 0) return existing;

  const found = [];
  for (const dir of [ROOT, join(ROOT, "data")]) {
    if (!existsSync(dir)) continue;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.db$/i.test(entry.name)) continue;
      const full = join(dir, entry.name);
      if (full.startsWith(BACKUP_DIR)) continue;
      found.push(full);
    }
  }
  return found;
}

/** Уникальный путь: habit-tracker-2024-05-20.db, при повторе — с временем. */
function backupPathFor(dbPath) {
  const base = basename(dbPath, extname(dbPath)).replace(/[^\w.-]+/g, "-");
  const now = new Date();
  const date = formatDate(now);
  let dest = join(BACKUP_DIR, `${base}-${date}.db`);

  if (existsSync(dest)) {
    dest = join(BACKUP_DIR, `${base}-${date}_${formatTime(now)}.db`);
    let counter = 2;
    while (existsSync(dest)) {
      dest = join(BACKUP_DIR, `${base}-${date}_${formatTime(now)}-${counter}.db`);
      counter += 1;
    }
  }
  return dest;
}

/**
 * Делает согласованную копию SQLite-базы.
 * VACUUM INTO захватывает данные из WAL в один файл .db; если модуль
 * better-sqlite3 недоступен, копирует файл и его -wal/-shm рядом.
 */
async function copyDatabase(src, dest) {
  try {
    const { default: Database } = await import("better-sqlite3");
    const db = new Database(src);
    try {
      db.exec(`VACUUM INTO '${dest.replace(/'/g, "''")}'`);
    } finally {
      db.close();
    }
    if (!existsSync(dest)) throw new Error("backup file was not created");
    return "vacuum";
  } catch {
    try {
      rmSync(dest, { force: true });
    } catch {
      /* файла ещё нет */
    }
    copyFileSync(src, dest);
    for (const suffix of ["-wal", "-shm"]) {
      if (existsSync(src + suffix)) copyFileSync(src + suffix, dest + suffix);
    }
    return "copy";
  }
}

async function backupDatabases() {
  const databases = findDatabases();
  if (databases.length === 0) return [];

  mkdirSync(BACKUP_DIR, { recursive: true });
  const created = [];

  for (const dbPath of databases) {
    const dest = backupPathFor(dbPath);
    const method = await copyDatabase(dbPath, dest);
    const relDest = relative(ROOT, dest);
    const note = method === "copy" ? paint(DIM, " (копия файла)") : "";
    console.log(`${paint(GREEN, "✓")} ${relative(ROOT, dbPath)} → ${relDest}${note}`);
    created.push(relDest);
  }
  return created;
}

/* -------------------------------- npm/git --------------------------------- */

function runNpm(args) {
  const npm = IS_WINDOWS ? "npm.cmd" : "npm";
  // На Windows .cmd нельзя запустить без shell, а массив args вместе с shell
  // включает DEP0190 — собираем безопасную командную строку сами (аргументы
  // фиксированные, без пользовательского ввода).
  const result = IS_WINDOWS
    ? spawnSync([npm, ...args].join(" "), { cwd: ROOT, env: process.env, stdio: "inherit", shell: true })
    : spawnSync(npm, args, { cwd: ROOT, env: process.env, stdio: "inherit" });
  return result;
}

function git(args, { inherit = false } = {}) {
  return spawnSync("git", args, {
    cwd: ROOT,
    env: process.env,
    stdio: inherit ? "inherit" : "pipe",
    encoding: "utf8",
    windowsHide: true,
  });
}

function detectBranch(remote) {
  const current = git(["symbolic-ref", "--short", "-q", "HEAD"]);
  const branch = (current.stdout ?? "").trim();
  if (current.status === 0 && branch !== "" && branch !== "HEAD") return branch;

  for (const name of ["main", "master"]) {
    const check = git(["rev-parse", "--verify", "--quiet", `refs/remotes/${remote}/${name}`]);
    if (check.status === 0) return name;
  }
  return null;
}

/* -------------------------------- сценарии -------------------------------- */

async function runZipScenario() {
  const width = 64;
  const border = "═".repeat(width);
  console.log();
  console.log(paint(`${RED};${BOLD}`, `  ╔${border}╗`));
  console.log(
    paint(`${RED};${BOLD}`, `  ║${paint(RED, center("ВНИМАНИЕ", width))}║`),
  );
  console.log(
    paint(
      `${RED};${BOLD}`,
      `  ║${paint(RED, center("Вы используете ZIP-версию.", width))}║`,
    ),
  );
  console.log(
    paint(
      `${RED};${BOLD}`,
      `  ║${paint(RED, center("Автоматическое обновление недоступно", width))}║`,
    ),
  );
  console.log(paint(`${RED};${BOLD}`, `  ╚${border}╝`));
  console.log();

  console.log(paint(BOLD, "  Как обновиться вручную:"));
  console.log("    1. Скачайте новый ZIP с GitHub.");
  console.log("    2. Распакуйте его в новую папку.");
  console.log("    3. Скопируйте файлы .env и *.db (базу данных) из старой папки в новую.");
  console.log("    4. Запустите start.bat в новой папке.");
  console.log();
  console.log(
    paint(
      DIM,
      "  Не удаляйте старую папку, пока не убедитесь, что новая версия работает.\n" +
        "  Базу данных обычно можно найти в data\\habit-tracker.db.",
    ),
  );

  let answer = "";
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    answer = await rl.question("\nОткрыть страницу релизов на GitHub? (y/N): ");
  } catch {
    answer = "";
  } finally {
    rl.close();
  }

  if (/^(y|yes|д|да)$/i.test(answer.trim())) {
    if (openUrl(RELEASES_URL)) {
      console.log(paint(DIM, "Открываю браузер…"));
    } else {
      console.log(paint(YELLOW, "Не удалось открыть браузер автоматически."));
    }
  }
  console.log(paint(DIM, `Страница релизов: ${RELEASES_URL}`));
}

async function runGitScenario() {
  // Копия делается до любых Git-операций: даже если обновление не начнётся,
  // данные пользователя уже в безопасности.
  section("Резервная копия базы данных");
  const backups = await backupDatabases();
  if (backups.length === 0) {
    console.log(paint(YELLOW, "Файл базы данных не найден — резервная копия не создана."));
    console.log(paint(DIM, "Обновление продолжится: миграции создадут базу при необходимости."));
  }

  const version = git(["--version"]);
  if (version.error || version.status !== 0) {
    console.log();
    console.log(paint(RED, "Git не установлен или недоступен в PATH."));
    console.log("Установите Git с https://git-scm.com/downloads и запустите update.bat снова.");
    return 1;
  }

  const remotes = (git(["remote"]).stdout ?? "").trim().split(/\r?\n/).filter(Boolean);
  if (remotes.length === 0) {
    console.log();
    console.log(paint(YELLOW, "В репозитории не настроен удалённый репозиторий (remote)."));
    console.log("Похоже, папка .git скопирована без связи с GitHub.");
    console.log("Скачайте свежий ZIP с GitHub и перенесите .env и базу данных, как описано в README.");
    console.log(paint(DIM, `Релизы: ${RELEASES_URL}`));
    return 1;
  }

  const remote = remotes.includes("origin") ? "origin" : remotes[0];
  const branch = detectBranch(remote);
  if (branch === null) {
    console.log();
    console.log(paint(RED, "Не удалось определить ветку для обновления."));
    console.log("Проверьте, что репозиторий клонирован корректно (ветка main или master).");
    return 1;
  }

  section(`Обновление из Git (${remote}/${branch})`);
  const packageBefore = readText(join(ROOT, "package.json"));
  const headBefore = (git(["rev-parse", "HEAD"]).stdout ?? "").trim();

  const pull = git(["pull", remote, branch], { inherit: true });
  if (pull.status !== 0) {
    console.log();
    console.log(paint(`${RED};${BOLD}`, "Не удалось выполнить git pull."));
    console.log("Проверьте подключение к интернету и запустите update.bat снова.");
    console.log("Если вы меняли файлы проекта, сохраните или уберите изменения (git stash) и повторите.");
    if (backups.length > 0) {
      console.log(paint(DIM, `Резервная копия базы сохранена: ${backups.join(", ")}`));
    }
    return 1;
  }

  const packageAfter = readText(join(ROOT, "package.json"));
  const dependenciesChanged = packageBefore !== packageAfter;
  if (dependenciesChanged) {
    section("Зависимости");
    console.log("package.json изменился — устанавливаю новые зависимости…");
    const install = runNpm(["install"]);
    if (install.status !== 0) {
      console.log();
      console.log(paint(`${RED};${BOLD}`, "Ошибка npm install. Обновление остановлено."));
      console.log("Резервная копия базы данных сохранена в backup/.");
      console.log("Исправьте ошибку выше и запустите update.bat снова.");
      return 1;
    }
  } else {
    console.log(paint(DIM, "package.json не изменился — npm install не требуется."));
  }

  section("Миграции базы данных");
  console.log("Применяю миграции Drizzle…");
  const migrate = runNpm(["run", "db:migrate"]);
  if (migrate.status !== 0) {
    console.log();
    console.log(
      paint(
        `${RED};${BOLD}`,
        "Ошибка миграции! Ваша база данных сохранена в backup/. " +
          "Свяжитесь с разработчиком или откатитесь к предыдущей версии",
      ),
    );
    if (backups.length > 0) {
      console.log(paint(DIM, "Резервные копии:"));
      for (const backup of backups) console.log(paint(DIM, `  • ${backup}`));
    }
    return 1;
  }

  const headAfter = (git(["rev-parse", "HEAD"]).stdout ?? "").trim();
  const repoChanged =
    headBefore !== "" && headAfter !== "" && headBefore !== headAfter;
  const needsBuild =
    repoChanged || dependenciesChanged || !existsSync(join(ROOT, ".next"));

  if (needsBuild) {
    section("Сборка production-версии");
    console.log(
      repoChanged || dependenciesChanged
        ? "Исходники изменились — собираю приложение (npm run build)…"
        : "Готовая сборка не найдена — собираю приложение (npm run build)…",
    );
    const build = runNpm(["run", "build"]);
    if (build.status !== 0) {
      console.log();
      console.log(paint(`${RED};${BOLD}`, "Ошибка сборки. Обновление остановлено."));
      console.log("База данных уже обновлена и сохранена в backup/.");
      console.log("Исправьте ошибку выше и запустите start.bat или update.bat снова.");
      return 1;
    }
  } else {
    console.log(paint(DIM, "Исходники не изменились — пересборка не требуется."));
  }

  console.log();
  console.log(
    paint(`${GREEN};${BOLD}`, "Обновление успешно! База данных сохранена в backup/. Запустите start.bat"),
  );
  if (backups.length > 0) {
    console.log(paint(DIM, `Резервная копия: ${backups.join(", ")}`));
  }
  console.log();
  return 0;
}

/* --------------------------------- main ----------------------------------- */

async function main() {
  printBanner();

  if (await serverIsRunning()) {
    section("Сервер уже запущен");
    console.log(paint(YELLOW, `Похоже, Habit Tracker работает: порт ${PORT} занят.`));
    console.log("Закройте окно трекера или нажмите Ctrl+C в нём, чтобы остановить сервер.");
    console.log("Затем запустите update.bat снова.");
    console.log(paint(DIM, "Обновление отменено: файлы проекта и база данных не изменены."));
    return 1;
  }

  if (!existsSync(join(ROOT, ".git"))) {
    await runZipScenario();
    return 0;
  }

  return runGitScenario();
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    console.error();
    console.error(paint(RED, `Сбой обновления: ${error instanceof Error ? error.message : String(error)}`));
    console.error("Резервные копии в backup/ не удалены.");
    process.exitCode = 1;
  });
