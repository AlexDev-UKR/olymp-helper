// ============ НАЛАШТУВАННЯ АДМІНІСТРАЦІЇ ============
// Змінюються один раз перед збіркою. Файл потрапляє в застосунок в обфускованому вигляді.
// Raw-посилання на файли репозиторію із законами (формат: https://raw.githubusercontent.com/НІК/РЕПОЗИТОРІЙ/main/файл.json)
const MANIFEST_URL="https://raw.githubusercontent.com/AlexDev-UKR/olymp-laws/refs/heads/main/manifest.json";
// Резервні адреси, якщо маніфест недоступний і кешу ще немає
const DEFAULT_LAWS_URL="https://raw.githubusercontent.com/AlexDev-UKR/olymp-laws/refs/heads/main/laws.json";
const DEFAULT_FAQ_URL="https://raw.githubusercontent.com/AlexDev-UKR/olymp-laws/refs/heads/main/faq.json";
// Telegram-канал автора та підтримки
const TG_URL="https://t.me/olymphelper_official";