# Şase Bulma Programı

Tarayıcıda çalışan, sunucu ve internet bağlantısı gerektirmeyen bir **şase numarası (VIN) çözümleme aracı** — yalnızca **Asya (Japon ve Güney Kore) kökenli** araç markalarına odaklanır. 17 haneli şase numarasını girdiğinizde ISO 3779 / ISO 3780 standardına göre üretici, olası model yılı ve kontrol basamağının tutarlılığını hesaplar, tanınan marka için **kategori kategori uygun parça referansı** gösterir — tüm işlem tarayıcınızda yapılır, hiçbir veri dışarı gönderilmez.

## Kapsanan markalar

Toyota, Lexus, Honda, Acura, Nissan, Infiniti, Mazda, Subaru, Suzuki, Mitsubishi, Isuzu, Daihatsu, Hyundai, Genesis, Kia, SsangYong.

Kapsam bilinçli olarak dar tutulmuştur: Avrupa/Amerika markaları (Volkswagen, Ford, BMW, vb.) ve WMI verisi hakkında yeterli güvenilir bilgi olmayan Çinli üreticiler tabloya dahil edilmemiştir.

## Özellikler

- **Biçim doğrulama** — 17 karakter uzunluğu ve VIN'de kullanılmayan harfleri (I, O, Q) denetler.
- **Asya markası eşleşmesi** — ilk 3 hane (WMI), yukarıdaki markalar için önceden tanımlı bir tabloyla eşleştirilir; tabloda olmayan ya da Asya markası olmayan VIN'ler "Bulunamadı" olarak işaretlenir.
- **Kontrol basamağı doğrulama** — 9. hanedeki kontrol basamağı standart ağırlıklı-toplam algoritmasıyla yeniden hesaplanıp girilen değerle karşılaştırılır.
- **Model yılı tahmini** — 10. hane, 30 yılda bir tekrarlanan resmi yıl koduna göre çözümlenir (iki olası yıl gösterilir).
- **Görsel VIN kırılımı** — WMI / VDS / model yılı / fabrika kodu / seri numarası bölümleri renkli kutularla ayrı ayrı gösterilir.
- **Kategori kategori parça referansı** — tanınan bir marka için, o markanın araçlarında tipik olarak bulunan parçalar 12 kategoride (Motor, Fren, Süspansiyon, Şanzıman/Aktarma, Elektrik, Soğutma, Yakıt, Egzoz, Filtreler, Kaporta, İç Aksam, Klima, Hibrit/Elektrikli) açılır-kapanır listeler halinde gösterilir.
- **Örnek VIN** butonuyla, elinizde gerçek bir şase numarası yokken aracı hemen deneyebilirsiniz.

## Gerçek parça numaraları (isteğe bağlı, API anahtarı ile)

