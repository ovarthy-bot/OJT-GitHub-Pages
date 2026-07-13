# OJT İş Takip - GitHub Pages sürümü

Sunucusuz çalışan, kullanıcı verilerini ve belgelerini doğrudan kendi Google Drive hesabında saklayan statik web/PWA uygulaması. Node.js, Render, veritabanı sunucusu ve Client Secret gerektirmez.

## 1. Google Cloud ayarı

1. Google Cloud Console'da kullandığınız projeyi açın.
2. **Google Drive API** hizmetinin etkin olduğundan emin olun.
3. **Google Auth Platform > Clients** bölümünde **Web application** türünde bir OAuth istemcisi oluşturun veya mevcut istemciyi açın.
4. GitHub Pages adresiniz `https://KULLANICI.github.io/ojt-is-takip/` olacaksa **Authorized JavaScript origins** alanına şunu ekleyin:

```text
https://KULLANICI.github.io
```

5. Bu statik sürüm callback adresi ve Client Secret kullanmaz.
6. OAuth uygulaması test modundaysa uygulamayı kullanacak Gmail adreslerini **Audience > Test users** bölümüne ekleyin.

## 2. Client ID

`public/config.js` dosyasını açıp:

```js
GOOGLE_CLIENT_ID: 'BURAYA_GOOGLE_CLIENT_ID.apps.googleusercontent.com'
```

değerini Google Cloud'daki Web Client ID ile değiştirin. Client ID herkese açık bir tanımlayıcıdır; Client Secret değildir.

## 3. GitHub'a gönderme

GitHub'da tercihen `ojt-is-takip` adlı bir depo oluşturun. GitHub Free kullanıyorsanız ücretsiz Pages yayını için depoyu **Public** oluşturun. Public olan yalnızca uygulama kaynak kodudur; kullanıcıların Drive kayıtları ve belgeleri depoya gönderilmez. Proje klasöründe:

```bash
git init
git add .
git commit -m "GitHub Pages OJT uygulamasi"
git branch -M main
git remote add origin https://github.com/KULLANICI/ojt-is-takip.git
git push -u origin main
```

## 4. GitHub Pages'ı açma

1. GitHub deposunda **Settings > Pages** bölümünü açın.
2. **Build and deployment > Source** alanında **GitHub Actions** seçin.
3. Depodaki `.github/workflows/pages.yml` iş akışı `public` klasörünü otomatik yayınlar.
4. **Actions** sekmesindeki `GitHub Pages` işlemi tamamlandığında site adresi görüntülenir.

Sonraki değişikliklerde yalnızca:

```bash
git add .
git commit -m "Uygulama guncellemesi"
git push
```

komutları yeterlidir.

## iPhone'a uygulama gibi ekleme

1. Siteyi Safari'de açın.
2. **Paylaş** düğmesine dokunun.
3. **Ana Ekrana Ekle** seçin.

Uygulama PWA/standalone modunda açılır. Drive işlemleri için internet bağlantısı ve gerektiğinde yeniden Google yetkilendirmesi gerekir.

## Güvenlik

- Google Drive verileri GitHub'a yazılmaz.
- Uygulama `drive.file` izni kullanır ve yalnızca kendi oluşturduğu/seçtiği dosyaları yönetir.
- Erişim anahtarı yalnızca açık tarayıcı oturumunun belleğinde tutulur; localStorage'a kaydedilmez.
- Client Secret bu projede kullanılmaz ve hiçbir dosyaya yazılmamalıdır.
