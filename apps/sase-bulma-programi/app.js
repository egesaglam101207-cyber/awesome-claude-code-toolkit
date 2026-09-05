"use strict";

/**
 * Şase (VIN) çözümleme mantığı — ISO 3779 / ISO 3780'e dayanır.
 * Hiçbir ağ isteği yapılmaz; tüm veri bu dosyadaki sabit tablolardır.
 */

// VIN'de kullanılmayan harfler: I, O, Q (rakamlarla karışmasın diye)
const VALID_VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

// Kontrol basamağı (9. hane) hesaplaması için harf -> değer tablosu
const TRANSLITERATION = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
};
for (let d = 0; d <= 9; d++) TRANSLITERATION[String(d)] = d;

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// 10. hane -> model yılı kodu (30 yılda bir tekrarlanır)
const YEAR_CODES = {
  A: [1980, 2010], B: [1981, 2011], C: [1982, 2012], D: [1983, 2013],
  E: [1984, 2014], F: [1985, 2015], G: [1986, 2016], H: [1987, 2017],
  J: [1988, 2018], K: [1989, 2019], L: [1990, 2020], M: [1991, 2021],
  N: [1992, 2022], P: [1993, 2023], R: [1994, 2024], S: [1995, 2025],
  T: [1996, 2026], V: [1997, 2027], W: [1998, 2028], X: [1999, 2029],
  Y: [2000, 2030],
  1: [2001, 2031], 2: [2002, 2032], 3: [2003, 2033], 4: [2004, 2034],
  5: [2005, 2035], 6: [2006, 2036], 7: [2007, 2037], 8: [2008, 2038],
  9: [2009, 2039], 0: [2000, 2030],
};

// WMI'nin ilk karakterine göre kaba bölge/ülke tahmini (ISO 3780)
const REGION_RANGES = [
  { chars: "AH", region: "Afrika" },
  { chars: "JR", region: "Asya" },
  { chars: "SZ", region: "Avrupa" },
  { chars: "15", region: "Kuzey Amerika (ABD)" },
  { chars: "67", region: "Okyanusya" },
  { chars: "89", region: "Güney Amerika" },
];

function guessRegion(firstChar) {
  const code = firstChar.charCodeAt(0);
  for (const r of REGION_RANGES) {
    const [a, b] = r.chars.split("");
    const inLetterRange = /[A-Z]/.test(a) && firstChar >= a && firstChar <= b;
    const inDigitRange = /[0-9]/.test(a) && firstChar >= a && firstChar <= b;
    if (inLetterRange || inDigitRange) return r.region;
  }
  return "Bilinmiyor";
}

