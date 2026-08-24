# Reels Video Oluşturucu

Tarayıcıda çalışan, sunucu gerektirmeyen bir Instagram Reels video oluşturucu. Fotoğraf/kısa video klipleri yükleyip 9:16 dikey bir video olarak birleştirir; hiçbir dosya bir sunucuya yüklenmez, her şey `<canvas>` + `MediaRecorder` API'leri ile tarayıcı içinde işlenir.

## Özellikler

- **Fotoğraf/klip yükleme** — birden çok görsel veya kısa video sürükle-bırak ile eklenir, sıralaması ok tuşlarıyla değiştirilebilir.
- **Başlık ve alt yazı** — her slayt için ayrı, animasyonlu (fade + slide-in) metin bindirmesi.
- **Arka plan müziği** — bir ses dosyası seçilip seviyesi ayarlanabilir; dışa aktarılan videoya karıştırılır.
- **Hazır şablonlar** — Ken Burns (yavaş yakınlaşma), Kaydırma (yandan geçiş) ve Kesme (net kesmeler).
- **Dışa aktarma** — MP4 (destekleniyorsa) veya WebM olarak, tarayıcıda gerçek zamanlı kayıt ile indirilir.
- **AI ile otomatik doldurma (Claude)** — bir cümlelik istekten başlık/alt yazı/şablon önerisi üretir; Marka Kuralları panelinde tanımlı ton, dil, varsayılan şablon, vurgu rengi ve yasaklı kelimelere bağlı kalır. Öneri sadece ilgili alanları doldurur, videoyu siz gözden geçirip oluşturursunuz.

## Kullanım

Ekstra bir kurulum veya bağımlılık gerekmez. `index.html` dosyasını doğrudan bir tarayıcıda açabilir, ya da basit bir statik sunucu ile servis edebilirsiniz:

```bash
cd apps/instagram-reels-creator
python3 -m http.server 8000
# http://localhost:8000 adresini aç
```

Güncel bir Chrome veya Edge sürümü önerilir (MediaRecorder'ın `video/mp4` kaydını destekleyen tarayıcılarda çıktı doğrudan `.mp4` olur; desteklemeyenlerde `.webm` olarak iner).

## Nasıl çalışır

1. Yüklenen her görsel/video bir "slayt" nesnesine dönüştürülür (tür, süre, başlık, alt yazı).
2. Önizleme ve dışa aktarma aynı çizim fonksiyonunu (`drawAtTime`) kullanır: geçen süreye göre aktif slaydı bulur, şablona göre hareket (Ken Burns/kaydırma/kesme) ve metin animasyonunu uygular.
3. Dışa aktarırken `canvas.captureStream()` ile video parçası, `AudioContext` ile müzik parçası tek bir `MediaStream`'de birleştirilir ve `MediaRecorder` gerçek zamanlı olarak kaydeder.
4. Kayıt bitince oluşan `Blob` bir indirme linkine dönüştürülür — sunucuya hiçbir veri gönderilmez.

## AI ile otomatik doldurma

"✨ AI ile Otomatik Doldur" kartındaki kutuya isteğinizi yazıp **Claude ile Doldur**'a bastığınızda, tarayıcı doğrudan (herhangi bir arka sunucu olmadan) Anthropic Messages API'ye istek atar — resmi `@anthropic-ai/sdk` paketi `dangerouslyAllowBrowser: true` ile CDN üzerinden (esm.sh) yüklenir. Claude, `claude-opus-5` modeliyle ve `⚙ Marka Kuralları` panelinde tanımladığınız kurallara (ton, dil, varsayılan şablon, yasaklı kelimeler) uyarak yapılandırılmış bir öneri (başlık/alt yazı/şablon) döner; bu öneri ilgili alanları otomatik doldurur, videoyu oluşturmak yine sizin elinizde kalır.

**Güvenlik notu:** API anahtarınız yalnızca kendi tarayıcınızda (`localStorage`) saklanır ve istek doğrudan tarayıcıdan Claude API'ye gider. Bu, tek kullanıcılık/kişisel kullanım için pratik bir yöntemdir ama anahtar tarayıcı geliştirici araçlarından (Network sekmesi, localStorage) görülebilir durumdadır — paylaşılan/herkese açık bir cihazda kullanmayın, ve anahtarınızı başka kimseyle paylaşmayın.

## Sınırlamalar

- Dışa aktarma gerçek zamanlı çalışır (30 saniyelik bir video ~30 saniyede işlenir).
- Yüklenen video klipler sessize alınır; sadece arka plan müziği duyulur.
- `MediaRecorder` desteği tarayıcıya göre değişir; en iyi sonuç için güncel Chrome/Edge kullanın.
- AI önerisi özelliği internet bağlantısı, esm.sh CDN erişimi ve geçerli bir Anthropic API anahtarı gerektirir; diğer tüm özellikler tamamen çevrimdışı çalışır.
