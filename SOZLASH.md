# Xisobchi — internetga joylash va Google Drive'ni ulash

Bir martalik ish, taxminan 20 daqiqa. Hammasi bepul.
Tartib muhim: **avval sayt manzilini olamiz, keyin Google'ni sozlaymiz.**

---

## 1. Saytni Netlify'ga joylash (≈5 daqiqa)

1. https://app.netlify.com ga kiring → **Sign up** → **Continue with Google**.
2. **Add new project** (yoki *Add new site*) → **Deploy manually**.
3. Kompyuterdagi `D:\Loyihalar\Xisobchi\sayt` papkasini **butunligicha** sahifadagi maydonga sudrab tashlang.
4. Joylangach: **Project configuration → Change project name** → masalan `xisobchi-ishxona`.
   Sayt manzili shunday bo'ladi: **https://xisobchi-ishxona.netlify.app**
   Bu manzilni yozib qo'ying, keyingi qadamda kerak bo'ladi.

## 2. Google Cloud'da kalit (Client ID) olish (≈10 daqiqa)

1. https://console.cloud.google.com ga Gmail'ingiz bilan kiring.
2. Tepadagi loyiha tanlagich → **New project** → nomi: `Xisobchi` → **Create**. Keyin shu loyihani tanlang.
3. **Google Drive API'ni yoqing:** qidiruvga `Google Drive API` deb yozing → **Enable**.
4. **Kirish oynasini sozlang:** qidiruvga `Google Auth Platform` deb yozing → **Get started**:
   - App name: `Xisobchi`
   - User support email: Gmail'ingiz
   - Audience: **External**
   - Contact email: Gmail'ingiz → **Create**
5. **Kim kira olishini belgilang:** chap menyuda **Audience** → **Test users** → **Add users** →
   ukangizning Gmail'ini (va o'zingiznikini) qo'shing → **Save**.
   (Faqat shu ro'yxatdagi odamlar kira oladi — bu xavfsizroq.)
6. **Kalit yarating:** chap menyuda **Clients** → **Create client**:
   - Application type: **Web application**
   - Name: `Xisobchi sayt`
   - **Authorized JavaScript origins** → **Add URI** → `https://xisobchi-ishxona.netlify.app`
     (1-qadamdagi manzilingiz; oxirida `/` belgisi bo'lmasin)
   - **Create**
7. Chiqqan **Client ID**'ni nusxalang. U shunga o'xshaydi:
   `123456789012-abc123def456.apps.googleusercontent.com`

## 3. Kalitni saytga qo'yish (≈2 daqiqa)

1. `D:\Loyihalar\Xisobchi\sayt\config.js` faylini Notepad bilan oching.
2. `GOOGLE_CLIENT_ID: ''` qatoridagi qo'shtirnoqlar orasiga Client ID'ni qo'ying:
   ```js
   GOOGLE_CLIENT_ID: '123456789012-abc123def456.apps.googleusercontent.com',
   ```
3. Saqlang.
4. Netlify'da loyihangiz → **Deploys** → `sayt` papkasini yana sudrab tashlang (yangilanadi).

## 4. Tekshirish

1. https://xisobchi-ishxona.netlify.app ni oching.
2. Summani kiriting → **Boshlash** → sariq oynadagi **Google bilan ulash** tugmasini bosing.
3. Google akkauntni tanlang. **«Google hasn't verified this app»** chiqsa → **Continue** (Davom etish).
   Bu normal holat: ilova sizniki, uni Google rasman tekshirmagan.
4. Ruxsatlar oynasida Drive katagi belgilangan bo'lsin → **Continue**.
5. Tepada yashil **«Drive'ga saqlandi»** chiqsa — tayyor.
   Google Drive'da **Xisobchi** papkasi, ichida `xisobchi.json` va `zaxira` paydo bo'ladi.

---

## Ukangizga yuboriladigan xabar

> Havola: https://xisobchi-ishxona.netlify.app
>
> 1. Chrome'da oching (telefonda ham ishlaydi).
> 2. Kassadagi summani kiriting → «Boshlash».
> 3. «Google bilan ulash» → Gmail'ingizni tanlang → «Continue» → ruxsat bering.
> 4. Tepada yashil «Drive'ga saqlandi» chiqsa — hammasi joyida.
>
> Har safar ochganda tepada sariq «Ulanish uchun bosing» chiqsa — bir marta bosing.
> Boshqa kompyuter yoki telefondan: havolani ochib, «Google Drive'dagi ma'lumotni ochish»ni bosing.

---

## Keyinchalik o'zgartirish kiritilsa

`sayt` papkasidagi fayllar yangilangach, Netlify → **Deploys** → papkani yana sudrab tashlang.
Ma'lumotlarga hech narsa qilmaydi — ular Google Drive'da turadi.

## Muammo bo'lsa

| Belgi | Sabab | Yechim |
|---|---|---|
| «Google sozlanmagan» | `config.js` da Client ID yo'q | 3-qadam |
| Kirishda `redirect_uri_mismatch` / `origin_mismatch` | Google'dagi manzil sayt manzili bilan bir xil emas | 2.6-qadamni tekshiring (`https://`, oxirida `/` yo'q) |
| `access_denied` | Gmail test users ro'yxatida yo'q | 2.5-qadam |
| Google oynasi ochilmaydi | Brauzer popup'ni to'sgan | Manzil satridagi belgidan popup'ga ruxsat bering |
