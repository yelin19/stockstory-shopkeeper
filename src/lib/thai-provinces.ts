// Thai province reference for the public shop cart.
//
// Abbreviations follow the list "รายชื่ออักษรย่อของจังหวัด และรหัสจังหวัด
// (อ้างอิงจากมหาดไทย)" published by the Department of Skill Development
// (https://www.dsd.go.th). Province codes are the two-digit codes of the Department of
// Provincial Administration (กรมการปกครอง), Ministry of Interior, which are
// also printed on Thai ID cards. The DSD PDF lists the rows in rotated columns,
// so a few codes are visually shifted there; the codes below are cross-checked
// against the same Ministry-of-Interior table used by Thai customs and the
// Statistics Bureau (e.g. Bangkok 10, Krabi 81, Phuket 83, Narathiwat 96).

export type ThaiProvince = {
  /** Two-digit DOPA province code, e.g. "10" for Bangkok. */
  code: string;
  /** Thai abbreviation without the trailing dot, e.g. "กท". */
  abbr: string;
  /** Thai province name, e.g. "กรุงเทพมหานคร". */
  name: string;
  /** Common English name, used for search. */
  nameEn: string;
};

export const THAI_PROVINCES: readonly ThaiProvince[] = [
  { code: "10", abbr: "กท", name: "กรุงเทพมหานคร", nameEn: "Bangkok" },
  { code: "11", abbr: "สป", name: "สมุทรปราการ", nameEn: "Samut Prakan" },
  { code: "12", abbr: "นบ", name: "นนทบุรี", nameEn: "Nonthaburi" },
  { code: "13", abbr: "ปท", name: "ปทุมธานี", nameEn: "Pathum Thani" },
  { code: "14", abbr: "อย", name: "พระนครศรีอยุธยา", nameEn: "Phra Nakhon Si Ayutthaya" },
  { code: "15", abbr: "อท", name: "อ่างทอง", nameEn: "Ang Thong" },
  { code: "16", abbr: "ลบ", name: "ลพบุรี", nameEn: "Lop Buri" },
  { code: "17", abbr: "สห", name: "สิงห์บุรี", nameEn: "Sing Buri" },
  { code: "18", abbr: "ชน", name: "ชัยนาท", nameEn: "Chai Nat" },
  { code: "19", abbr: "สบ", name: "สระบุรี", nameEn: "Saraburi" },
  { code: "20", abbr: "ชบ", name: "ชลบุรี", nameEn: "Chon Buri" },
  { code: "21", abbr: "รย", name: "ระยอง", nameEn: "Rayong" },
  { code: "22", abbr: "จบ", name: "จันทบุรี", nameEn: "Chanthaburi" },
  { code: "23", abbr: "ตร", name: "ตราด", nameEn: "Trat" },
  { code: "24", abbr: "ฉช", name: "ฉะเชิงเทรา", nameEn: "Chachoengsao" },
  { code: "25", abbr: "ปจ", name: "ปราจีนบุรี", nameEn: "Prachin Buri" },
  { code: "26", abbr: "นย", name: "นครนายก", nameEn: "Nakhon Nayok" },
  { code: "27", abbr: "สก", name: "สระแก้ว", nameEn: "Sa Kaeo" },
  { code: "30", abbr: "นม", name: "นครราชสีมา", nameEn: "Nakhon Ratchasima" },
  { code: "31", abbr: "บร", name: "บุรีรัมย์", nameEn: "Buriram" },
  { code: "32", abbr: "สร", name: "สุรินทร์", nameEn: "Surin" },
  { code: "33", abbr: "ศก", name: "ศรีสะเกษ", nameEn: "Sisaket" },
  { code: "34", abbr: "อบ", name: "อุบลราชธานี", nameEn: "Ubon Ratchathani" },
  { code: "35", abbr: "ยส", name: "ยโสธร", nameEn: "Yasothon" },
  { code: "36", abbr: "ชย", name: "ชัยภูมิ", nameEn: "Chaiyaphum" },
  { code: "37", abbr: "อจ", name: "อำนาจเจริญ", nameEn: "Amnat Charoen" },
  { code: "38", abbr: "บก", name: "บึงกาฬ", nameEn: "Bueng Kan" },
  { code: "39", abbr: "นภ", name: "หนองบัวลำภู", nameEn: "Nong Bua Lamphu" },
  { code: "40", abbr: "ขก", name: "ขอนแก่น", nameEn: "Khon Kaen" },
  { code: "41", abbr: "อด", name: "อุดรธานี", nameEn: "Udon Thani" },
  { code: "42", abbr: "ลย", name: "เลย", nameEn: "Loei" },
  { code: "43", abbr: "นค", name: "หนองคาย", nameEn: "Nong Khai" },
  { code: "44", abbr: "มค", name: "มหาสารคาม", nameEn: "Maha Sarakham" },
  { code: "45", abbr: "รอ", name: "ร้อยเอ็ด", nameEn: "Roi Et" },
  { code: "46", abbr: "กส", name: "กาฬสินธุ์", nameEn: "Kalasin" },
  { code: "47", abbr: "สน", name: "สกลนคร", nameEn: "Sakon Nakhon" },
  { code: "48", abbr: "นพ", name: "นครพนม", nameEn: "Nakhon Phanom" },
  { code: "49", abbr: "มห", name: "มุกดาหาร", nameEn: "Mukdahan" },
  { code: "50", abbr: "ชม", name: "เชียงใหม่", nameEn: "Chiang Mai" },
  { code: "51", abbr: "ลพ", name: "ลำพูน", nameEn: "Lamphun" },
  { code: "52", abbr: "ลป", name: "ลำปาง", nameEn: "Lampang" },
  { code: "53", abbr: "อต", name: "อุตรดิตถ์", nameEn: "Uttaradit" },
  { code: "54", abbr: "พร", name: "แพร่", nameEn: "Phrae" },
  { code: "55", abbr: "นน", name: "น่าน", nameEn: "Nan" },
  { code: "56", abbr: "พย", name: "พะเยา", nameEn: "Phayao" },
  { code: "57", abbr: "ชร", name: "เชียงราย", nameEn: "Chiang Rai" },
  { code: "58", abbr: "มส", name: "แม่ฮ่องสอน", nameEn: "Mae Hong Son" },
  { code: "60", abbr: "นว", name: "นครสวรรค์", nameEn: "Nakhon Sawan" },
  { code: "61", abbr: "อน", name: "อุทัยธานี", nameEn: "Uthai Thani" },
  { code: "62", abbr: "กพ", name: "กำแพงเพชร", nameEn: "Kamphaeng Phet" },
  { code: "63", abbr: "ตก", name: "ตาก", nameEn: "Tak" },
  { code: "64", abbr: "สท", name: "สุโขทัย", nameEn: "Sukhothai" },
  { code: "65", abbr: "พล", name: "พิษณุโลก", nameEn: "Phitsanulok" },
  { code: "66", abbr: "พจ", name: "พิจิตร", nameEn: "Phichit" },
  { code: "67", abbr: "พช", name: "เพชรบูรณ์", nameEn: "Phetchabun" },
  { code: "70", abbr: "รบ", name: "ราชบุรี", nameEn: "Ratchaburi" },
  { code: "71", abbr: "กจ", name: "กาญจนบุรี", nameEn: "Kanchanaburi" },
  { code: "72", abbr: "สพ", name: "สุพรรณบุรี", nameEn: "Suphan Buri" },
  { code: "73", abbr: "นฐ", name: "นครปฐม", nameEn: "Nakhon Pathom" },
  { code: "74", abbr: "สค", name: "สมุทรสาคร", nameEn: "Samut Sakhon" },
  { code: "75", abbr: "สส", name: "สมุทรสงคราม", nameEn: "Samut Songkhram" },
  { code: "76", abbr: "พบ", name: "เพชรบุรี", nameEn: "Phetchaburi" },
  { code: "77", abbr: "ปข", name: "ประจวบคีรีขันธ์", nameEn: "Prachuap Khiri Khan" },
  { code: "80", abbr: "นศ", name: "นครศรีธรรมราช", nameEn: "Nakhon Si Thammarat" },
  { code: "81", abbr: "กบ", name: "กระบี่", nameEn: "Krabi" },
  { code: "82", abbr: "พง", name: "พังงา", nameEn: "Phang Nga" },
  { code: "83", abbr: "ภก", name: "ภูเก็ต", nameEn: "Phuket" },
  { code: "84", abbr: "สฎ", name: "สุราษฎร์ธานี", nameEn: "Surat Thani" },
  { code: "85", abbr: "รน", name: "ระนอง", nameEn: "Ranong" },
  { code: "86", abbr: "ชพ", name: "ชุมพร", nameEn: "Chumphon" },
  { code: "90", abbr: "สข", name: "สงขลา", nameEn: "Songkhla" },
  { code: "91", abbr: "สต", name: "สตูล", nameEn: "Satun" },
  { code: "92", abbr: "ตง", name: "ตรัง", nameEn: "Trang" },
  { code: "93", abbr: "พท", name: "พัทลุง", nameEn: "Phatthalung" },
  { code: "94", abbr: "ปน", name: "ปัตตานี", nameEn: "Pattani" },
  { code: "95", abbr: "ยล", name: "ยะลา", nameEn: "Yala" },
  { code: "96", abbr: "นธ", name: "นราธิวาส", nameEn: "Narathiwat" },
];

