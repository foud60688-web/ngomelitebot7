const { Telegraf, Markup } = require("telegraf");

const token = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID || "6809336258");
const cashNumber = process.env.CASH_NUMBER || "01024689530";

if (!token) {
  console.error("Missing BOT_TOKEN environment variable.");
  process.exit(1);
}

const bot = new Telegraf(token);

// In-memory state: users select a plan, then send a receipt photo.
// For a first version this is intentionally simple; pending requests reset on restart.
const selectedPlans = new Map();
const pendingRequests = new Map();

const welcomeText =
  "أهلاً بيك في *نجوم الرياضة النخبة* ⭐\n\n" +
  "اختار مدة الاشتراك المناسبة ليك:";

function planKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("اشتراك أسبوعي — 200 جنيه", "plan:weekly")],
    [Markup.button.callback("اشتراك شهري — 500 جنيه", "plan:monthly")]
  ]);
}

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === adminId;
}

bot.start(async (ctx) => {
  await ctx.reply(welcomeText, {
    parse_mode: "Markdown",
    ...planKeyboard()
  });
});

bot.action("plan:weekly", async (ctx) => {
  await ctx.answerCbQuery();
  selectedPlans.set(ctx.from.id, { key: "weekly", label: "أسبوعي", price: 200 });
  await ctx.reply(
    `اخترت الاشتراك الأسبوعي بقيمة 200 جنيه.\n\nحوّل المبلغ على فودافون كاش:\n📱 ${cashNumber}\n\nبعد التحويل ابعت صورة إيصال الدفع هنا في المحادثة.`
  );
});

bot.action("plan:monthly", async (ctx) => {
  await ctx.answerCbQuery();
  selectedPlans.set(ctx.from.id, { key: "monthly", label: "شهري", price: 500 });
  await ctx.reply(
    `اخترت الاشتراك الشهري بقيمة 500 جنيه.\n\nحوّل المبلغ على فودافون كاش:\n📱 ${cashNumber}\n\nبعد التحويل ابعت صورة إيصال الدفع هنا في المحادثة.`
  );
});

bot.on("photo", async (ctx) => {
  const plan = selectedPlans.get(ctx.from.id);
  if (!plan) {
    return ctx.reply("من فضلك اختار نوع الاشتراك الأول من خلال /start.");
  }

  const user = ctx.from;
  const username = user.username ? `@${user.username}` : "بدون username";
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");

  try {
    const sent = await ctx.telegram.sendPhoto(
      adminId,
      ctx.message.photo[ctx.message.photo.length - 1].file_id,
      {
        caption:
          "🧾 طلب اشتراك جديد — نجوم الرياضة النخبة\n\n" +
          `الاسم: ${name || "غير متاح"}\n` +
          `يوزر تيليجرام: ${username}\n` +
          `رقم المستخدم: ${user.id}\n` +
          `الاشتراك: ${plan.label}\n` +
          `المبلغ: ${plan.price} جنيه\n\n` +
          "راجع الإيصال ثم اختر قبول أو رفض.",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ قبول الاشتراك", `ok:${user.id}`),
            Markup.button.callback("❌ رفض الإيصال", `no:${user.id}`)
          ]
        ])
      }
    );

    pendingRequests.set(user.id, { plan, adminMessageId: sent.message_id });
    selectedPlans.delete(user.id);
    await ctx.reply("وصل إيصالك للإدارة بنجاح ✅\nهنراجع التحويل ونبلغك بالنتيجة هنا.");
  } catch (err) {
    console.error("Could not forward receipt to admin:", err);
    await ctx.reply("حصلت مشكلة في إرسال الإيصال للإدارة. حاول مرة تانية بعد قليل.");
  }
});

bot.action(/^ok:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("الإجراء ده خاص بالإدارة فقط.", { show_alert: true });
  }
  const userId = Number(ctx.match[1]);
  const request = pendingRequests.get(userId);
  if (!request) {
    await ctx.answerCbQuery("الطلب غير موجود أو تم التعامل معه بالفعل.", { show_alert: true });
    return;
  }

  await ctx.answerCbQuery("تم قبول الاشتراك.");
  await ctx.telegram.sendMessage(
    userId,
    `تم قبول إيصال الدفع الخاص باشتراكك (${request.plan.label}) بنجاح 🎉\n\nأهلاً بيك في نجوم الرياضة النخبة ⭐\nسيتم إضافتك للمجموعة بواسطة الإدارة.`
  );
  pendingRequests.delete(userId);
  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || "") + "\n\n✅ تم قبول الطلب بواسطة الإدارة.",
    { reply_markup: { inline_keyboard: [] } }
  );
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("الإجراء ده خاص بالإدارة فقط.", { show_alert: true });
  }
  const userId = Number(ctx.match[1]);
  const request = pendingRequests.get(userId);
  if (!request) {
    await ctx.answerCbQuery("الطلب غير موجود أو تم التعامل معه بالفعل.", { show_alert: true });
    return;
  }

  await ctx.answerCbQuery("تم رفض الإيصال.");
  await ctx.telegram.sendMessage(
    userId,
    "للأسف تعذر تأكيد إيصال الدفع. راجع بيانات التحويل وابعت صورة إيصال واضحة، أو تواصل مع الإدارة."
  );
  pendingRequests.delete(userId);
  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || "") + "\n\n❌ تم رفض الطلب بواسطة الإدارة.",
    { reply_markup: { inline_keyboard: [] } }
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply("لبدء الاشتراك اضغط /start، ثم اختار الباقة وابعت صورة إيصال التحويل.");
});

bot.catch((err) => {
  console.error("Telegram bot error:", err);
});

bot.launch().then(() => {
  console.log("Nogoom El Riyada subscription bot is running.");
}).catch((err) => {
  console.error("Bot failed to start:", err);
  process.exit(1);
});

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
