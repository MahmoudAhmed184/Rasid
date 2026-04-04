# 🔔 Frelancia: Mostaql Job Notifier + AI Proposal

<div align="center">

![Version](https://img.shields.io/badge/version-1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Platform](https://img.shields.io/badge/platform-Chrome%20%7C%20Firefox-orange.svg)

**إضافة متصفح ذكية لتنبيهك فوراً بالمشاريع الجديدة على منصة مستقل مع إنشاء عروض احترافية بالذكاء الاصطناعي.**

*A professional cross-browser extension that instantly notifies you of new projects on Mostaql.com with AI-powered proposal generation.*

[English](#-english-description) | [العربية](#-الوصف-بالعربية)

</div>

---

## 🇸🇦 الوصف بالعربية

**Frelancia** هي رفيقك المثالي كـ Freelancer على منصة مستقل. تضمن لك هذه الإضافة ألا يفوتك أي مشروع مهم، وتساعدك على كتابة عروض مقنعة في ثوانٍ معدودة.

### ✨ المميزات الرئيسية
- 🌐 **تدعم Chrome و Firefox** بنفس الكفاءة
- 🔔 **تنبيهات فورية** عبر SignalR مع احتياطي تلقائي للاستعلام الدوري
- 🔌 **سيرفر مخصص** — ادعم سيرفر SignalR الخاص بك من إعدادات الإضافة
- 🎯 **فلاتر متقدمة** — كلمات مفتاحية، ميزانية، معدل توظيف، مدة التنفيذ، تصنيفات، ساعات هدوء
- 🤖 **توليد عروض بالذكاء الاصطناعي** مع قوالب قابلة للتخصيص الكامل
- 📝 **ملء تلقائي لنموذج العرض** — يملأ السعر والمقترح دفعةً واحدة
- 📊 **تحليلات العروض** — إجمالي، آخر 30 يوم، اليوم، وعداد تنازلي للعروض اليومية
- 🕐 **متتبع العروض** — جدول زمني لكل عرض مع شريط تقدم وعداد 30 يوماً
- 👁️ **مراقبة المشاريع** — تتبع أي مشروع ومتابعة تحديثاته
- 📤 **تصدير البيانات** — تصدير رسائل المشروع وبيانات المشروع كـ ZIP
- 🔊 **تنبيهات صوتية** قابلة للاختبار من لوحة التحكم
- ⚙️ **لوحة تحكم** شاملة لكل الإعدادات والإحصائيات والمشاريع المتابَعة

---

## 🇺🇸 English Description

**Frelancia** is the ultimate companion for freelancers on Mostaql.com. This extension ensures you never miss a high-value project and helps you craft winning proposals using advanced AI technology.

### ✨ Key Features
- 🌐 **Cross-browser support** — works seamlessly on Chrome and Firefox
- 🔔 **Instant notifications** via SignalR with automatic polling fallback
- 🔌 **Custom server** — point the extension at your own SignalR hub
- 🎯 **Advanced filters** — keywords, budget, hiring rate, duration, categories, quiet hours
- 🤖 **AI proposal generator** with fully customizable prompt templates
- 📝 **Bid form auto-fill** — fills price and proposal in one click
- 📊 **Bid analytics modal** — totals, last 30 days, today, and daily-slot countdown timers
- 🕐 **Bid tracker tab** — timeline view with 30-day progress bars per bid
- 👁️ **Project monitoring** — track any project and follow its updates
- 📤 **Data export** — export project messages and details as a ZIP archive
- 🔊 **Audio alerts** — testable directly from the dashboard
- ⚙️ **Full dashboard** — settings, stats, tracked projects, and prompt management

---

## 📥 التثبيت / Installation

### 🛠️ Manual Installation (Recommended)

Build the browser-specific packages first:

```bash
npm run build
```

#### For Google Chrome / Edge / Brave
1. Clone the repository or download the ZIP.
   ```bash
   git clone https://github.com/Elaraby218/Frelancia.git
   ```
2. Navigate to `chrome://extensions/` in your browser.
3. Toggle the **Developer mode** switch in the top right corner.
4. Click **Load unpacked** and select the `dist/chrome` directory.
5. Click the puzzle icon 🧩 and pin **Frelancia** to your toolbar.

#### For Mozilla Firefox
1. Navigate to `about:debugging#/runtime/this-firefox` in your browser.
2. Click **Load Temporary Add-on...**
3. Select `dist/firefox/manifest.json`.
4. Pin the extension from the extensions menu.

### 🔧 Development Build

Generate both browser packages:

```bash
npm run build
```

Generate only one target:

```bash
npm run build:chrome
npm run build:firefox
```

Clean generated output:

```bash
npm run clean
```

The build script treats `manifests/base.json` as the shared manifest source and writes browser-specific manifests to `dist/chrome/manifest.json` and `dist/firefox/manifest.json`.
The workspace root [`manifest.json`](manifest.json) is kept in sync with the Chrome build for local development convenience; use `dist/firefox/manifest.json` for Firefox testing.

Firefox testing instructions are available in [`docs/firefox-testing.md`](docs/firefox-testing.md).

---

## 🚀 كيفية الاستخدام / How to Use

1. **Configure Notifications**: Choose your target categories and polling interval.
2. **Setup AI Keys**: Go to settings and add your API key (OpenAI/Gemini/Claude).
3. **Get Notified**: Receive a desktop notification when a project matches your criteria.
4. **Generate Proposals**: Open any project on Mostaql and click the "Generate AI Proposal" button to create a professional draft instantly.

---

## 🛠️ Tech Stack / التقنيات المستخدمة

- **Manifest V3**: The latest Extension standard for both Chrome and Firefox.
- **Vanilla JavaScript**: For high performance and responsiveness.
- **CSS3 / Glassmorphism**: For a modern and premium dashboard look.
- **Chrome Storage API**: Secure local data management.
- **AI Integration**: Support for GPT-4, Gemini, and Claude models.

---

## 🔒 Privacy & Security

- **Local Storage**: All your settings and data are stored locally on your device.
- **Declared Remote Hosts**: The extension connects to Mostaql, AI chat pages, and the optional SignalR backend declared in the manifest.
- **Transparency**: Open-source code for full auditability.

Detailed disclosure draft: [`PRIVACY.md`](PRIVACY.md)

AMO reviewer notes: [`docs/amo-review.md`](docs/amo-review.md)

---

## 🤝 Contributing

See [`.github/CONTRIBUTING.md`](.github/CONTRIBUTING.md) for branch naming, code rules, and the PR checklist.

---

## 📞 Support & Links

- **Repository**: [https://github.com/Elaraby218/Frelancia](https://github.com/Elaraby218/Frelancia)
- **Issues**: [Report a Bug](https://github.com/Elaraby218/Frelancia/issues)
- **Developer**: [Elaraby218](https://github.com/Elaraby218) , [TryOmar](https://github.com/TryOmar)

---

<div align="center">

**صنع بـ ❤️ للمستقلين العرب**  
*Made with ❤️ for Arab Freelancers*

</div>
