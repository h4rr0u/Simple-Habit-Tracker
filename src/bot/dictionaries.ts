/**
 * Bot copy for every supported interface language.
 *
 * This module is deliberately free of database/network imports: message
 * builders and unit tests can import it without opening SQLite. The
 * DB-aware `getBotText(key)` helper lives in `./language`.
 */

export type BotLanguage = "ru" | "en";

export const DEFAULT_BOT_LANGUAGE: BotLanguage = "ru";

/** Russian plural for "день" (1 день, 2 дня, 5 дней). */
export function pluralDays(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return "день";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "дня";
  return "дней";
}

function englishDays(count: number): string {
  return count === 1 ? "day" : "days";
}

export interface BotDictionary {
  /* Main menu */
  mainGreeting: string;
  menuTodayButton: string;
  menuStatsButton: string;
  menuWebButton: string;
  menuSupportButton: string;
  backToMainButton: string;

  /* Web version hint */
  webTitle: string;
  webIntro: string;
  webHint: string;

  /* Stats */
  statsTitle: string;
  statsStreak: (streak: number) => string;
  statsDone: (done: number, total: number) => string;

  /* Today */
  todayTitle: (date: string) => string;
  todayEmpty: string;
  todayGoalSuffix: string;
  todayAvoidSuffix: string;
  todaySlippedSuffix: string;
  todayGoalBanner: string;

  /* Schedule summary */
  scheduleEveryDay: string;
  scheduleTimesPerWeek: (count: number) => string;
  scheduleOncePerWeek: string;
  scheduleNoDays: string;
  scheduleEveryNDays: (count: number) => string;
  scheduleCustom: string;
  weekdayShort: (day: number) => string;

  /* Inline action labels */
  actionTimed: (name: string) => string;
  actionSlipLog: (name: string) => string;
  actionSlipUndo: (name: string) => string;
  actionMark: (name: string) => string;
  actionUndo: (name: string) => string;
  actionQuantDone: string;
  actionQuantTapped: (progress: string) => string;
  actionQuantIncrement: (progress: string) => string;

  /* Reminders */
  reminderScheduled: (time: string) => string;
  reminderStreak: (streak: number) => string;
  reminderProgress: (progress: string, unit: string) => string;
  reminderFooter: string;
  reminderTimedButton: string;
  reminderSlipButton: string;
  reminderDoneButton: string;

  /* Support */
  supportTitle: string;
  supportBody: string;
  supportButton: string;
  supportDisabled: string;

  /* Language picker */
  languagePrompt: string;
  languageRuButton: string;
  languageEnButton: string;
  languageChanged: string;

  /* Bot replies */
  foreignChat: string;
  foreignChatShort: string;
  bindingTaken: string;
  unknownAction: string;
  habitNotFound: string;
  cancelled: string;
  habitGone: string;
  invalidValue: string;
  saved: (value: string, name: string) => string;
  cleared: (name: string) => string;
  /** Test message confirming that the bot can write to the linked chat. */
  chatBindingTest: string;
  incrementGoal: (progress: string) => string;
  incrementPlus: (progress: string) => string;
  slipLogged: (name: string) => string;
  backOnTrack: (name: string) => string;
  checked: (name: string) => string;
  unchecked: (name: string) => string;
  askTimed: (name: string, target: string, progress: string) => string;
  askQuantitative: (name: string, target: string, progress: string) => string;
  targetSuffix: (value: string) => string;
  currentSuffix: (value: string) => string;
  errorGeneric: string;
  errorQuantitativeOnly: string;
  errorReminderUsed: string;
  errorReminderStale: string;
}