Varsayılan halde uygulama tamamen çevrimdışıdır ve yalnızca **genel** parça kategorilerini gösterir.
Parça bölümündeki **🔑 API anahtarı** panelinden bir **RapidAPI** anahtarı girerseniz, uygulama
[Auto Parts Catalog](https://rapidapi.com/makingdatameaningful/api/auto-parts-catalog) API'sine
(TecDoc tarzı bir katalog) doğrudan tarayıcınızdan bağlanır ve **gerçek parça numaralarını** çeker.

Akış: **VIN → marka (otomatik) → dil/ülke → model → motor tipi → kategori → parçalar**.
Her parça için `articleNo` (parça numarası), üretici (Bosch, Febi vb.) ve ürün adı listelenir.

**Neden model ve motor seçmek gerekiyor?** Bu API VIN tabanlı değil, `marka → model → motor tipi`
hiyerarşisiyle çalışıyor. VIN'den güvenilir şekilde yalnızca marka çıkarılabildiği için, doğru
parçaya inmek üzere modeli ve motoru sizin seçmeniz gerekiyor.

**Anahtar güvenliği:** Anahtar yalnızca kendi tarayıcınızda `localStorage`'da saklanır ve istek
doğrudan tarayıcınızdan API'ye gider — hiçbir ara sunucuya gönderilmez. Ancak tarayıcı geliştirici
araçlarından (Network sekmesi, localStorage) görülebilir; paylaşılan bir cihazda kullanmayın.

### CORS hakkında

Bu uygulama tamamen istemci taraflıdır, yani API çağrısı doğrudan tarayıcıdan yapılır. Bir API'nin
tarayıcıdan çağrılabilmesi için CORS başlıkları göndermesi gerekir. **Bu entegrasyon canlı API'ye
karşı test edilememiştir** (geliştirme ortamının ağ politikası RapidAPI'yi engelliyor), dolayısıyla
API'nin tarayıcı çağrılarına izin verip vermediği bilinmiyor.

Bunun için kutudan çıkan bir çözüm var: **`tools/serve.mjs`**. Bu betik uygulamayı localhost'tan
servis eder ve `/api/` altındaki istekleri sunucu tarafından API'ye iletir; istek tarayıcı açısından
aynı kaynaklı olduğu için CORS devreye girmez.

```bash
cd apps/sase-bulma-programi
node tools/serve.mjs          # http://localhost:8080
# PORT=3000 node tools/serve.mjs   # farklı port
```

Node.js 18+ gerekir, hiçbir bağımlılık kurmanız gerekmez.

Uygulama bunu **otomatik** kullanır: önce API'yi doğrudan çağırmayı dener; CORS'a takılırsa ve sayfa
bir sunucudan servis ediliyorsa `/api/` proxy'sine geçer. Yani `node tools/serve.mjs` ile açtığınızda
her iki senaryoda da çalışır. `index.html`'i doğrudan çift tıklayarak açtığınızda proxy denenemez —
CORS engeli varsa uygulama size betiği çalıştırmanızı söyleyen bir mesaj gösterir.

API anahtarınız bu betikte **saklanmaz**; tarayıcıdan gelen `x-rapidapi-key` başlığı olduğu gibi
iletilir.

Alternatif olarak [tecdoc-autoparts-catalog](https://github.com/ronhartman/tecdoc-autoparts-catalog)
Symfony uygulaması da API'yi sunucu tarafından çağırdığı için CORS sorunu yaşamaz.

## Kullanım

Ekstra kurulum gerekmez:

```bash
cd apps/sase-bulma-programi
python3 -m http.server 8000
# http://localhost:8000 adresini aç
```

`index.html` dosyasını doğrudan tarayıcıda açmak da yeterlidir.

## Nasıl çalışır

1. Girilen VIN büyük harfe çevrilir ve geçersiz karakterler (I, O, Q gibi) ayıklanır.
2. `app.js` içindeki `decodeVin()` fonksiyonu VIN'i şu bölümlere ayırır: **WMI** (1-3. hane, üretici), **VDS** (4-9. hane, araç tanım bölümü), **kontrol basamağı** (9. hane), **model yılı kodu** (10. hane), **fabrika kodu** (11. hane) ve **seri numarası** (12-17. hane).
3. Kontrol basamağı, her hane için ISO 3779'daki harf→sayı dönüşüm tablosu ve konum ağırlıkları kullanılarak yeniden hesaplanır; sonuç mod 11 alınıp beklenen basamakla (0-9 veya "X") karşılaştırılır.
4. Model yılı, 10. hanenin resmi yıl koduna bakılarak (kod 30 yılda bir tekrarlandığından) iki olası yıl olarak gösterilir.
5. WMI, yalnızca Asya markalarını içeren bir tabloda aranır; bulunursa marka adı ve `PARTS_CATEGORIES` listesindeki 12 kategori render edilir, bulunmazsa parça bölümünde kapsam dışı olduğunu belirten bir açıklama gösterilir.

## Sınırlamalar — önemli

Bu araç **gerçek bir araç sicili, plaka sorgulama sistemi, üretici veritabanı veya parça stok/fiyat sistemine bağlanmaz.** Sadece VIN'in kendi yapısından (ISO standardından) çıkarılabilecek genel bilgileri ve markaya göre **genel/evrensel** bir parça kategorisi referansını gösterir:

- WMI tablosu kapsamlı değildir ve yalnızca yaygın Japon/Kore markalarını içerir; bu markalara ait birçok model/üretim yeri için de "Bulunamadı" sonucu dönebilir.
- Kontrol basamağı algoritması resmi ISO 3779 standardıdır, ancak her üretici/pazar bu basamağı aynı şekilde doldurmayabilir — basamak "uyuşmuyor" görünmesi VIN'in sahte olduğu anlamına gelmez.
- **Çevrimdışı parça kategorileri modele/motora özel değildir** — VIN'den yalnızca marka bilgisi güvenilir şekilde çıkarılabildiği için kategoriler o markanın araçlarında genel olarak bulunan parça gruplarını listeler; gerçek parça numarası, stok veya fiyat bilgisi içermez. Gerçek numaralar yalnızca API anahtarı girildiğinde gösterilir.
- **API'den gelen parça numaraları resmi üretici verisi değildir** — kullanılan katalog API'si, sağlayıcısının kendi ifadesiyle üreticilerle bağlantısı olmayan, bağımsız/gayri resmi bir toplulaştırılmış referans veritabanıdır. Ticari kullanım için lisanslı veri (TecDoc vb.) gerekir; parça satın almadan önce numarayı aracınızın modeli/motoruyla teyit edin.
- Belirli bir aracın tam model, donanım, motor, renk, hasar kaydı, plaka veya sahiplik bilgisi bu şekilde **elde edilemez** — bunlar ve kesin parça uyumu için üreticinin resmi VIN sorgulama sistemine, orijinal parça kataloğuna veya ilgili resmi kuruma başvurulmalıdır.
- Sonuçlar tahmini ve bilgilendirme amaçlıdır; resmi/hukuki işlemler için kullanılmamalıdır.
