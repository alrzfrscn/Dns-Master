<div dir="rtl" align="right">

# ⚡ Dns Master

**ابزار نسل جدید تغییر DNS ویندوز، موتور بنچمارک RFC 1035 و داشبورد مانیتورینگ زنده شبکه با Win32**<div align="center">

<p align="center">
  <a href="https://github.com/alrzfrscn/Dns-Master/releases"><strong>⬇️ دانلود جدیدترین نسخه نصبی</strong></a>
  ·
  <a href="./README.md"><strong>🇬🇧 English Documentation</strong></a>
  ·
  <a href="./docs/ARCHITECTURE.md"><strong>📐 معماری فنی سیستم</strong></a>
  ·
  <a href="https://github.com/alrzfrscn/Dns-Master/issues"><strong>🐞 گزارش باگ</strong></a>
  ·
  <a href="https://github.com/alrzfrscn/Dns-Master/issues"><strong>➕ پیشنهاد DNS</strong></a>
</p>

<br />


<img src="./assets/dashboard.png" alt="محیط برنامه Dns Master" width="100%" />

</div>

---

## 🎯 چرا Dns Master؟

اکثر ابزارهای تغییر DNS در ویندوز به رابط‌های کاربری قدیمی وابسته‌اند، پنجره‌های قابل‌مشاهده `cmd.exe` باز می‌کنند یا برای سنجش سرعت از پینگ ساده ICMP استفاده می‌کنند که بسیاری از ارائه‌دهندگان DNS آن را مسدود می‌کنند یا در شبکه‌های Anycast نتیجه نادرست می‌دهد. **Dns Master** از پایه با **Rust (`windows-sys`)** و **React 19** ساخته شده تا یک داشبورد کنترل شبکه سبک، دقیق و در شأن گیمینگ ارائه کند.

| قابلیت | ابزارهای قدیمی DNS | ⚡ Dns Master (`v1.0.0`) |
| :--- | :--- | :--- |
| **سنجش تأخیر** | پینگ ساده ICMP (اغلب مسدود یا نادقیق) | **کوئری واقعی DNS روی UDP:53** طبق RFC 1035 + پشتیبان TCP:53 و محاسبه Jitter |
| **بررسی تحریم و فیلترینگ** | ندارد | **تستر زنده TLS/SNI** + تشخیص Sinkhole ارائه‌دهنده اینترنت (`10.10.34.x`) |
| **مانیتورینگ زنده پهنای باند** | ندارد یا نظرسنجی سنگین CPU | **`GetIfTable2` ویندوز با مصرف تقریباً صفر CPU** و جریان زنده دانلود/آپلود هر ثانیه |
| **خواندن و نوشتن ایمن DNS** | اجرای کورکورانه `netsh` همراه با پرش پنجره CMD | **خواندن مستقل از زبان از رجیستری**، اجرای مخفی با `CREATE_NO_WINDOW`، تأیید بازخوانی و **بازگردانی یک‌کلیکی** |
| **به‌روزرسانی لیست رزولورها** | سخت‌کدشده / ویرایش دستی `.ini` | **همگام‌سازی یک‌کلیکی JSON از GitHub** + ورود/خروج JSON محلی |

---

## ✨ امکانات اصلی

- 🔮 **رابط کاربری شیشه‌ای Obsidian (`1100×720`)** — محیط تاریک بدون قاب با تلمتری زنده Recharts، رادار مسیر و میانبرهای کیبورد (`Ctrl+1…4`).
- 🚀 **موتور بنچمارک موازی UDP:53** — جاروب هم‌زمان بیش از ۳۰ رزولور جهانی و ایرانی با تعداد محدودی worker thread در کمتر از ۲ ثانیه، همراه با پیشرفت زنده هر سرور.
- 🛡️ **ماتریس عبور از تحریم** — آزمایش واقعی resolve شدن DNS و دسترسی TLS SNI روی پورت `443` برای **Docker Hub، GitHub، OpenAI API، Hugging Face، Steam Store و EA Online**.
- 🔌 **تشخیص هوشمند چند آداپتور** — شمارش رابط‌های فیزیکی (`Wi-Fi`، `Ethernet`) و مجازی/VPN با `GetAdaptersAddresses` و `GetIpForwardTable2` و برجسته‌سازی خودکار مسیر پیش‌فرض فعال.
- 🔒 **محافظ نشت IPv6** — جلوگیری از نشت DNS اینترنت‌سرویس‌دهنده با اتصال رزولور IPv6 رابط به loopback (`::1`) بدون غیرفعال کردن پشته IPv6 ویندوز.
- ⏪ **بازگردانی تراکنشی DNS** — پیش از اعمال DNS جدید، تنظیمات قبلی آداپتور به‌صورت خودکار ذخیره می‌شود تا با یک کلیک قابل بازیابی باشد.
- 🖥️ **سینی سیستم و اجرای خودکار بی‌صدا** — کوچک شدن تمیز به سینی ویندوز برای جابه‌جایی فوری (`Engage Electro`، `Reset DHCP`، `Flush DNS`) و پشتیبانی از اجرا در زمان بوت از طریق `HKCU\...\Run` با سوییچ `--minimized`.

