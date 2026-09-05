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

// Bilinen bazı WMI (ilk 3 hane) -> üretici eşlemeleri. Kapsamlı değildir;
// yalnızca yaygın üreticiler için kaba bir tahmin sağlar.
const WMI_TABLE = {
  WVW: "Volkswagen (Binek)", WV1: "Volkswagen (Ticari)", WV2: "Volkswagen (Ticari)",
  WBA: "BMW", WBS: "BMW M", WBY: "BMW (Elektrikli)",
  WDB: "Mercedes-Benz", WDD: "Mercedes-Benz", WDC: "Mercedes-Benz (SUV)",
  WAU: "Audi", TRU: "Audi (Macaristan)",
  WP0: "Porsche", WP1: "Porsche (SUV)",
  VF1: "Renault", VF3: "Peugeot", VF7: "Citroën",
  ZFA: "Fiat", ZFF: "Ferrari", ZAR: "Alfa Romeo", ZLA: "Lancia",
  SAJ: "Jaguar", SAL: "Land Rover", SCC: "Lotus",
  JHM: "Honda (Japonya)", JH4: "Acura", JN1: "Nissan", JN8: "Nissan",
  JT2: "Toyota", JT3: "Toyota", JTD: "Toyota", JTE: "Toyota (Lexus/SUV)",
  JM1: "Mazda", JF1: "Subaru", JS2: "Suzuki", JS3: "Suzuki",
  KMH: "Hyundai", KM8: "Hyundai (SUV)", KNA: "Kia", KND: "Kia (SUV)",
  LFV: "FAW-Volkswagen (Çin)", LSV: "SAIC-Volkswagen (Çin)", LVS: "Ford (Çin)",
  LGB: "Dongfeng (Çin)",
  "1FA": "Ford", "1FM": "Ford (SUV)", "1FT": "Ford (Kamyonet)",
  "1G1": "Chevrolet", "1GC": "Chevrolet (Kamyonet)", "1GM": "Pontiac",
  "1HG": "Honda (Kuzey Amerika)", "1N4": "Nissan (Kuzey Amerika)",
  "2T1": "Toyota (Kanada)", "3VW": "Volkswagen (Meksika)",
  NMT: "Toyota (Türkiye)", "NM0": "Ford Otosan (Türkiye)",
  NLE: "Tofaş / Fiat (Türkiye)", "NL5": "Tofaş / Fiat (Türkiye)",
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
  const manufacturer = WMI_TABLE[wmi] || null;

  const years = YEAR_CODES[yearChar] || null;

  return {
    valid: true,
    vin,
    wmi,
    vds,
    region,
    manufacturer,
    checkDigitChar,
    expectedCheckChar,
    checkDigitValid,
    yearChar,
    years,
    plantChar,
    serial,
  };
}

// ---- UI ----

const vinInput = document.getElementById("vin-input");
const charCount = document.getElementById("char-count");
const clearBtn = document.getElementById("clear-btn");
const sampleBtn = document.getElementById("sample-btn");
const errorBox = document.getElementById("error-box");
const resultSection = document.getElementById("result");
const resultGrid = document.getElementById("result-grid");
const vinVisual = document.getElementById("vin-visual");

const SAMPLE_VINS = [
  "WVWZZZ1JZXW000001",
  "1HGCM82633A004352",
  "JTDBR32E720012345",
];
let sampleIndex = 0;

function render(vin) {
  errorBox.hidden = true;
  resultSection.hidden = true;
  resultGrid.innerHTML = "";
  vinVisual.innerHTML = "";

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
      label: "Tahmini Üretici",
      value: result.manufacturer || "Bulunamadı (tanınmayan WMI kodu)",
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
