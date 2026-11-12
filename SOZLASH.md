# Xisobchi — sozlamalar va eslatmalar

**Sayt manzili:** https://sherozisrael.github.io/xisobchi/

## Qanday ishlaydi

- Sayt GitHub Pages'da turadi (`sherozisrael/xisobchi` repozitoriysi).
  `sayt/` papkasidagi o'zgarish GitHub'ga yuborilsa, sayt 1–2 daqiqada o'zi yangilanadi.
- Ma'lumotlar har bir foydalanuvchining o'z Google Drive'idagi **Xisobchi** papkasida saqlanadi:
  `xisobchi.json` — asosiy fayl, `zaxira/` — har kunlik nusxalar.
- Google kirish sozlamalari: Google Cloud loyihasi `xisobchi-514512`.

## Yangi odamga ruxsat berish

Ilova "Testing" rejimida — faqat ro'yxatdagi Gmail'lar kira oladi.

1. https://console.cloud.google.com/auth/audience?project=xisobchi-514512
2. **Test users** → **+ Add users** → Gmail'ni yozing → **Save**.

## Yangi manzildan ochish kerak bo'lsa

https://console.cloud.google.com/auth/clients?project=xisobchi-514512 → kalitni oching →
**Authorized JavaScript origins** → **+ Add URI** → manzil (masalan `https://example.com`, oxirida `/` siz) → **Save**.

Hozir ro'yxatda: `http://localhost:8080`, `https://sherozisrael.github.io`

## Kompyuterda sinash

`ishga-tushirish.bat` ni ikki marta bosing → http://localhost:8080 ochiladi.
(Node.js kerak. Qora oynani yopsangiz, server to'xtaydi.)

## Muammo bo'lsa

| Belgi | Sabab | Yechim |
|---|---|---|
| `access_denied` | Gmail test users ro'yxatida yo'q | Yuqoridagi "Yangi odamga ruxsat berish" |
| `origin_mismatch` | Sayt manzili Google ro'yxatida yo'q | "Yangi manzildan ochish" bo'limi; o'zgarish kuchga kirishi bir necha daqiqa olishi mumkin |
| Google oynasi ochilmaydi | Brauzer popup'ni to'sgan | Manzil satridagi belgidan popup'ga ruxsat bering |
| Tepada sariq "Ulanish uchun bosing" | Brauzer qayta ochilgan | Bir marta bosing — normal holat |
