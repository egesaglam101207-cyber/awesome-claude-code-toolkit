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

// Bilinen bazı WMI (ilk 3 hane) -> üretici eşlemeleri.
// Bu program yalnızca Asya (özellikle Japonya ve Güney Kore) kökenli
// markalara odaklanır; kapsam bilinçli olarak dar tutulmuştur ve
// kapsamlı bir liste değildir — yalnızca yaygın modeller için kaba bir
// tahmin sağlar. `brand` alanı parça kategorileri bölümünde marka
// ailesini eşlemek için kullanılır.
const WMI_TABLE = {
  // Toyota / Lexus
  JT2: { brand: "Toyota", label: "Toyota" },
  JT3: { brand: "Toyota", label: "Toyota" },
  JTD: { brand: "Toyota", label: "Toyota" },
  JTE: { brand: "Toyota", label: "Toyota (SUV)" },
  JTH: { brand: "Lexus", label: "Lexus" },
  JTJ: { brand: "Lexus", label: "Lexus (SUV)" },
  "2T1": { brand: "Toyota", label: "Toyota (Kanada)" },
  "4T1": { brand: "Toyota", label: "Toyota (ABD)" },
  "5TD": { brand: "Toyota", label: "Toyota (ABD, Minivan/SUV)" },
  NMT: { brand: "Toyota", label: "Toyota (Türkiye)" },

  // Honda / Acura
  JHM: { brand: "Honda", label: "Honda" },
  JH4: { brand: "Acura", label: "Acura" },
  "1HG": { brand: "Honda", label: "Honda (Kuzey Amerika)" },
  "2HG": { brand: "Honda", label: "Honda (Kanada)" },
  "19X": { brand: "Honda", label: "Honda (ABD)" },
  "5FN": { brand: "Honda", label: "Honda (ABD, SUV)" },

  // Nissan / Infiniti
  JN1: { brand: "Nissan", label: "Nissan" },
  JN8: { brand: "Nissan", label: "Nissan (SUV)" },
  JNK: { brand: "Infiniti", label: "Infiniti" },
  JNR: { brand: "Infiniti", label: "Infiniti (SUV)" },
  "1N4": { brand: "Nissan", label: "Nissan (Kuzey Amerika)" },
  "1N6": { brand: "Nissan", label: "Nissan (Kuzey Amerika, Kamyonet)" },
  "3N1": { brand: "Nissan", label: "Nissan (Meksika)" },
  "5N1": { brand: "Nissan", label: "Nissan (ABD, SUV)" },

  // Mazda
  JM1: { brand: "Mazda", label: "Mazda" },
  JM3: { brand: "Mazda", label: "Mazda (SUV)" },
  "4F2": { brand: "Mazda", label: "Mazda (ABD)" },
  "1YV": { brand: "Mazda", label: "Mazda (ABD)" },

  // Subaru
  JF1: { brand: "Subaru", label: "Subaru" },
  JF2: { brand: "Subaru", label: "Subaru (SUV)" },
  "4S3": { brand: "Subaru", label: "Subaru (ABD)" },
  "4S4": { brand: "Subaru", label: "Subaru (ABD, SUV)" },

  // Suzuki
  JS2: { brand: "Suzuki", label: "Suzuki" },
  JS3: { brand: "Suzuki", label: "Suzuki (SUV)" },
  JS4: { brand: "Suzuki", label: "Suzuki (SUV)" },

  // Mitsubishi
  JA3: { brand: "Mitsubishi", label: "Mitsubishi" },
  JA4: { brand: "Mitsubishi", label: "Mitsubishi (SUV)" },
  "4A3": { brand: "Mitsubishi", label: "Mitsubishi (ABD)" },
  "4A4": { brand: "Mitsubishi", label: "Mitsubishi (ABD, SUV)" },

  // Isuzu / Daihatsu
  JAA: { brand: "Isuzu", label: "Isuzu" },
  JDA: { brand: "Daihatsu", label: "Daihatsu" },

  // Hyundai / Genesis
  KMH: { brand: "Hyundai", label: "Hyundai" },
  KM8: { brand: "Hyundai", label: "Hyundai (SUV)" },
  "5NP": { brand: "Hyundai", label: "Hyundai (ABD)" },
  "5NM": { brand: "Hyundai", label: "Hyundai (ABD, SUV)" },
  KMT: { brand: "Genesis", label: "Genesis" },

  // Kia
  KNA: { brand: "Kia", label: "Kia" },
  KND: { brand: "Kia", label: "Kia (SUV)" },
  KNM: { brand: "Kia", label: "Kia (MPV)" },
  "5XY": { brand: "Kia", label: "Kia (ABD)" },

  // SsangYong
  KPA: { brand: "SsangYong", label: "SsangYong" },
};

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

  const region = guessRegion(vin[0]);
  const match = WMI_TABLE[wmi] || null;
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
        : `Uyuşmuyor — beklenen "${result.expectedCheckChar}", girilen "${result.checkDigitChar}"`,
      status: result.checkDigitValid ? "ok" : "warn",
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
}

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
