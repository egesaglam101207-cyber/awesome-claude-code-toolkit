# Şase Bulma Programı

Tarayıcıda çalışan, sunucu ve internet bağlantısı gerektirmeyen bir **şase numarası (VIN) çözümleme aracı**. 17 haneli şase numarasını girdiğinizde ISO 3779 / ISO 3780 standardına göre üretici bölgesini, olası model yılını ve kontrol basamağının tutarlılığını hesaplar — tüm işlem tarayıcınızda yapılır, hiçbir veri dışarı gönderilmez.

## Özellikler

- **Biçim doğrulama** — 17 karakter uzunluğu ve VIN'de kullanılmayan harfleri (I, O, Q) denetler.
- **Üretici bölgesi tahmini** — VIN'in ilk hanesine göre kıta/bölge (Avrupa, Asya, Kuzey Amerika vb.) belirlenir.
- **Bilinen üretici eşleşmesi** — ilk 3 hane (WMI) yaygın üreticiler (Volkswagen, BMW, Mercedes-Benz, Toyota, Honda, Ford, Hyundai, Tofaş/Fiat, Ford Otosan vb.) için önceden tanımlı bir tabloyla eşleştirilir.
- **Kontrol basamağı doğrulama** — 9. hanedeki kontrol basamağı standart ağırlıklı-toplam algoritmasıyla yeniden hesaplanıp girilen değerle karşılaştırılır.
- **Model yılı tahmini** — 10. hane, 30 yılda bir tekrarlanan resmi yıl koduna göre çözümlenir (iki olası yıl gösterilir).
- **Görsel VIN kırılımı** — WMI / VDS / model yılı / fabrika kodu / seri numarası bölümleri renkli kutularla ayrı ayrı gösterilir.
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
2. `app.js` içindeki `decodeVin()` fonksiyonu VIN'i şu bölümlere ayırır: **WMI** (1-3. hane, üretici/bölge), **VDS** (4-9. hane, araç tanım bölümü), **kontrol basamağı** (9. hane), **model yılı kodu** (10. hane), **fabrika kodu** (11. hane) ve **seri numarası** (12-17. hane).
3. Kontrol basamağı, her hane için ISO 3779'daki harf→sayı dönüşüm tablosu ve konum ağırlıkları kullanılarak yeniden hesaplanır; sonuç mod 11 alınıp beklenen basamakla (0-9 veya "X") karşılaştırılır.
4. Model yılı, 10. hanenin resmi yıl koduna bakılarak (kod 30 yılda bir tekrarlandığından) iki olası yıl olarak gösterilir.
5. WMI, önceden tanımlı bir tabloda aranır; bulunursa tahmini üretici adı gösterilir, bulunmazsa yalnızca bölge bilgisi verilir.

## Sınırlamalar — önemli

Bu araç **gerçek bir araç sicili, plaka sorgulama sistemi veya üretici veritabanına bağlanmaz.** Sadece VIN'in kendi yapısından (ISO standardından) çıkarılabilecek genel bilgileri hesaplar:

- WMI tablosu kapsamlı değildir; birçok üretici/model için "Bulunamadı" sonucu dönebilir.
- Kontrol basamağı algoritması resmi ISO 3779 standardıdır, ancak her üretici/pazar bu basamağı aynı şekilde doldurmayabilir — özellikle Kuzey Amerika dışı bazı araçlarda basamak "uyuşmuyor" görünebilir, bu VIN'in sahte olduğu anlamına gelmez.
- Belirli bir aracın tam model, donanım, motor, renk, hasar kaydı, plaka veya sahiplik bilgisi bu şekilde **elde edilemez** — bunlar için üreticinin resmi VIN sorgulama sistemine veya ilgili resmi kuruma başvurulmalıdır.
- Sonuçlar tahmini ve bilgilendirme amaçlıdır; resmi/hukuki işlemler için kullanılmamalıdır.