/** Common spellings that are not the exact official name or abbreviation. */
const PROVINCE_ALIASES: Record<string, string> = {
  กทม: "10",
  กรุงเทพ: "10",
  bkk: "10",
  bangkok: "10",
  โคราช: "30",
  korat: "30",
  อยุธยา: "14",
  ayutthaya: "14",
  "krung thep": "10",
  "krung thep maha nakhon": "10",
};

const normalizeKey = (value: string) =>
  value
    .trim()
    .replace(/^จังหวัด\s*/u, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[.·]/g, "")
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();

let provinceIndex: { byCode: Map<string, ThaiProvince>; byKey: Map<string, ThaiProvince> } | null =
  null;

function index() {
  if (provinceIndex) return provinceIndex;
  const byCode = new Map<string, ThaiProvince>();
  const byKey = new Map<string, ThaiProvince>();
  for (const province of THAI_PROVINCES) {
    byCode.set(province.code, province);
    byKey.set(normalizeKey(province.name), province);
    byKey.set(normalizeKey(province.nameEn), province);
    byKey.set(normalizeKey(province.abbr), province);
  }
  provinceIndex = { byCode, byKey };
  return provinceIndex;
}

export function findThaiProvince(value: string | null | undefined): ThaiProvince | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const { byCode, byKey } = index();
  const key = normalizeKey(raw);
  const direct = byCode.get(raw) ?? byKey.get(key);
  if (direct) return direct;
  const alias = PROVINCE_ALIASES[key];
  return alias ? (byCode.get(alias) ?? null) : null;
}