const ru: BotDictionary = {
  mainGreeting:
    "👋 Привет! Я твой трекер привычек. Выбери действие:\n\n" +
    "Просто нажимай на кнопки — я обновлю это сообщение.",
  menuTodayButton: "📅 Привычки на сегодня",
  menuStatsButton: "📊 Моя статистика",
  menuWebButton: "⚙️ Открыть веб-версию",
  menuSupportButton: "💖 Поддержать автора",
  backToMainButton: "⬅️ В главное меню",

  webTitle: "⚙️ <b>Открыть веб-версию</b>",
  webIntro:
    "Telegram не принимает в кнопках адреса вида localhost, поэтому открой " +
    "его в браузере на компьютере, где запущен трекер:",
  webHint:
    "<i>Если трекер доступен по внешнему адресу (например, через туннель), " +
    "укажи его в WEB_APP_URL — кнопка снова станет обычной ссылкой.</i>",

  statsTitle: "📊 <b>Моя статистика</b>",
  statsStreak: (streak) =>
    streak > 0
      ? `🔥 Твой текущий стрик: <b>${streak} ${pluralDays(streak)}</b>.`
      : "🔥 Твой текущий стрик: <b>0 дней</b>.",
  statsDone: (done, total) =>
    `✅ Выполнено сегодня: <b>${done} из ${total}</b>.`,

  todayTitle: (date) => `🗓 <b>Сегодня · ${date}</b>`,
  todayEmpty: "На сегодня ничего не запланировано 🎉",
  todayGoalSuffix: " · Цель дня достигнута!",
  todayAvoidSuffix: " · не делать",
  todaySlippedSuffix: " · срыв",
  todayGoalBanner: "🎉 Цель дня достигнута!",

  scheduleEveryDay: "Каждый день",
  scheduleTimesPerWeek: (count) => `${count}× в неделю`,
  scheduleOncePerWeek: "Раз в неделю",
  scheduleNoDays: "Дни не выбраны",
  scheduleEveryNDays: (count) => `Раз в ${count} дн.`,
  scheduleCustom: "Другое",
  weekdayShort: (day) => ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][day] ?? "",

  actionTimed: (name) => `⏱ ${name}`,
  actionSlipLog: (name) => `❌ Срыв · ${name}`,
  actionSlipUndo: (name) => `↩️ Отменить срыв · ${name}`,
  actionMark: (name) => `✅ ${name}`,
  actionUndo: (name) => `↩️ ${name}`,
  actionQuantDone: "✅ Выполнено",
  actionQuantTapped: (progress) => `✅ Отмечено (${progress})`,
  actionQuantIncrement: (progress) => `➕ +1 (${progress})`,

  reminderScheduled: (time) => `Запланировано на ${time}`,
  reminderStreak: (streak) => ` · 🔥 Стрик: ${streak}`,
  reminderProgress: (progress, unit) => `\nПрогресс: ${progress}${unit}`,
  reminderFooter: "Не разрывай цепочку!",
  reminderTimedButton: "⏱ Ввести минуты",
  reminderSlipButton: "❌ Срыв",
  reminderDoneButton: "✅ Выполнено",

  supportTitle: "💖 <b>Поддержать автора</b>",
  supportBody:
    "Трекер бесплатный и работает локально. Если он оказался полезен, " +
    "вы можете поддержать разработку.",
  supportButton: "💖 Поддержать",
  supportDisabled: "Спасибо! Донаты для этой сборки отключены.",

  languagePrompt:
    "🌐 <b>Язык / Language</b>\n\n" + "Выберите язык / Choose language:",
  languageRuButton: "🇷🇺 Русский",
  languageEnButton: "🇬🇧 English",
  languageChanged: "Язык изменён на Русский 🇷🇺",

  foreignChat:
    "Этот бот привязан к другому чату. Чтобы перепривязать его, очистите настройки в веб-интерфейсе.",
  foreignChatShort: "Этот бот привязан к другому чату",
  bindingTaken:
    "Этот бот уже привязан к другому пользователю. Если вы хотите перепривязать его, сначала очистите настройки в веб-интерфейсе.",
  unknownAction: "Неизвестное действие",
  habitNotFound: "Привычка не найдена",
  cancelled: "Отменено.",
  habitGone: "Этой привычки больше не существует.",
  invalidValue: 'Отправь целое неотрицательное число или напиши "cancel", чтобы отменить.',
  saved: (value, name) => `✅ Сохранено ${value} для «${name}»`,
  cleared: (name) => `🧹 Отметка удалена для «${name}»`,
  chatBindingTest:
    "Привязка успешна! Теперь я буду присылать сюда напоминания.",
  incrementGoal: (progress) => `🎉 Цель дня достигнута! ${progress}`,
  incrementPlus: (progress) => `+1 · ${progress}`,
  slipLogged: (name) => `❌ Срыв записан · ${name}`,
  backOnTrack: (name) => `✅ ${name}: снова в строю`,
  checked: (name) => `✅ ${name}`,
  unchecked: (name) => `↩️ ${name} — снято`,
  askTimed: (name, target, progress) =>
    `⏱ <b>${name}</b>${target}\nСколько минут? Отправь число${progress}`,
  askQuantitative: (name, target, progress) =>
    `✏️ <b>${name}</b>${target}\nОтправь число${progress}`,
  targetSuffix: (value) => ` (цель ${value})`,
  currentSuffix: (value) => ` Сейчас: ${value}.`,
  errorGeneric: "Что-то пошло не так. Попробуйте ещё раз.",
  errorQuantitativeOnly: "Увеличивать можно только привычки с количеством",
  errorReminderUsed: "Это напоминание уже использовано",
  errorReminderStale: "Напоминание устарело",
};

