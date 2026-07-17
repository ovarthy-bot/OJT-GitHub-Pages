# OJT İş Takip — GitHub Pages sürümü

Ek-16 iş kayıtlarını ve taranmış belgeleri doğrudan kullanıcının Google Drive hesabında saklayan statik web/PWA uygulaması. Node.js sunucusu, ayrı veritabanı ve Client Secret gerektirmez.

## Sürüm 9 özellikleri

- Belge türüne göre yalnızca gerekli referans alanları gösterilir:
  - **Bakım kartı:** Bakım kartı no.
  - **NRC / Item:** NRC no.
  - **Servise verme / AML:** NRC no. + AML no.
  - **Diğer:** Referans kutusu gösterilmez.
- Süre alanı manuel yazılabilir; `−` ve `+` düğmeleriyle 15 dakikalık (`0,25 saat`) adımlarla değiştirilebilir.
- İş grubu seçimi kaldırılmıştır. Bütün Ek-16 iş türleri tek listede gösterilir.
- Daha önce hiç açılmamış iş türleri seçim listesinde ve arşivde kırmızı işaretlenir.
- İkinci ekran olarak **PDF Dashboard** eklenmiştir:
  - Google Drive’daki bağlı belgelerin ilk sayfa küçük resimleri,
  - W/O, NRC, A/C, açıklama, etiket ve PDF notu,
  - Tüm bu alanlarda arama,
  - Etikete göre filtreleme,
  - PDF’i açma ve belge bilgilerini düzenleme.
- Dashboard, masaüstünde sol etiket menüsü ve kart görünümü; mobilde uyarlanabilir tek sütun düzeni kullanır.

## Kayıt ve mükerrer tarih kuralları

- Aynı gün birden fazla kayıt oluşturulabilir; kayıt engellenmez, kaydetmeden önce uyarı gösterilir.
- Mükerrer bir tarihte yalnızca bir kayıt uygun kabul edilir.
- Uygun kayıt seçilirken başka bir tekil tarihte henüz açılmamış veya daha az temsil edilen iş türlerine öncelik verilir.
- Diğer aynı tarihli kayıtlar **“Bu iş için uygun değil — aynı tarih kullanıldı”** uyarısıyla gösterilir.
- `11.07.2026`, `11/07/2026`, `2026-07-11` ve aynı güne karşılık gelen tarih-saat değerleri aynı tarih kabul edilir.
- Temmuz ve Ağustos 2026 çalışma takviminde Off dışındaki boş günler kırmızı gösterilir.

## 1. Google Cloud ayarı

1. Google Cloud Console’da projenizi açın.
2. **Google Drive API** hizmetini etkinleştirin.
3. **Google Auth Platform > Clients** bölümünde **Web application** türünde OAuth istemcisi oluşturun veya mevcut istemciyi açın.
4. GitHub Pages adresiniz `https://KULLANICI.github.io/ojt-is-takip/` olacaksa **Authorized JavaScript origins** alanına şunu ekleyin:

```text
https://KULLANICI.github.io
```

5. OAuth uygulaması test modundaysa uygulamayı kullanacak Gmail adreslerini **Audience > Test users** bölümüne ekleyin.

## 2. Client ID

`public/config.js` dosyasındaki örnek değeri Web Client ID ile değiştirin:

```js
window.OJT_CONFIG = {
  GOOGLE_CLIENT_ID: 'BURAYA_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
};
```

Client ID herkese açık tanımlayıcıdır. Client Secret eklemeyin.

## 3. GitHub Pages yayını

Depoyu GitHub’a gönderin:

```bash
git add .
git commit -m "OJT uygulamasi v9"
git push
```

Ardından depoda **Settings > Pages > Build and deployment > Source** bölümünden **GitHub Actions** seçin. `.github/workflows/pages.yml` dosyası `public` klasörünü yayınlar.

## PWA kurulumu

### iPhone / iPad

Safari’de siteyi açın, **Paylaş > Ana Ekrana Ekle** seçeneğini kullanın.

### Android / masaüstü Chrome

Tarayıcının adres çubuğundaki **Yükle** seçeneğini veya menüdeki **Uygulamayı yükle** komutunu kullanın.

## Veri ve güvenlik

- Kayıtlar `OJT İş Takip/ojt-kayitlari.json` dosyasında saklanır.
- Belgeler `OJT İş Takip/Belgeler` klasörüne yüklenir.
- PDF Dashboard küçük resimleri Google Drive’ın belge önizlemesinden alınır.
- Uygulama `drive.file` iznini kullanır ve kendi oluşturduğu dosyaları yönetir.
- Google erişim anahtarı tarayıcıda süreli olarak saklanır; süresi dolduğunda yeniden bağlantı istenir.
- Drive verileri GitHub deposuna yazılmaz.
