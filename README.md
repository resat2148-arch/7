# Planetfall Factory

**Planetfall Factory**, Satisfactory'den ilham alan, CrazyGames için tasarlanmış 2D tarayıcı fabrika kurma / otomasyon oyunudur. Uzaylı bir gezegene iniyor, cevher kazıyor, konveyör bantları çekiyor, dev bir üretim zinciri kuruyor ve sonunda Uzay Asansörü ile "Proje Montajı"nı tamamlıyorsun.

Saf HTML5 + Canvas + JavaScript ile yazıldı. Build adımı, harici asset ve kütüphane yok. Sesler WebAudio ile, görseller canvas ile kod içinde üretiliyor. `index.html`'i bir statik sunucudan açman yeterli.

```bash
python3 -m http.server 8000   # sonra http://localhost:8000
```

## Satisfactory araştırması → web uyarlaması

| Satisfactory | Planetfall Factory |
|---|---|
| Birinci şahıs 3D keşif | Yukarıdan bakışlı, 160×160 karelik prosedürel gezegen ve **savaş sisi**. Bina kurdukça harita açılıyor, Radar Kulesi geniş alan açıyor. |
| Saf olmayan / Normal / Saf kaynak düğümleri | Aynı saflık çarpanları: x0.5 / x1 / x2. Başlangıç düğümleri HUB'a yakın, nadir kaynaklar uzakta. |
| HUB + Tier 0 yükseltmeleri + kilometre taşları | 4 sıralı HUB yükseltmesi ve Tier 1–7 arasında 16 kilometre taşı. Her biri yeni bina ve tarif açıyor. |
| Uzay Asansörü fazları ile Tier kilidi | 4 faz: Akıllı Kaplama → Çok Yönlü Çatı / Otomatik Kablolama → Modüler Motor / ACU → Süper Bilgisayar. Son faz oyunu bitiriyor. Sonrasında serbest oyun devam ediyor. |
| Tarifler (girdi/çıktı/süre) | Satisfactory'nin tarif oranları birebir korundu. Örnek: Eritici 30/dk, Demir Levha 3 külçe → 2 levha / 6 sn. 40'tan fazla eşya, 36 ana tarif. |
| Madenci, Eritici, Yapıcı, Montajcı, Dökümhane, Rafineri, İmalatçı | Hepsi mevcut. Madenci Mk.1-3 ve Petrol Çıkarıcı da var. |
| Konveyör Mk.1-5, ayırıcı, birleştirici | Bant Mk.1-4 (120/240/480/720 eşya/dk), Ayırıcı ve Kavşak var. Birleştirme, bandı başka bandın yanına sokarak yapılıyor. |
| Güç şebekesi (Biyokütle, Kömür, Yakıt, Jeotermal) | Dördü de var. Yakıt tüketimi yüke göre değişiyor. Güç yetmezse sigorta atmıyor, makineler orantılı yavaşlıyor. Bu, casual oyuncu için daha affedici. |
| Hız aşırtma + Güç Parçaları (Power Slug) | Haritadaki mavi/sarı/mor salyangozlar 1/2/5 parça veriyor. Makine başına 3 yuva var, saat hızı en fazla %250. Güç tüketimi `clock^1.32` ile artıyor. |
| Kaza alanları → Sabit Disk → MAM alternatif tarifleri | 16 kaza alanı ve 16 alternatif tarif (Cast Screw, Solid Steel Ingot, Bolted Frame…). Her diskte 2 seçenekten biri seçiliyor. |
| AWESOME Sink + kupon dükkanı | Kaynak Havuzu herhangi bir eşyayı puana çeviriyor, puanlar kupon basıyor. Kuponla Güç Parçası, Sabit Disk ve Malzeme Sandığı alınıyor. |
| Boyutsal Depo Yükleyici | Uzaktaki üretimi merkeze taşıyor (120/dk). |
| El ile kazma ve üretim | Düğüme tıklayınca cevher, ağaca tıklayınca yaprak/odun geliyor. Parçalar basılı tutarak elle üretiliyor. |
| Söküm %100 iade | Aynen korundu. Deneme yapmak cezasız. |

## CrazyGames oyuncusu için tutundurma tasarımı

CrazyGames oyuncusu genelde menü istemez, ilk 30 saniyede ne yapacağını bilmek ister, sayıların büyümesini sever ve sık sık geri döner. Buna göre:

