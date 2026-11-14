import { describe, expect, it } from "vitest";

import { actionErrorKind } from "./action-error";

/**
 * The chat-binding flow returns these two messages from the server. They must
 * map to stable kinds so the web UI can localize them instead of leaking the
 * raw text.
 */
describe("actionErrorKind — Telegram chat binding", () => {
  it("maps an unreachable chat to chatUnreachable", () => {
    expect(actionErrorKind("Бот не может написать в этот чат")).toBe("chatUnreachable");
  });

  it("maps a missing bot token to botTokenMissing", () => {
    expect(actionErrorKind("TELEGRAM_BOT_TOKEN не задан в .env")).toBe("botTokenMissing");
  });

  it("keeps an invalid chat id distinguishable", () => {
    expect(actionErrorKind("Chat id must be a number (send /start to the bot to get it)")).toBe(
      "invalidChatId"
    );
  });
});
