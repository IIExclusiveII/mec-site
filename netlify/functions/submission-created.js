// Netlify calls this automatically after every successful form submission
// (any function named "submission-created" in the functions dir is a form hook).
// It forwards the lead to Telegram. Configure two environment variables in
// Netlify → Site configuration → Environment variables:
//   TELEGRAM_BOT_TOKEN  – from @BotFather
//   TELEGRAM_CHAT_ID    – your personal / group chat id (see /admin/telegram.html)
const esc = (s) =>
  String(s == null ? "" : s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));

exports.handler = async (event) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("submission-created: Telegram env vars not set — skipping");
    return { statusCode: 200, body: "telegram not configured" };
  }

  let data = {};
  let formName = "";
  try {
    const payload = JSON.parse(event.body).payload || {};
    data = payload.data || {};
    formName = payload.form_name || payload.form || "";
  } catch (e) {
    return { statusCode: 200, body: "bad payload" };
  }

  const skip = new Set(["bot-field", "form-name", "ip", ""]);
  const known = { name: "👤", phone: "📞", service: "🔧", message: "💬", email: "✉️" };
  const lines = ["🔔 <b>Нова заявка з сайту</b>"];
  for (const k of ["name", "phone", "service", "email", "message"]) {
    if (data[k] && String(data[k]).trim()) lines.push(`${known[k]} ${esc(data[k])}`);
  }
  for (const [k, v] of Object.entries(data)) {
    if (skip.has(k) || known[k] || !String(v).trim()) continue;
    lines.push(`• ${esc(k)}: ${esc(v)}`);
  }
  lines.push("");
  lines.push("🕒 " + new Date().toLocaleString("uk-UA", { timeZone: "Europe/Kyiv" }));
  if (formName) lines.push("📄 форма: " + esc(formName));

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    });
    const j = await res.json();
    if (!j.ok) console.error("Telegram sendMessage failed:", j.description);
  } catch (e) {
    console.error("Telegram request error:", e.message);
  }
  return { statusCode: 200, body: "ok" };
};
