// Helper for /admin/telegram.html — checks the Telegram configuration and
// sends a test message. Never returns the bot token itself.
const H = { "Content-Type": "application/json", "Cache-Control": "no-store" };
const api = (token, method) => `https://api.telegram.org/bot${token}/${method}`;

exports.handler = async () => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token) {
    return json({ ok: false, step: "token", msg: "У Netlify не заданий TELEGRAM_BOT_TOKEN." });
  }

  let me;
  try {
    me = await (await fetch(api(token, "getMe"))).json();
  } catch (e) {
    return json({ ok: false, step: "token", msg: "Не вдалося з'єднатися з Telegram." });
  }
  if (!me.ok) {
    return json({ ok: false, step: "token", msg: "Токен бота недійсний — перевірте TELEGRAM_BOT_TOKEN." });
  }
  const bot = me.result.username;

  if (!chatId) {
    let chats = [];
    try {
      const upd = await (await fetch(api(token, "getUpdates"))).json();
      const map = new Map();
      for (const u of upd.result || []) {
        const c = (u.message || u.channel_post || {}).chat;
        if (c) map.set(c.id, [c.first_name, c.last_name, c.title, c.username].filter(Boolean).join(" "));
      }
      chats = [...map].map(([id, name]) => ({ id, name }));
    } catch (e) {}
    return json({
      ok: false,
      step: "chat",
      bot,
      chats,
      msg:
        "У Netlify не заданий TELEGRAM_CHAT_ID. Відкрийте Telegram, напишіть боту @" +
        bot +
        " будь-яке слово, і натисніть «Перевірити» ще раз — нижче з'явиться ваш ID.",
    });
  }

  let send;
  try {
    send = await (
      await fetch(api(token, "sendMessage"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "✅ Тест МЕС: сповіщення про заявки з сайту працюють.",
        }),
      })
    ).json();
  } catch (e) {
    return json({ ok: false, step: "send", bot, msg: "Помилка надсилання: " + e.message });
  }
  if (!send.ok) {
    return json({
      ok: false,
      step: "send",
      bot,
      msg:
        "Telegram відхилив повідомлення: " +
        (send.description || "невідома помилка") +
        ". Найчастіше — ви ще не написали боту @" + bot + " перше повідомлення.",
    });
  }
  return json({ ok: true, step: "done", bot, msg: "Готово! Тестове повідомлення надіслано у ваш Telegram." });
};

function json(body) {
  return { statusCode: 200, headers: H, body: JSON.stringify(body) };
}