---

## 📥 نصب (ویندوز ۱۰ / ۱۱)

1. به [**صفحه Releases**](https://github.com/alrzfrscn/Dns-Master/releases) بروید.
2. جدیدترین فایل **`Dns.Master_1.0.0_x64-setup.exe`** یا **`Dns.Master_1.0.0_x64_en-US.msi`** را دانلود کنید.
3. نصب‌کننده را اجرا کرده و **Dns Master** را باز کنید.
   > **نکته درباره ارتقای UAC:** خواندن تلمتری، بنچمارک UDP:53 و پاک‌کردن کش DNS به **هیچ** دسترسی ادمینی نیاز ندارد. مجوز UAC ویندوز *فقط* هنگام نوشتن DNS جدید روی آداپتور شبکه درخواست می‌شود.

---

## 🌐 لیست جامعه DNS و همگام‌سازی GitHub (`dns_list.json`)

**Dns Master** می‌تواند سرورهای DNS به‌روز را مستقیماً از GitHub و از مسیر **Settings → Resolver Source** (یا دکمه **Sync** در **DNS Vault**) دریافت کند.

آدرس پیش‌فرض مانیفست جامعه:
```text
https://raw.githubusercontent.com/alrzfrscn/Dns-Master/main/dns_list.json
```

### 🤝 افزودن DNS جدید (Pull Request)
DNS سریع برای گیمینگ یا عبور از تحریم می‌شناسید؟ آن را به [`dns_list.json`](./dns_list.json) اضافه کنید و یک Pull Request باز کنید! پس از ادغام، همه کاربران Dns Master بلافاصله با دکمه **Sync** آن را دریافت می‌کنند.

```json
{
  "version": 1,
  "servers": [
    {
      "id": "electro",
      "name": "Electro",
      "provider": "Electro Team · الکترو",
      "primary": "78.157.42.100",
      "secondary": "78.157.42.101",
      "category": "gaming",
      "location": "IR · Tehran",
      "tags": ["gaming", "bypass", "iran"]
    }
  ]
}
```
*دسته‌بندی‌های پشتیبانی‌شده:* `"gaming"` | `"sanction"` | `"security"` | `"general"`

---

## 🛠️ پشته فناوری و توسعه

- **فرانت‌اند:** React 19، TypeScript، Vite 7، Tailwind CSS 4، Recharts، آیکون‌های Lucide و فونت‌های میزبانی‌شده محلی `@fontsource` (`Oxanium`، `Sora`، `JetBrains Mono`).
- **بک‌اند (`src-tauri`):** Rust، Tauri v2، فراخوانی مستقیم Win32 API از طریق `windows-sys` (`IpHelper`، `Ndis`، `WinSock`، `Registry`)، پارسر DNS خالص `std` طبق RFC 1035 و تستر SNI با ClientHello TLS.
- **بررسی عمیق معماری:** برای قراردادهای کامل IPC و جزئیات داخلی، [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) را بخوانید.

### ساخت از سورس

```powershell
# 1. Install frontend dependencies
npm install

# 2. Run in development mode (Vite + Tauri native window)
npm run tauri dev

# 3. Run Rust unit tests (46 tests) & frontend type-check
cargo test --manifest-path src-tauri/Cargo.toml
npm run build

# 4. Build production Windows installers (.exe & .msi)
npm run tauri build
```

---

## ⭐ حمایت از پروژه

اگر **Dns Master** به کاهش پینگ شما کمک کرد یا موانع توسعه را دور زد، لطفاً به این مخزن **ستاره ⭐** بدهید و آن را با دوستانتان به اشتراک بگذارید!

</div>
