# Reels Video Oluşturucu

Tarayıcıda çalışan, sunucu gerektirmeyen bir Instagram Reels video oluşturucu. Fotoğraf veya video yüklenmez — her kare, sabit bir **flat vector illüstrasyon kütüphanesinden** `<canvas>` üzerinde çizilir (kalın siyah kontur, tek bir ana rengin tonlarıyla çizilen "monochrome" teknik + küçük bir vurgu rengi, gölgesiz). Claude, yazdığınız açıklamadan hangi çizim sahnelerinin kullanılacağına karar verir; video `MediaRecorder` ile tarayıcı içinde kaydedilir, hiçbir dosya bir sunucuya gitmez.

## Özellikler

- **Tamamen AI odaklı sahne planlama** — bir cümleyle anlattığınız videoyu Claude, sabit 9 sahnelik çizim kütüphanesinden 1-4 sahnelik bir plana dönüştürür (hangi sahneler, hangi sırayla, split/full kompozisyon, başlık/alt yazı, süre).
- **Sahne kütüphanesi** — otomotiv temalı: `car-driver` (ön camdan görünen, gerçek yüz hatlarına — göz/kaş/burun/gülümseme, farklı ten ve saç renkleri — sahip sürücü + yolcu, direksiyon ve dikiz aynasıyla), `hand-sensor` (parça tutan el), `engine-warning` (nabız atan uyarı üçgeni + motor), `wrench-tool` (dönen anahtar + cıvata), `dashboard-light` (yanıp sönen arıza ikonu); genel amaçlı (her konuda kullanılabilir): `checkmark-fixed` (çizilerek beliren onay işareti), `chat-tip` (konuşma balonlu maskot — ipucu/açıklama), `growth-chart` (yükselen çubuk grafik + büyüme oku — sonuç/başarı), `abstract-shapes` (nötr yedek sahne).
- **Split / full kompozisyon** — bir sahne iki çizimi yan yana (split) ya da tek bir çizimi ortada (full) gösterebilir.
- **Tek renk tonlama tekniği ("monochrome illustration")** — tüm sahneler Marka Kuralları'ndaki tek bir ana rengin (varsayılan mavi) koyu/orta/açık/çok açık tonlarıyla çizilir; küçük bir vurgu rengi (varsayılan turuncu) yalnızca durum/parlama/insan detayları gibi gerçekten öne çıkması gereken yerlerde kullanılır. Bu, modern stok illüstrasyon setlerinde (Storyset/Freepik tarzı) yaygın kullanılan bir tekniktir.
- **Zenginleştirilmiş illüstrasyonlar** — her sahnenin arkasında dekoratif bir zemin (yumuşak daire, noktalı yörünge halkası, dağınık aksan şekilleri) ve ana çizimlerde iki tonlu renk blokları, ikincil detaylar (kapı çizgisi, ayna, jant, vida, gösterge çentikleri, konfeti/kıvılcım aksanları vb.) bulunur — düz simge değil, dolu bir kompozisyon hissi verir.
- **IG tarzı ilerleme çubuğu** — videonun üstünde, gerçek Reels/Stories'teki gibi sahne sayısı kadar segment bulunur ve otomatik ilerler (hem önizlemede hem dışa aktarılan videoda).
- **Örnek Planı Gör** — API anahtarı olmadan, tek tıkla 4 sahnelik hazır bir demo plan yükleyip aracı hemen deneyebilirsiniz.
- **Farklı Bir Versiyon Dene** — bir plan oluşturduktan sonra, aynı isteği Claude'a "belirgin şekilde farklı bir kombinasyon dene" notuyla tekrar sorup alternatif bir sahne planı alabilirsiniz.
- **Sahne planını düzenleme** — Claude'un önerdiği her sahnenin başlığı, alt yazısı, süresi düzenlenebilir; sahneler kaldırılabilir veya yeniden sıralanabilir. Videoyu oluşturmak yine sizin elinizde.
- **Arka plan müziği** — bir ses dosyası seçilip seviyesi ayarlanabilir; dışa aktarılan videoya karıştırılır.
- **60 fps'e kadar kare hızı** ve **kalite (bit hızı) seçeneği** (Taslak/Standart/Yüksek).
- **Dışa aktarma** — MP4 (destekleniyorsa) veya WebM olarak, tarayıcıda gerçek zamanlı kayıt ile indirilir.