// WMI (ilk 3 hane) -> üretici eşlemeleri.
//
// Bu program yalnızca Asya (Japonya, Güney Kore) kökenli MARKALARA odaklanır;
// ancak bu markaların Türkiye, Avrupa, Hindistan, Tayland vb. fabrikalarında
// üretilen araçları da kapsar — çünkü bir Hyundai i20 Türkiye'de üretildiğinde
// WMI'si "NLH" olur, "KMH" değil.
//
// Veri kaynağı: Wikipedia WMI listesinden türetilmiş açık veri seti
// (github.com/WALL-E/vin-decoder, csv/wmi-from-wiki.csv) — Asya markalarına
// göre süzülmüştür. Ticari araç/kamyon ve motosiklet kodları alınmamıştır.
//
// `brand` alanı parça kategorileri ve canlı katalog eşleşmesi için kullanılır.
const WMI_TABLE = {
  // --- Toyota / Lexus ---
  JTH: { brand: "Lexus", label: "Lexus" },
  JTJ: { brand: "Lexus", label: "Lexus (SUV)" },
  NMT: { brand: "Toyota", label: "Toyota (Türkiye – Sakarya)" },
  SB1: { brand: "Toyota", label: "Toyota (İngiltere)" },
  VNK: { brand: "Toyota", label: "Toyota (Fransa)" },
  TW1: { brand: "Toyota", label: "Toyota (Portekiz – Caetano)" },
  AHT: { brand: "Toyota", label: "Toyota (Güney Afrika)" },
  MR0: { brand: "Toyota", label: "Toyota (Tayland)" },
  MBJ: { brand: "Toyota", label: "Toyota (Hindistan)" },
  MHF: { brand: "Toyota", label: "Toyota (Endonezya)" },
  LTV: { brand: "Toyota", label: "Toyota (Çin – Tianjin)" },
  "6T1": { brand: "Toyota", label: "Toyota (Avustralya)" },
  "8AJ": { brand: "Toyota", label: "Toyota (Arjantin)" },
  "93R": { brand: "Toyota", label: "Toyota (Brezilya)" },
  "9BR": { brand: "Toyota", label: "Toyota (Brezilya)" },

  // --- Honda / Acura ---
  NLA: { brand: "Honda", label: "Honda (Türkiye – Gebze)" },
  SHH: { brand: "Honda", label: "Honda (İngiltere)" },
  SHS: { brand: "Honda", label: "Honda (İngiltere)" },
  MLH: { brand: "Honda", label: "Honda (Tayland)" },
  MRH: { brand: "Honda", label: "Honda (Tayland)" },
  MAK: { brand: "Honda", label: "Honda (Hindistan)" },
  MHR: { brand: "Honda", label: "Honda (Endonezya)" },
  LUC: { brand: "Honda", label: "Honda (Çin – Guangqi)" },
  "2HG": { brand: "Honda", label: "Honda (Kanada)" },
  "2HJ": { brand: "Honda", label: "Honda (Kanada)" },
  "2HK": { brand: "Honda", label: "Honda (Kanada)" },
  "5FN": { brand: "Honda", label: "Honda (ABD – Alabama)" },
  "93H": { brand: "Honda", label: "Honda (Brezilya)" },

  // --- Nissan / Infiniti ---
  JNK: { brand: "Infiniti", label: "Infiniti" },
  JNR: { brand: "Infiniti", label: "Infiniti (SUV)" },
  SJN: { brand: "Nissan", label: "Nissan (İngiltere – Sunderland)" },
  VSK: { brand: "Nissan", label: "Nissan (İspanya)" },
  VWA: { brand: "Nissan", label: "Nissan (İspanya)" },
  MNT: { brand: "Nissan", label: "Nissan (Tayland)" },
  MDH: { brand: "Nissan", label: "Nissan (Hindistan)" },
  "6F4": { brand: "Nissan", label: "Nissan (Avustralya)" },
  "94D": { brand: "Nissan", label: "Nissan (Brezilya)" },

  // --- Hyundai / Genesis ---
  NLH: { brand: "Hyundai", label: "Hyundai (Türkiye – Assan, İzmit)" },
  TMA: { brand: "Hyundai", label: "Hyundai (Çekya)" },
  MAL: { brand: "Hyundai", label: "Hyundai (Hindistan)" },
  LBE: { brand: "Hyundai", label: "Hyundai (Çin – Beijing Hyundai)" },
  AC5: { brand: "Hyundai", label: "Hyundai (Güney Afrika)" },
  ADD: { brand: "Hyundai", label: "Hyundai (Güney Afrika)" },
  X7M: { brand: "Hyundai", label: "Hyundai (Rusya – TagAZ)" },
  "2HM": { brand: "Hyundai", label: "Hyundai (Kanada)" },
  "5NP": { brand: "Hyundai", label: "Hyundai (ABD)" },
  "5NM": { brand: "Hyundai", label: "Hyundai (ABD, SUV)" },
  KMT: { brand: "Genesis", label: "Genesis" },

  // --- Kia ---
  U5Y: { brand: "Kia", label: "Kia (Slovakya)" },
  U6Y: { brand: "Kia", label: "Kia (Slovakya)" },
  "5XY": { brand: "Kia", label: "Kia (ABD)" },

  // --- Mazda ---
  JMZ: { brand: "Mazda", label: "Mazda" },
  YCM: { brand: "Mazda", label: "Mazda (Belçika)" },
  MM8: { brand: "Mazda", label: "Mazda (Tayland)" },
  PE3: { brand: "Mazda", label: "Mazda (Filipinler)" },
  "3MZ": { brand: "Mazda", label: "Mazda (Meksika)" },
  "1YV": { brand: "Mazda", label: "Mazda (ABD)" },

  // --- Mitsubishi ---
  JMB: { brand: "Mitsubishi", label: "Mitsubishi" },
  JMY: { brand: "Mitsubishi", label: "Mitsubishi" },
  XMC: { brand: "Mitsubishi", label: "Mitsubishi (Hollanda – NedCar)" },
  MMB: { brand: "Mitsubishi", label: "Mitsubishi (Tayland)" },
  MMC: { brand: "Mitsubishi", label: "Mitsubishi (Tayland)" },
  MMT: { brand: "Mitsubishi", label: "Mitsubishi (Tayland)" },
  MA7: { brand: "Mitsubishi", label: "Mitsubishi (Hindistan)" },
  "6MM": { brand: "Mitsubishi", label: "Mitsubishi (Avustralya)" },
  "93X": { brand: "Mitsubishi", label: "Mitsubishi (Brezilya)" },

  // --- Suzuki ---
  TSM: { brand: "Suzuki", label: "Suzuki (Macaristan)" },
  MA3: { brand: "Suzuki", label: "Suzuki / Maruti (Hindistan)" },
  MBH: { brand: "Suzuki", label: "Suzuki / Maruti (Hindistan)" },
  MLC: { brand: "Suzuki", label: "Suzuki (Tayland)" },
  VSE: { brand: "Suzuki", label: "Suzuki (İspanya – Santana)" },
  "8AK": { brand: "Suzuki", label: "Suzuki (Arjantin)" },

  // --- Isuzu / Daihatsu / SsangYong ---
  MP1: { brand: "Isuzu", label: "Isuzu (Tayland)" },
  MPA: { brand: "Isuzu", label: "Isuzu (Tayland)" },
  LZE: { brand: "Isuzu", label: "Isuzu (Çin – Guangzhou)" },
  KPA: { brand: "SsangYong", label: "SsangYong" },
  KPT: { brand: "SsangYong", label: "SsangYong" },
};