- **Anında oynanış.** Ana menü yok. Oyun doğrudan dünyada açılıyor. 6 adımlı eğitim sarı okla ilk demir düğümünü gösteriyor ve her adımı otomatik algılıyor.
- **Her zaman bir sonraki hedef.** Sol üstteki "Mevcut Hedef" kartı, tamamlanmaya en yakın kilometre taşını ilerleme çubukları ve dakikalık akış hızıyla gösteriyor. Oyuncu istediği hedefi 📌 ile sabitleyebiliyor.
- **Kısa ve uzun vadeli döngüler.** Dakikalar içinde HUB yükseltmesi, onlarca dakikada Tier açılımı, saatler içinde Uzay Asansörü fazları var. Yan döngüler olarak keşif (salyangoz, kaza alanı), alternatif tarifler, kupon ekonomisi ve 14 başarım eklendi.
- **Dopamin anları.** Kilometre taşı sesi, konfeti ve kilidi açılan eşyaların ikonları gösteriliyor. Başarım bildirimleri, kupon sesi ve yüzen "+1" yazıları da var.
- **Geri dönüş sebebi.** Oyun kapalıyken fabrika son hızına göre çalışmaya devam ediyor (%50 verimle, en fazla 4 saat). Dönüşte "Tekrar hoş geldin" ekranında kazanç 📺 reklamla ikiye katlanabiliyor.
- **Otomatik kayıt.** 30 saniyede bir, sekme gizlenince ve sayfa kapanırken kaydediliyor. CrazyGames `data` modülü varsa oradan (hesaplar arası senkron), yoksa `localStorage`'dan.
- **Cezasız deneme.** Söküm %100 iade. Q ile binayı kopyalıyorsun, sürükleyerek bant çiziyorsun. Güç yetmezse fabrika durmuyor, sadece yavaşlıyor.
- **Mobil destek.** Dokunmatik kaydırma, iki parmakla yakınlaştırma ve ekranda Döndür/İptal butonları var. Arayüz 390 px genişliğe kadar uyumlu.
- **Çift dil.** İngilizce ve Türkçe var. Tarayıcı dili Türkçe ise otomatik Türkçe açılıyor. Ayarlardan değiştirilebiliyor.

## CrazyGames SDK v3 entegrasyonu (`js/sdk.js`)

- `SDK.init()`, `loadingStart/Stop`, `gameplayStart/Stop` çağrılıyor. Panel/modal açılınca ve sekme gizlenince durduruluyor.
- Kilometre taşı ve faz teslimlerinde `happytime()` çağrılıyor.
- **Ödüllü reklamlar** (hepsi oyuncunun isteğine bağlı):
  - ⏩ Aşırı Hız: tüm fabrika 3 dk boyunca 2x hızda çalışıyor, 5 dk bekleme süresi var.
  - 📦 İkmal Paketi: mevcut hedefin maliyetinin %25'i kadar parça veriyor, 4 dk bekleme süresi var.
  - Çevrimdışı kazancı 2x yapma.
- **Midgame reklamı** sadece doğal bir mola anında gösteriliyor: Uzay Asansörü fazı teslim edildikten sonra kutlama penceresi kapanınca.
- Reklam sırasında oyun duraklıyor ve ses kısılıyor.
- SDK yüklenemezse (yerel dosya, başka portal) oyun sorunsuz çalışıyor. Ödüller o durumda doğrudan veriliyor.

CrazyGames'e yüklemek için tüm klasörü (`index.html`, `css/`, `js/`) zip'leyip geliştirici portalına HTML5 oyunu olarak yüklemek yeterli.

## Kontroller

| Eylem | Klavye / Fare | Dokunmatik |
|---|---|---|
| İnşa et / etkileşim | Sol tık | Dokun |
| Bant çiz | Bant seçiliyken sürükle | Sürükle |
| Kaydır | Boş zemini sürükle, orta/sağ tık sürükle, WASD / oklar | Tek parmakla sürükle |
| Yakınlaştır | Tekerlek | İki parmak |
| Döndür / İptal | R / Sağ tık, Esc | Ekrandaki butonlar |
| Binayı kopyala (tarifiyle) | Q | – |
| Söküm modu | X | Araç çubuğunda "Sök" |
| Paneller | H (HUB), E (Asansör), I (Depo), M (MAM), K (Dükkan), J (Başarımlar) | Sağdaki butonlar |
| Kısayol çubuğu | 1-9 | – |

**Lojistik kuralı:** Bir makineden **dışarı bakan** bant çıktıyı alır, makineye **doğru bakan** bant onu besler. Bu sayede binaları döndürmeye gerek kalmıyor.

## Dosya yapısı

```
index.html        Sayfa iskeleti ve arayüz katmanları
css/style.css     Arayüz stili (masaüstü + mobil)
js/i18n.js        EN/TR metinler
js/data.js        Eşyalar, tarifler, binalar, kilometre taşları, fazlar, başarımlar
js/icons.js       Prosedürel eşya ikonları
js/world.js       Tohumlu gezegen üretimi (arazi, düğümler, salyangozlar, kaza alanları)
js/sim.js         Simülasyon (20 tick/sn): bantlar, makineler, güç, ilerleme, kayıt
js/render.js      Canvas çizimi: arazi parçaları, binalar, eşyalar, sis, parçacıklar
js/ui.js          DOM arayüzü, paneller, hedef kartı, yerleştirme önizlemesi
js/input.js       Fare / dokunmatik / klavye
js/main.js        Açılış, ana döngü, mini harita, çevrimdışı ilerleme
js/sdk.js         CrazyGames SDK v3 sarmalayıcı
js/audio.js       WebAudio ses efektleri
```