## Kullanım

Ekstra bir kurulum veya bağımlılık gerekmez. `index.html` dosyasını doğrudan bir tarayıcıda açabilir, ya da basit bir statik sunucu ile servis edebilirsiniz:

```bash
cd apps/instagram-reels-creator
python3 -m http.server 8000
# http://localhost:8000 adresini aç
```

Güncel bir Chrome veya Edge sürümü önerilir (MediaRecorder'ın `video/mp4` kaydını destekleyen tarayıcılarda çıktı doğrudan `.mp4` olur; desteklemeyenlerde `.webm` olarak iner).

## AI ile video planlama (Claude)

"✨ Videonu Anlat" kutusuna isteğinizi yazıp **Claude ile Video Planla**'ya bastığınızda, tarayıcı doğrudan (herhangi bir arka sunucu olmadan) Anthropic Messages API'ye istek atar — resmi `@anthropic-ai/sdk` paketi `dangerouslyAllowBrowser: true` ile CDN üzerinden (esm.sh) yüklenir. Claude, `claude-opus-5` modeliyle, yalnızca sabit 9 sahne kimliğinden birini kullanarak ve `⚙ Marka Kuralları` panelinde tanımladığınız kurallara (marka adı, ton, dil, renkler, yasaklı kelimeler) uyarak yapılandırılmış bir sahne planı (`{scenes: [...]}`) döner. Plan otomatik uygulanır; videoyu oluşturmak yine sizin elinizde kalır.

Claude'un çizim sahnesi seçimi kütüphanedeki 9 sabit kimlikle sınırlıdır. Otomotiv dışı bir konu anlattığınızda genel amaçlı sahneleri (`chat-tip`, `growth-chart`, `checkmark-fixed`) kullanır; hiçbiri gerçekten uymuyorsa (örn. "bir kedi") en nötr seçeneğe (`abstract-shapes`) düşer.

**Güvenlik notu:** API anahtarınız yalnızca kendi tarayıcınızda (`localStorage`) saklanır ve istek doğrudan tarayıcıdan Claude API'ye gider. Bu, tek kullanıcılık/kişisel kullanım için pratik bir yöntemdir ama anahtar tarayıcı geliştirici araçlarından (Network sekmesi, localStorage) görülebilir durumdadır — paylaşılan/herkese açık bir cihazda kullanmayın, ve anahtarınızı başka kimseyle paylaşmayın.

## Nasıl çalışır

1. Claude'un döndürdüğü her sahne `{title, subtitle, duration, composition, sceneLeft, sceneRight}` şeklinde bir nesneye dönüştürülür.
2. Önizleme ve dışa aktarma aynı çizim fonksiyonunu (`drawAtTime`) kullanır: geçen süreye göre aktif sahneyi bulur, `SCENE_LIBRARY`'den ilgili çizim fonksiyonunu (`ctx`, bölge, zaman, palet) çağırır ve metin animasyonunu uygular. Sahneler arası geçiş sabit bir crossfade'dir.
3. Her çizim fonksiyonu tamamen vektörel path'lerle (rounded rect, bezier, arc) çizilir — hiçbir görsel/asset dosyası kullanılmaz; hafif idle animasyonlar (titreşim, blink, nabız atma, çizilme) `Math.sin`/`Math.cos` tabanlıdır.
4. Dışa aktarırken `canvas.captureStream(fps)` ile video parçası, `AudioContext` ile müzik parçası tek bir `MediaStream`'de birleştirilir ve `MediaRecorder` (seçilen kalite bit hızıyla) gerçek zamanlı olarak kaydeder.
5. Kayıt bitince oluşan `Blob` bir indirme linkine dönüştürülür — sunucuya hiçbir veri gönderilmez.

## Sınırlamalar

- Dışa aktarma gerçek zamanlı çalışır (30 saniyelik bir video ~30 saniyede işlenir).
- Çizim sahneleri sabit bir kütüphaneyle sınırlıdır (9 sahne) — Claude bunların dışında yeni bir görsel icat edemez.
- `MediaRecorder` desteği tarayıcıya göre değişir; en iyi sonuç için güncel Chrome/Edge kullanın. 60 fps kaydı donanıma göre performansı etkileyebilir.
- AI planlama özelliği internet bağlantısı, esm.sh CDN erişimi ve geçerli bir Anthropic API anahtarı gerektirir.