// Bazı üreticiler için WMI'nin yalnızca ilk 2 hanesi markayı belirler
// (3. hane model/gövde tipine göre değişir). 3 haneli tabloda tam eşleşme
// bulunamazsa buraya düşülür — böylece JTD/JTE/JT2… hepsi Toyota'ya,
// KMH/KMF/KM8… hepsi Hyundai'ye eşleşir.
const WMI_PREFIX_TABLE = {
  JT: { brand: "Toyota", label: "Toyota (Japonya)" },
  JH: { brand: "Honda", label: "Honda (Japonya)" },
  JN: { brand: "Nissan", label: "Nissan (Japonya)" },
  JM: { brand: "Mazda", label: "Mazda (Japonya)" },
  JF: { brand: "Subaru", label: "Subaru (Japonya)" },
  JS: { brand: "Suzuki", label: "Suzuki (Japonya)" },
  JA: { brand: "Isuzu", label: "Isuzu (Japonya)" },
  JD: { brand: "Daihatsu", label: "Daihatsu (Japonya)" },
  KM: { brand: "Hyundai", label: "Hyundai (Güney Kore)" },
  KN: { brand: "Kia", label: "Kia (Güney Kore)" },
  "1H": { brand: "Honda", label: "Honda (ABD)" },
  "1N": { brand: "Nissan", label: "Nissan (ABD)" },
  "2T": { brand: "Toyota", label: "Toyota (Kanada)" },
  "3H": { brand: "Honda", label: "Honda (Meksika)" },
  "3N": { brand: "Nissan", label: "Nissan (Meksika)" },
  "4F": { brand: "Mazda", label: "Mazda (ABD)" },
  "4S": { brand: "Subaru", label: "Subaru (ABD)" },
  "4T": { brand: "Toyota", label: "Toyota (ABD)" },
  "5F": { brand: "Honda", label: "Honda (ABD – Alabama)" },
  "5N": { brand: "Nissan", label: "Nissan (ABD)" },
  "5T": { brand: "Toyota", label: "Toyota (ABD)" },
};

function lookupWmi(wmi) {
  if (WMI_TABLE[wmi]) return WMI_TABLE[wmi];
  const prefix = wmi.slice(0, 2);
  if (WMI_PREFIX_TABLE[prefix]) return WMI_PREFIX_TABLE[prefix];
  return null;
}