export function thaiProvinceLabel(province: ThaiProvince): string {
  return `${province.name} (${province.abbr}) · ${province.code}`;
}

/** Value stored in orders.township, e.g. "กรุงเทพมหานคร (กท)". */
export function thaiProvinceTownship(province: ThaiProvince): string {
  return `${province.name} (${province.abbr})`;
}

export const THAI_PROVINCES_BY_NAME: readonly ThaiProvince[] = [...THAI_PROVINCES].sort((a, b) =>
  a.name.localeCompare(b.name, "th"),
);

export function sanitizeAddressDetail(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, 300);
}

export type CartAddress = { province: ThaiProvince; detail: string };

/**
 * Builds the two extra lines of the Messenger cart payload so the customer does
 * not have to type the province again in the chat.
 */
export function encodeCartAddressLines(province: ThaiProvince, detail: string): string[] {
  const clean = sanitizeAddressDetail(detail);
  if (!clean) return [];
  return [
    `ADDR_PROVINCE: ${province.code}|${province.abbr}|${province.name}`,
    `ADDR_DETAIL: ${clean}`,
  ];
}

/**
 * Reads ADDR_PROVINCE / ADDR_DETAIL lines from a CART_ORDER payload. Returns
 * null when either part is missing or the province cannot be recognised, so
 * older cart links keep working and the bot asks for the full address.
 */
export function decodeCartAddressLines(lines: readonly string[]): CartAddress | null {
  const find = (name: string) =>
    lines.find((line) => new RegExp(`^ADDR_${name}\\s*:`, "i").test(line.trim()));
  const provinceLine = find("PROVINCE");
  const detailLine = find("DETAIL");
  if (!provinceLine || !detailLine) return null;
  const province = provinceLine
    .slice(provinceLine.indexOf(":") + 1)
    .split("|")
    .map((part) => findThaiProvince(part))
    .find((candidate): candidate is ThaiProvince => Boolean(candidate));
  const detail = sanitizeAddressDetail(detailLine.slice(detailLine.indexOf(":") + 1));
  if (!province || detail.length < 3) return null;
  return { province, detail };
}
