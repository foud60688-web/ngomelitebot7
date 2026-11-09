
const { Telegraf, Markup } = require("telegraf");

const token = process.env.BOT_TOKEN;
const adminId = Number(process.env.ADMIN_ID || "6809336258");
const cashNumber = process.env.CASH_NUMBER || "01024689530";
const channelId = process.env.CHANNEL_ID || "";
const autoReactions = process.env.AUTO_REACTIONS !== "false";

if (!token) {
  console.error("Missing BOT_TOKEN");
  process.exit(1);
}

const bot = new Telegraf(token);

const selectedPlans = new Map();
const pendingRequests = new Map();
const users = new Set();

let acceptedCount = 0;
let rejectedCount = 0;
let receiptCount = 0;
let reactionCount = 0;

const reactions = ["👍", "❤️", "🔥", "👏", "⚽", "😍"];

function isAdmin(ctx) {
  return ctx.from && ctx.from.id === adminId;
}

function planKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback("اشتراك أسبوعي — 200 جنيه", "plan:weekly")],
    [Markup.button.callback("اشتراك شهري — 500 جنيه", "plan:monthly")]
  ]);
}

bot.start(async (ctx) => {
  users.add(ctx.from.id);

  await ctx.reply(
    "أهلاً بيك في نجوم الرياضة النخبة ⭐\n\nاختار مدة الاشتراك المناسبة ليك:",
    planKeyboard()
  );
});

bot.action("plan:weekly", async (ctx) => {
  await ctx.answerCbQuery();
  selectedPlans.set(ctx.from.id, {
    label: "أسبوعي",
    price: 200
  });

  await ctx.reply(
    `اخترت الاشتراك الأسبوعي بقيمة 200 جنيه.\n\nحوّل المبلغ على فودافون كاش:\n📱 ${cashNumber}\n\nبعد التحويل ابعت صورة إيصال الدفع هنا.`
  );
});

bot.action("plan:monthly", async (ctx) => {
  await ctx.answerCbQuery();
  selectedPlans.set(ctx.from.id, {
    label: "شهري",
    price: 500
  });

  await ctx.reply(
    `اخترت الاشتراك الشهري بقيمة 500 جنيه.\n\nحوّل المبلغ على فودافون كاش:\n📱 ${cashNumber}\n\nبعد التحويل ابعت صورة إيصال الدفع هنا.`
  );
});

bot.on("photo", async (ctx) => {
  const user = ctx.from;
  const plan = selectedPlans.get(user.id);

  if (!plan) {
    return ctx.reply("اختار نوع الاشتراك الأول من خلال /start.");
  }

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
          "راجع الإيصال واختر قبول أو رفض.",
        ...Markup.inlineKeyboard([
          [
            Markup.button.callback("✅ قبول الاشتراك", `ok:${user.id}`),
            Markup.button.callback("❌ رفض الإيصال", `no:${user.id}`)
          ]
        ])
      }
    );

    pendingRequests.set(user.id, {
      plan,
      adminMessageId: sent.message_id
    });

    receiptCount++;
    selectedPlans.delete(user.id);

    await ctx.reply(
      "وصل إيصالك للإدارة بنجاح ✅\nهنراجع التحويل ونبلغك بالنتيجة هنا."
    );
  } catch (err) {
    console.error("Receipt error:", err);
    await ctx.reply("حصلت مشكلة في إرسال الإيصال. حاول مرة تانية.");
  }
});

bot.action(/^ok:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("للإدارة فقط.", { show_alert: true });
  }

  const userId = Number(ctx.match[1]);
  const request = pendingRequests.get(userId);

  if (!request) {
    return ctx.answerCbQuery("الطلب غير موجود أو تم التعامل معه.");
  }

  await ctx.answerCbQuery("تم قبول الاشتراك.");

  await ctx.telegram.sendMessage(
    userId,
    `تم قبول إيصال الدفع الخاص باشتراكك (${request.plan.label}) بنجاح 🎉\n\nأهلاً بيك في نجوم الرياضة النخبة ⭐\nسيتم إضافتك للمجموعة بواسطة الإدارة.`
  );

  acceptedCount++;
  pendingRequests.delete(userId);

  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || "") +
      "\n\n✅ تم قبول الطلب بواسطة الإدارة.",
    { reply_markup: { inline_keyboard: [] } }
  );
});

bot.action(/^no:(\d+)$/, async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.answerCbQuery("للإدارة فقط.", { show_alert: true });
  }

  const userId = Number(ctx.match[1]);
  const request = pendingRequests.get(userId);

  if (!request) {
    return ctx.answerCbQuery("الطلب غير موجود أو تم التعامل معه.");
  }

  await ctx.answerCbQuery("تم رفض الإيصال.");

  await ctx.telegram.sendMessage(
    userId,
    "للأسف تعذر تأكيد إيصال الدفع. راجع بيانات التحويل وابعت صورة إيصال واضحة، أو تواصل مع الإدارة."
  );

  rejectedCount++;
  pendingRequests.delete(userId);

  await ctx.editMessageCaption(
    (ctx.callbackQuery.message.caption || "") +
      "\n\n❌ تم رفض الطلب بواسطة الإدارة.",
    { reply_markup: { inline_keyboard: [] } }
  );
});

// لوحة تحكم الإدارة
bot.command("admin", async (ctx) => {
  if (!isAdmin(ctx)) {
    return ctx.reply("الأمر ده خاص بالإدارة فقط.");
  }

  await ctx.reply(
    "⭐ لوحة إدارة نجوم الرياضة\n\n" +
    `👥 المستخدمون: ${users.size}\n` +
    `🧾 الإيصالات المستلمة: ${receiptCount}\n` +
    `⏳ الطلبات المعلقة: ${pendingRequests.size}\n` +
    `✅ الاشتراكات المقبولة: ${acceptedCount}\n` +
    `❌ الإيصالات المرفوضة: ${rejectedCount}\n` +
    `🔥 التفاعلات المرسلة: ${reactionCount}\n\n` +
    "استخدم /start لاختبار الاشتراك."
  );
});

bot.command("help", async (ctx) => {
  await ctx.reply(
    "لبدء الاشتراك اضغط /start، ثم اختار الباقة وابعت صورة إيصال التحويل."
  );
});

// تفاعل تلقائي مع منشورات القناة
bot.on("channel_post", async (ctx) => {
  if (!autoReactions) return;

  const post = ctx.channelPost;

  if (channelId && String(post.chat.id) !== String(channelId)) {
    return;
  }

  const emoji = reactions[Math.floor(Math.random() * reactions.length)];

  try {
    await ctx.telegram.callApi("setMessageReaction", {
      chat_id: post.chat.id,
      message_id: post.message_id,
      reaction: [{ type: "emoji", emoji }],
      is_big: false
    });

    reactionCount++;
    console.log("Reaction sent:", emoji);
  } catch (err) {
    console.error("Reaction failed:", err.message);
  }
});

bot.catch((err) => {
  console.error("Telegram bot error:", err);
});

bot.launch()
  .then(() => {
    console.log("Nogoom El Riyada bot is running.");
  })
  .catch((err) => {
    console.error("Bot failed to start:", err);
    process.exit(1);
  });

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