function decodeVin(rawVin) {
  const vin = rawVin.toUpperCase().trim();
  const errors = [];

  if (vin.length !== 17) {
    errors.push(`VIN 17 karakter olmalıdır (girilen: ${vin.length}).`);
  }
  if (/[IOQ]/.test(vin)) {
    errors.push("VIN içinde I, O veya Q harfleri kullanılmaz (karışıklığı önlemek için).");
  }
  if (vin.length === 17 && !VALID_VIN_RE.test(vin)) {
    errors.push("VIN yalnızca büyük harf (I, O, Q hariç) ve rakam içerebilir.");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  const wmi = vin.slice(0, 3);
  const vds = vin.slice(3, 9);
  const checkDigitChar = vin[8];
  const yearChar = vin[9];
  const plantChar = vin[10];
  const serial = vin.slice(11);

  // Kontrol basamağı doğrulama (yalnızca bu standardı uygulayan üreticiler için anlamlıdır)
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const val = TRANSLITERATION[vin[i]];
    sum += val * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expectedCheckChar = remainder === 10 ? "X" : String(remainder);
  const checkDigitValid = expectedCheckChar === checkDigitChar;

  // Kontrol basamağı yalnızca Kuzey Amerika pazarı için zorunludur
  // (ISO 3779 bunu opsiyonel bırakır). Avrupa/Asya üretimi birçok araçta
  // bu hane başka bir amaçla kullanılır; "uyuşmuyor" çıkması aracın sahte
  // olduğu anlamına gelmez.
  const checkDigitRequired = /[1-5]/.test(vin[0]);

  const region = guessRegion(vin[0]);
  const match = lookupWmi(wmi);
  const manufacturer = match ? match.label : null;
  const brand = match ? match.brand : null;

  const years = YEAR_CODES[yearChar] || null;

  return {
    valid: true,
    vin,
    wmi,
    vds,
    region,
    manufacturer,
    brand,
    checkDigitChar,
    expectedCheckChar,
    checkDigitValid,
    checkDigitRequired,
    yearChar,
    years,
    plantChar,
    serial,
  };
}

// Kategori kategori genel parça referansı. VIN'den okunabilen tek bilgi
// üretici (marka) olduğu için kategoriler markadan bağımsız, evrensel
// parça gruplarıdır — belirli bir model/motora özel parça numarası
// içermez (bunun için üreticinin resmi parça kataloğu gerekir).
const PARTS_CATEGORIES = [
  {
    title: "Motor Parçaları",
    icon: "🔧",
    items: [
      "Triger seti / zinciri", "Yağ pompası", "Silindir kapağı contası",
      "Enjektörler", "Buji / bujiler", "Termostat", "Krank mili keçesi",
      "Motor takozları (kulakları)",
    ],
  },
  {
    title: "Fren Sistemi",
    icon: "🛑",
    items: [
      "Fren balatası (ön/arka)", "Fren diski", "Fren hidrolik hortumu",
      "ABS sensörü", "Fren kaliperi", "El freni kablosu", "Fren hidrolik yağı",
    ],
  },
  {
    title: "Süspansiyon ve Direksiyon",
    icon: "🚙",
    items: [
      "Amortisör (ön/arka)", "Salıncak / rot kolu", "Rotil",
      "Stabilizör linki / lastiği", "Direksiyon kutusu", "Rot mili",
      "Yay (helezon/makas)",
    ],
  },
  {
    title: "Şanzıman ve Aktarma Organları",
    icon: "⚙️",
    items: [
      "Debriyaj seti", "Volan", "Şanzıman yağı / filtresi",
      "Diferansiyel keçesi", "Aks (tekerlek mili)", "Aks körüğü",
    ],
  },
  {
    title: "Elektrik ve Elektronik",
    icon: "🔋",
    items: [
      "Akü", "Alternatör", "Marş motoru", "ECU / motor beyni",
      "Far / stop ampulü", "O2 (lambda) sensörü", "Krank / eksantrik sensörü",
    ],
  },
  {
    title: "Soğutma Sistemi",
    icon: "❄️",
    items: [
      "Radyatör", "Su pompası", "Fan motoru", "Termostat muhafazası",
      "Radyatör hortumu / kelepçesi", "Antifriz devresi conta seti",
    ],
  },
  {
    title: "Yakıt Sistemi",
    icon: "⛽",
    items: [
      "Yakıt pompası", "Yakıt filtresi", "Yakıt enjektörü",
      "Yakıt basınç regülatörü", "Yakıt deposu contası",
    ],
  },
  {
    title: "Egzoz Sistemi",
    icon: "💨",
    items: [
      "Katalitik konvertör", "Susturucu (marşpiyel / orta / son)",
      "Egzoz manifoldu contası", "Egzoz askı lastiği",
    ],
  },
  {
    title: "Filtreler",
    icon: "🧹",
    items: ["Hava filtresi", "Yağ filtresi", "Polen (kabin) filtresi", "Yakıt filtresi"],
  },
  {
    title: "Kaporta ve Dış Aksam",
    icon: "🚗",
    items: [
      "Tampon (ön/arka)", "Çamurluk", "Kaput", "Ayna grubu",
      "Far / stop grubu", "Cam fitili / kelepçesi",
    ],
  },
  {
    title: "İç Aksam ve Döşeme",
    icon: "🪑",
    items: [
      "Koltuk döşemesi", "Torpido", "Döşeme kaplaması",
      "Elektrikli cam motoru (cam krikosu)", "Kapı kolu / kilit mekanizması",
    ],
  },
  {
    title: "Klima Sistemi",
    icon: "🌬️",
    items: [
      "Klima kompresörü", "Kondenser", "Evaporatör",
      "Klima gaz hattı / contası", "Kabin fanı motoru",
    ],
  },
  {
    title: "Hibrit / Elektrikli Sistem (yalnızca ilgili modellerde)",
    icon: "⚡",
    items: [
      "Hibrit/EV batarya paketi", "İnvertör / konvertör ünitesi",
      "Elektrik motoru", "Batarya soğutma fanı", "Şarj portu / kablosu",
    ],
  },
];

// ---- Canlı parça kataloğu (RapidAPI "Auto Parts Catalog", TecDoc tarzı) ----
//
// Uç nokta yolları ve cevap alan adları, bu API'yi kullanan açık kaynak
// referans uygulamasından (ronhartman/tecdoc-autoparts-catalog, Symfony)
// birebir alınmıştır — tahmin edilmemiştir.
//
// Akış: marka (VIN'den) -> model -> motor tipi (vehicleId) -> kategori ->
// parçalar (articleNo = parça numarası).

const CATALOG_HOST = "auto-parts-catalog.p.rapidapi.com";
const CATALOG_BASE = `https://${CATALOG_HOST}/`;
const API_KEY_STORAGE = "sase-bulma-rapidapi-key";
const TYPE_ID_AUTOMOBILE = 1; // ApplicationConstants::TYPE_AUTOMOBILE

class CatalogError extends Error {}

function getApiKey() {
  try {
    return localStorage.getItem(API_KEY_STORAGE) || "";
  } catch (e) {
    return "";
  }
}

function storeApiKey(key) {
  try {
    if (key) localStorage.setItem(API_KEY_STORAGE, key);
    else localStorage.removeItem(API_KEY_STORAGE);
    return true;
  } catch (e) {
    return false;
  }
}

// Doğrudan çağrı CORS'a takılırsa, uygulama bir sunucudan servis ediliyorsa
// aynı kaynaktaki /api/ proxy'si (tools/serve.mjs) denenir. Hangisinin
// çalıştığı bir kez öğrenilip oturum boyunca kullanılır.
let catalogTransport = null; // "direct" | "proxy"

function proxyBase() {
  return `${location.origin}/api/`;
}

async function rawCatalogRequest(base, endpoint, key) {
  return fetch(base + endpoint, {
    headers: { "x-rapidapi-key": key, "x-rapidapi-host": CATALOG_HOST },
  });
}

async function catalogFetch(endpoint) {
  const key = getApiKey();
  if (!key) throw new CatalogError("API anahtarı girilmedi.");

  const canUseProxy = location.protocol === "http:" || location.protocol === "https:";

  let res;
  if (catalogTransport === "proxy") {
    try {
      res = await rawCatalogRequest(proxyBase(), endpoint, key);
    } catch (e) {
      throw new CatalogError("Yerel proxy'ye ulaşılamadı. tools/serve.mjs hâlâ çalışıyor mu?");
    }
  } else {
    try {
      res = await rawCatalogRequest(CATALOG_BASE, endpoint, key);
      catalogTransport = "direct";
    } catch (e) {
      // fetch yalnızca ağ/CORS hatasında throw eder; HTTP hata kodlarında etmez.
      if (canUseProxy) {
        try {
          res = await rawCatalogRequest(proxyBase(), endpoint, key);
          catalogTransport = "proxy";
        } catch (e2) {
          throw new CatalogError(
            "API'ye tarayıcıdan doğrudan ulaşılamadı (büyük ihtimalle CORS) ve yerel " +
              "proxy de bulunamadı. Çözüm: uygulamayı `node tools/serve.mjs` ile " +
              "başlatıp http://localhost:8080 adresinden açın. Ayrıntı için README'deki " +
              "'CORS' bölümüne bakın."
          );
        }
      } else {
        throw new CatalogError(
          "API'ye tarayıcıdan ulaşılamadı (büyük ihtimalle CORS). Dosyayı doğrudan " +
            "açtığınız için proxy denenemedi — uygulamayı `node tools/serve.mjs` ile " +
            "başlatıp http://localhost:8080 adresinden açın."
        );
      }
    }
  }

  if (res.status === 401 || res.status === 403) {
    throw new CatalogError("API anahtarı geçersiz ya da bu API'ye aboneliğiniz yok (HTTP " + res.status + ").");
  }
  if (res.status === 429) {
    throw new CatalogError("Ücretsiz plan kotanız dolmuş görünüyor (HTTP 429).");
  }
  if (!res.ok) {
    throw new CatalogError(`API beklenmeyen bir yanıt döndürdü (HTTP ${res.status}).`);
  }

  try {
    return await res.json();
  } catch (e) {
    throw new CatalogError("API yanıtı okunamadı (geçersiz JSON).");
  }
}

// API bazı listeleri doğrudan dizi, bazılarını sarmalanmış nesne olarak
// döndürebiliyor; her iki durumu da tolere et.
function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  for (const value of Object.values(payload)) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function pickId(obj, ...candidates) {
  for (const name of candidates) {
    if (obj && obj[name] !== undefined && obj[name] !== null) return obj[name];
  }
  return null;
}

const catalogApi = {
  languages: () => catalogFetch("languages/list"),
  countries: (langId) => catalogFetch(`countries/list-countries-by-lang-id/${langId}`),
  manufacturers: (langId, countryId) =>
    catalogFetch(
      `manufacturers/list/lang-id/${langId}/country-filter-id/${countryId}/type-id/${TYPE_ID_AUTOMOBILE}`
    ),
  models: (manufacturerId, langId, countryId) =>
    catalogFetch(
      `models/list/manufacturer-id/${manufacturerId}/lang-id/${langId}/country-filter-id/${countryId}/type-id/${TYPE_ID_AUTOMOBILE}`
    ),
  engines: (modelId, manufacturerId, langId, countryId) =>
    catalogFetch(
      `types/list-vehicles-types/${modelId}/manufacturer-id/${manufacturerId}/lang-id/${langId}/country-filter-id/${countryId}/type-id/${TYPE_ID_AUTOMOBILE}`
    ),
  categories: (vehicleId, manufacturerId, langId, countryId) =>
    catalogFetch(
      `category/category-products-groups-variant-3/${vehicleId}/manufacturer-id/${manufacturerId}/lang-id/${langId}/country-filter-id/${countryId}/type-id/${TYPE_ID_AUTOMOBILE}`
    ),
  articles: (vehicleId, productGroupId, manufacturerId, langId, countryId) =>
    catalogFetch(
      `articles/list/vehicle-id/${vehicleId}/product-group-id/${productGroupId}/manufacturer-id/${manufacturerId}/lang-id/${langId}/country-filter-id/${countryId}/type-id/${TYPE_ID_AUTOMOBILE}`
    ),
};

// ---- UI ----

const vinInput = document.getElementById("vin-input");
const charCount = document.getElementById("char-count");
const clearBtn = document.getElementById("clear-btn");
const sampleBtn = document.getElementById("sample-btn");
const errorBox = document.getElementById("error-box");
const resultSection = document.getElementById("result");
const resultGrid = document.getElementById("result-grid");
const vinVisual = document.getElementById("vin-visual");
const partsSection = document.getElementById("parts");
const partsIntro = document.getElementById("parts-intro");
const partsGrid = document.getElementById("parts-grid");
const apiKeyInput = document.getElementById("api-key-input");
const apiKeySave = document.getElementById("api-key-save");
const apiKeyClear = document.getElementById("api-key-clear");
const apiKeyStatus = document.getElementById("api-key-status");
const liveCatalog = document.getElementById("live-catalog");
const selectorRow = document.getElementById("selector-row");
const catalogStatus = document.getElementById("catalog-status");
const livePartsGrid = document.getElementById("live-parts-grid");
const genericParts = document.getElementById("generic-parts");
const genericHeading = document.getElementById("generic-heading");

const SAMPLE_VINS = [
  "1HGCM82633A004352",
  "JTDBR32EX20012345",
  "KNADM4A33C6123456",
];
let sampleIndex = 0;

function render(vin) {
  errorBox.hidden = true;
  resultSection.hidden = true;
  partsSection.hidden = true;
  resultGrid.innerHTML = "";
  vinVisual.innerHTML = "";
  partsGrid.innerHTML = "";

  if (!vin) return;

  const result = decodeVin(vin);

  if (!result.valid) {
    errorBox.hidden = false;
    errorBox.innerHTML = result.errors.map((e) => `• ${e}`).join("<br>");
    return;
  }

  resultSection.hidden = false;

  const items = [
    {
      label: "Bölge",
      value: result.region,
      status: "ok",
    },
    {
      label: "Tahmini Üretici (Asya markaları)",
      value: result.manufacturer || "Bulunamadı (tanınmayan WMI veya Asya markası değil)",
      status: result.manufacturer ? "ok" : "warn",
    },
    {
      label: "Kontrol Basamağı (9. hane)",
      value: result.checkDigitValid
        ? `Geçerli (${result.checkDigitChar})`
        : result.checkDigitRequired
          ? `Uyuşmuyor — beklenen "${result.expectedCheckChar}", girilen "${result.checkDigitChar}"`
          : `Bu pazarda zorunlu değil (hane: ${result.checkDigitChar})`,
      status: result.checkDigitValid ? "ok" : result.checkDigitRequired ? "warn" : "",
    },
    {
      label: "Olası Model Yılı",
      value: result.years ? result.years.join(" veya ") : "Belirlenemedi",
      status: result.years ? "ok" : "warn",
    },
    {
      label: "WMI (Üretici Kodu)",
      value: result.wmi,
      status: "ok",
    },
    {
      label: "Fabrika Kodu (11. hane)",
      value: result.plantChar,
      status: "ok",
    },
  ];

  for (const item of items) {
    const div = document.createElement("div");
    div.className = `result-item status-${item.status}`;
    div.innerHTML = `<div class="rlabel">${item.label}</div><div class="rvalue">${item.value}</div>`;
    resultGrid.appendChild(div);
  }

  const segments = [
    { chars: result.vin.slice(0, 3), cls: "wmi", label: "WMI" },
    { chars: result.vin.slice(3, 9), cls: "vds", label: "VDS" },
    { chars: result.vin[9], cls: "year", label: "Model Yılı" },
    { chars: result.vin[10], cls: "plant", label: "Fabrika" },
    { chars: result.vin.slice(11), cls: "serial", label: "Seri No" },
  ];

  for (const seg of segments) {
    for (let i = 0; i < seg.chars.length; i++) {
      const wrapper = document.createElement("div");
      wrapper.className = `vin-char ${seg.cls}`;
      const showLabel = i === 0;
      wrapper.innerHTML = `
        <div class="box">${seg.chars[i]}</div>
        <div class="seg-label">${showLabel ? seg.label : "&nbsp;"}</div>
      `;
      vinVisual.appendChild(wrapper);
    }
  }

  renderParts(result);
}

function renderParts(result) {
  partsSection.hidden = false;

  if (!result.manufacturer) {
    partsIntro.innerHTML = `Bu WMI kodu (<strong>${result.wmi}</strong>) tabloda bulunamadı ya da bu programın kapsadığı bir Asya markasına ait değil. Bu araç şu anda yalnızca yaygın <strong>Japon ve Güney Kore</strong> markalarını (Toyota, Lexus, Honda, Acura, Nissan, Infiniti, Mazda, Subaru, Suzuki, Mitsubishi, Isuzu, Daihatsu, Hyundai, Genesis, Kia, SsangYong) kapsıyor.`;
    return;
  }

  partsIntro.innerHTML = `<strong>${result.manufacturer}</strong> için genel parça kategorileri aşağıdadır. Bunlar VIN'den değil, bu markanın araçlarında tipik olarak bulunan parça gruplarından oluşan <strong>genel bir referanstır</strong> — tam uyum için modelinize/motor koduna özel resmi parça kataloğuna bakılmalıdır.`;

  for (const category of PARTS_CATEGORIES) {
    const details = document.createElement("details");
    details.className = "part-category";

    const summary = document.createElement("summary");
    summary.innerHTML = `<span class="cat-icon">${category.icon}</span> ${category.title}`;
    details.appendChild(summary);

    const list = document.createElement("ul");
    for (const item of category.items) {
      const li = document.createElement("li");
      li.textContent = item;
      list.appendChild(li);
    }
    details.appendChild(list);

    partsGrid.appendChild(details);
  }

  startLiveCatalog(result);
}

// ---- Canlı katalog akışı ----

const catalogState = {
  langId: null,
  countryId: null,
  manufacturerId: null,
  modelId: null,
  vehicleId: null,
  brand: null,
};

function setCatalogStatus(message, kind) {
  catalogStatus.textContent = message || "";
  catalogStatus.className = "catalog-status" + (kind ? " " + kind : "");
}

function makeSelect(labelText, options, onChange, placeholder) {
  const wrapper = document.createElement("div");
  wrapper.className = "selector";

  const label = document.createElement("label");
  label.textContent = labelText;
  wrapper.appendChild(label);

  const select = document.createElement("select");
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = placeholder || "Seçiniz…";
  select.appendChild(empty);

  for (const opt of options) {
    const option = document.createElement("option");
    option.value = String(opt.value);
    option.textContent = opt.label;
    select.appendChild(option);
  }

  select.addEventListener("change", () => onChange(select.value));
  wrapper.appendChild(select);
  return { wrapper, select };
}

function clearSelectorsAfter(index) {
  while (selectorRow.children.length > index) {
    selectorRow.removeChild(selectorRow.lastChild);
  }
  livePartsGrid.innerHTML = "";
}

async function startLiveCatalog(result) {
  selectorRow.innerHTML = "";
  livePartsGrid.innerHTML = "";
  setCatalogStatus("");

  const hasKey = Boolean(getApiKey());
  liveCatalog.hidden = !hasKey;
  genericHeading.textContent = hasKey
    ? "Genel parça kategorileri (API anahtarı olmadan da çalışan referans)"
    : "Genel parça kategorileri";

  if (!hasKey || !result.brand) return;

  catalogState.brand = result.brand;

  try {
    setCatalogStatus("Diller yükleniyor…", "loading");
    const languages = asArray(await catalogApi.languages());
    if (languages.length === 0) throw new CatalogError("API dil listesi döndürmedi.");

    const langOptions = languages.map((l) => ({
      value: pickId(l, "langId", "id", "languageId"),
      label: l.lngDescription || l.languageName || l.name || `Dil ${pickId(l, "langId", "id")}`,
    }));

    const { wrapper } = makeSelect("Dil", langOptions, onLanguageChange, "Dil seçin…");
    selectorRow.appendChild(wrapper);
    setCatalogStatus("Bir dil seçerek devam edin.", "");
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

function describeCatalogError(e) {
  if (e instanceof CatalogError) return e.message;
  return "Beklenmeyen bir hata oluştu: " + (e && e.message ? e.message : String(e));
}

async function onLanguageChange(value) {
  clearSelectorsAfter(1);
  if (!value) return;
  catalogState.langId = value;

  try {
    setCatalogStatus("Ülkeler yükleniyor…", "loading");
    const countries = asArray(await catalogApi.countries(value));
    const options = countries.map((c) => ({
      value: pickId(c, "countryId", "id", "countryFilterId"),
      label: c.couName || c.countryName || c.name || `Ülke ${pickId(c, "countryId", "id")}`,
    }));
    const { wrapper } = makeSelect("Ülke", options, onCountryChange, "Ülke seçin…");
    selectorRow.appendChild(wrapper);
    setCatalogStatus("Bir ülke seçerek devam edin.", "");
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

async function onCountryChange(value) {
  clearSelectorsAfter(2);
  if (!value) return;
  catalogState.countryId = value;

  try {
    setCatalogStatus("Markalar yükleniyor…", "loading");
    const manufacturers = asArray(
      await catalogApi.manufacturers(catalogState.langId, catalogState.countryId)
    );

    // VIN'den bulunan markayı otomatik eşleştirmeyi dene.
    const wanted = (catalogState.brand || "").toLowerCase();
    const match = manufacturers.find(
      (m) => String(m.mfaBrand || m.brand || "").toLowerCase() === wanted
    );

    const options = manufacturers.map((m) => ({
      value: pickId(m, "manufacturerId", "mfaId", "id"),
      label: m.mfaBrand || m.brand || `Marka ${pickId(m, "manufacturerId", "mfaId", "id")}`,
    }));

    const { wrapper, select } = makeSelect("Marka", options, onManufacturerChange, "Marka seçin…");
    selectorRow.appendChild(wrapper);

    if (match) {
      const id = String(pickId(match, "manufacturerId", "mfaId", "id"));
      select.value = id;
      setCatalogStatus(`VIN'den bulunan marka otomatik seçildi: ${match.mfaBrand || match.brand}`, "ok");
      await onManufacturerChange(id);
    } else {
      setCatalogStatus(
        `VIN'den bulunan marka ("${catalogState.brand}") API listesinde birebir eşleşmedi — listeden elle seçin.`,
        "warn"
      );
    }
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

async function onManufacturerChange(value) {
  clearSelectorsAfter(3);
  if (!value) return;
  catalogState.manufacturerId = value;

  try {
    setCatalogStatus("Modeller yükleniyor…", "loading");
    const models = asArray(
      await catalogApi.models(value, catalogState.langId, catalogState.countryId)
    );
    const options = models.map((m) => ({
      value: pickId(m, "modelId", "id"),
      label: m.modelName || m.name || `Model ${pickId(m, "modelId", "id")}`,
    }));
    const { wrapper } = makeSelect("Model", options, onModelChange, "Model seçin…");
    selectorRow.appendChild(wrapper);
    setCatalogStatus(`${options.length} model bulundu — modelinizi seçin.`, "");
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

async function onModelChange(value) {
  clearSelectorsAfter(4);
  if (!value) return;
  catalogState.modelId = value;

  try {
    setCatalogStatus("Motor tipleri yükleniyor…", "loading");
    const engines = asArray(
      await catalogApi.engines(
        value,
        catalogState.manufacturerId,
        catalogState.langId,
        catalogState.countryId
      )
    );
    const options = engines.map((t) => ({
      value: pickId(t, "vehicleId", "id"),
      label:
        (t.typeEngineName || t.name || `Motor ${pickId(t, "vehicleId", "id")}`) +
        (t.constructionIntervalStart
          ? ` (${t.constructionIntervalStart}${t.constructionIntervalEnd ? " – " + t.constructionIntervalEnd : " –"})`
          : ""),
    }));
    const { wrapper } = makeSelect("Motor / Tip", options, onEngineChange, "Motor tipi seçin…");
    selectorRow.appendChild(wrapper);
    setCatalogStatus(`${options.length} motor tipi bulundu — aracınızınkini seçin.`, "");
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

async function onEngineChange(value) {
  livePartsGrid.innerHTML = "";
  if (!value) return;
  catalogState.vehicleId = value;

  try {
    setCatalogStatus("Parça kategorileri yükleniyor…", "loading");
    const tree = await catalogApi.categories(
      value,
      catalogState.manufacturerId,
      catalogState.langId,
      catalogState.countryId
    );
    renderCategoryTree(tree);
    setCatalogStatus(
      "Bir kategoriyi açtığınızda o kategorinin gerçek parça numaraları yüklenir.",
      "ok"
    );
  } catch (e) {
    setCatalogStatus(describeCatalogError(e), "error");
  }
}

// Kategori ağacı: nodeId -> { text, children }. Yaprak düğümün nodeId'si
// articles/list çağrısındaki productGroupId'dir.
function renderCategoryTree(tree) {
  livePartsGrid.innerHTML = "";
  const root = tree && typeof tree === "object" ? tree : {};

  const entries = Object.entries(root.categories || root);
  if (entries.length === 0) {
    setCatalogStatus("Bu araç için kategori bulunamadı.", "warn");
    return;
  }

  for (const [nodeId, node] of entries) {
    if (!node || typeof node !== "object") continue;
    livePartsGrid.appendChild(buildCategoryNode(nodeId, node));
  }
}

function buildCategoryNode(nodeId, node) {
  const details = document.createElement("details");
  details.className = "part-category live";

  const summary = document.createElement("summary");
  summary.innerHTML = `<span class="cat-icon">📦</span> ${node.text || "Kategori " + nodeId}`;
  details.appendChild(summary);

  const body = document.createElement("div");
  body.className = "live-body";
  details.appendChild(body);

  const children = node.children && Object.keys(node.children).length > 0 ? node.children : null;

  if (children) {
    for (const [childId, child] of Object.entries(children)) {
      body.appendChild(buildCategoryNode(childId, child));
    }
  } else {
    let loaded = false;
    details.addEventListener("toggle", async () => {
      if (!details.open || loaded) return;
      loaded = true;
      body.innerHTML = '<p class="loading-line">Parçalar yükleniyor…</p>';
      try {
        const payload = await catalogApi.articles(
          catalogState.vehicleId,
          nodeId,
          catalogState.manufacturerId,
          catalogState.langId,
          catalogState.countryId
        );
        renderArticles(body, asArray(payload));
      } catch (e) {
        loaded = false; // tekrar denenebilsin
        body.innerHTML = `<p class="loading-line error">${describeCatalogError(e)}</p>`;
      }
    });
  }

  return details;
}

function renderArticles(container, articles) {
  container.innerHTML = "";

  if (articles.length === 0) {
    container.innerHTML = '<p class="loading-line">Bu kategoride parça bulunamadı.</p>';
    return;
  }

  const table = document.createElement("table");
  table.className = "articles-table";
  table.innerHTML =
    "<thead><tr><th>Parça No</th><th>Üretici</th><th>Ürün</th></tr></thead>";

  const tbody = document.createElement("tbody");
  for (const a of articles) {
    const tr = document.createElement("tr");

    const no = document.createElement("td");
    no.className = "article-no";
    no.textContent = a.articleNo || "—";

    const supplier = document.createElement("td");
    supplier.textContent = a.supplierName || "—";

    const name = document.createElement("td");
    name.textContent = a.articleProductName || "—";

    tr.append(no, supplier, name);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  container.appendChild(table);

  const note = document.createElement("p");
  note.className = "loading-line";
  note.textContent = `${articles.length} parça listelendi. Numaralar API'den geldiği gibi gösterilir — satın almadan önce aracınızın modeli/motoruyla teyit edin.`;
  container.appendChild(note);
}

// ---- API anahtarı paneli ----

function refreshApiKeyStatus() {
  const key = getApiKey();
  if (key) {
    apiKeyStatus.textContent = `Anahtar kayıtlı (••••${key.slice(-4)}). Bir VIN girdiğinizde canlı katalog açılır.`;
    apiKeyStatus.className = "api-hint ok";
  } else {
    apiKeyStatus.textContent = "Anahtar kayıtlı değil — yalnızca genel kategori referansı gösterilir.";
    apiKeyStatus.className = "api-hint";
  }
}

apiKeySave.addEventListener("click", () => {
  const value = apiKeyInput.value.trim();
  if (!value) {
    apiKeyStatus.textContent = "Lütfen bir anahtar girin.";
    apiKeyStatus.className = "api-hint warn";
    return;
  }
  if (!storeApiKey(value)) {
    apiKeyStatus.textContent = "Anahtar kaydedilemedi (tarayıcı depolamayı engelliyor olabilir).";
    apiKeyStatus.className = "api-hint error";
    return;
  }
  apiKeyInput.value = "";
  refreshApiKeyStatus();
  render(vinInput.value.trim());
});

apiKeyClear.addEventListener("click", () => {
  storeApiKey("");
  apiKeyInput.value = "";
  refreshApiKeyStatus();
  render(vinInput.value.trim());
});

refreshApiKeyStatus();

vinInput.addEventListener("input", () => {
  const cleaned = vinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  vinInput.value = cleaned;
  charCount.textContent = `${cleaned.length} / 17 karakter`;
  render(cleaned);
});

clearBtn.addEventListener("click", () => {
  vinInput.value = "";
  charCount.textContent = "0 / 17 karakter";
  render("");
  vinInput.focus();
});

sampleBtn.addEventListener("click", () => {
  const sample = SAMPLE_VINS[sampleIndex % SAMPLE_VINS.length];
  sampleIndex++;
  vinInput.value = sample;
  charCount.textContent = `${sample.length} / 17 karakter`;
  render(sample);
});