const en: BotDictionary = {
  mainGreeting:
    "👋 Hi! I'm your habit tracker. Pick an action:\n\n" +
    "Just tap the buttons — I'll update this message.",
  menuTodayButton: "📅 Today's habits",
  menuStatsButton: "📊 My stats",
  menuWebButton: "⚙️ Open web version",
  menuSupportButton: "💖 Support the author",
  backToMainButton: "⬅️ Back to main menu",

  webTitle: "⚙️ <b>Open the web version</b>",
  webIntro:
    "Telegram doesn't allow localhost addresses in buttons, so open this in a " +
    "browser on the computer running the tracker:",
  webHint:
    "<i>If the tracker is reachable at a public address (for example via a " +
    "tunnel), set it in WEB_APP_URL — the button will become a regular link again.</i>",

  statsTitle: "📊 <b>My stats</b>",
  statsStreak: (streak) =>
    streak > 0
      ? `🔥 Your current streak: <b>${streak} ${englishDays(streak)}</b>.`
      : "🔥 Your current streak: <b>0 days</b>.",
  statsDone: (done, total) => `✅ Done today: <b>${done} of ${total}</b>.`,

  todayTitle: (date) => `🗓 <b>Today · ${date}</b>`,
  todayEmpty: "Nothing scheduled for today 🎉",
  todayGoalSuffix: " · Daily goal reached!",
  todayAvoidSuffix: " · avoid",
  todaySlippedSuffix: " · slipped",
  todayGoalBanner: "🎉 Daily goal reached!",

  scheduleEveryDay: "Every day",
  scheduleTimesPerWeek: (count) => `${count}× per week`,
  scheduleOncePerWeek: "Once per week",
  scheduleNoDays: "No days selected",
  scheduleEveryNDays: (count) => `Every ${count} days`,
  scheduleCustom: "Custom",
  weekdayShort: (day) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day] ?? "",

  actionTimed: (name) => `⏱ ${name}`,
  actionSlipLog: (name) => `❌ Log slip · ${name}`,
  actionSlipUndo: (name) => `↩️ Undo slip · ${name}`,
  actionMark: (name) => `✅ ${name}`,
  actionUndo: (name) => `↩️ ${name}`,
  actionQuantDone: "✅ Done",
  actionQuantTapped: (progress) => `✅ Logged (${progress})`,
  actionQuantIncrement: (progress) => `➕ +1 (${progress})`,

  reminderScheduled: (time) => `Scheduled for ${time}`,
  reminderStreak: (streak) => ` · 🔥 Streak: ${streak}`,
  reminderProgress: (progress, unit) => `\nProgress: ${progress}${unit}`,
  reminderFooter: "Don't break the chain!",
  reminderTimedButton: "⏱ Log minutes",
  reminderSlipButton: "❌ Log slip",
  reminderDoneButton: "✅ Mark done",

  supportTitle: "💖 <b>Support the author</b>",
  supportBody:
    "The tracker is free and runs locally. If you found it useful, you can " +
    "support development.",
  supportButton: "💖 Support",
  supportDisabled: "Thanks! Donations are disabled for this build.",

  languagePrompt:
    "🌐 <b>Язык / Language</b>\n\n" + "Выберите язык / Choose language:",
  languageRuButton: "🇷🇺 Русский",
  languageEnButton: "🇬🇧 English",
  languageChanged: "Language changed to English 🇬🇧",

  foreignChat:
    "This bot is linked to another chat. To rebind it, clear the settings in the web interface.",
  foreignChatShort: "This bot is linked to another chat",
  bindingTaken:
    "This bot is already linked to another user. If you want to rebind it, first clear the settings in the web interface.",
  unknownAction: "Unknown action",
  habitNotFound: "Habit not found",
  cancelled: "Cancelled.",
  habitGone: "This habit no longer exists.",
  invalidValue: 'Please send a whole non-negative number, or send "cancel" to abort.',
  saved: (value, name) => `✅ Saved ${value} for "${name}"`,
  cleared: (name) => `🧹 Check-in cleared for "${name}"`,
  chatBindingTest: "Chat linked! I will send reminders here from now on.",
  incrementGoal: (progress) => `🎉 Daily goal reached! ${progress}`,
  incrementPlus: (progress) => `+1 · ${progress}`,
  slipLogged: (name) => `❌ Slip logged · ${name}`,
  backOnTrack: (name) => `✅ ${name}: back on track`,
  checked: (name) => `✅ ${name}`,
  unchecked: (name) => `↩️ ${name} removed`,
  askTimed: (name, target, progress) =>
    `⏱ <b>${name}</b>${target}\nHow many minutes? Send a number${progress}`,
  askQuantitative: (name, target, progress) =>
    `✏️ <b>${name}</b>${target}\nSend a number${progress}`,
  targetSuffix: (value) => ` (target ${value})`,
  currentSuffix: (value) => ` Current: ${value}.`,
  errorGeneric: "Something went wrong. Please try again.",
  errorQuantitativeOnly: "Only quantitative habits can be incremented",
  errorReminderUsed: "This reminder has already been used",
  errorReminderStale: "This reminder is stale",
};

export const botDictionaries: Record<BotLanguage, BotDictionary> = { ru, en };

export type BotTextKey = keyof BotDictionary;
