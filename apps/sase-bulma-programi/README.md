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
- **Parça kategorileri modele/motora özel değildir** — VIN'den yalnızca marka bilgisi güvenilir şekilde çıkarılabildiği için kategoriler o markanın araçlarında genel olarak bulunan parça gruplarını listeler; gerçek parça numarası, stok veya fiyat bilgisi içermez.
- Belirli bir aracın tam model, donanım, motor, renk, hasar kaydı, plaka veya sahiplik bilgisi bu şekilde **elde edilemez** — bunlar ve kesin parça uyumu için üreticinin resmi VIN sorgulama sistemine, orijinal parça kataloğuna veya ilgili resmi kuruma başvurulmalıdır.
- Sonuçlar tahmini ve bilgilendirme amaçlıdır; resmi/hukuki işlemler için kullanılmamalıdır.
