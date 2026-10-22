/**
 * Safepay's customer-create API requires an ISO 3166-1 alpha-2 `country`
 * (R011), but signup forms often collect only a phone number.
 *
 * To satisfy that contract without silently assuming a default, we derive the
 * ISO code from the phone number's international dialing code (E.164). When it
 * cannot be derived we fall back to an EXPLICIT configured default
 * (`SAFEPAY_DEFAULT_COUNTRY`) if present, otherwise we return null so the
 * caller can surface an actionable error rather than guess.
 *
 * Decision-log R014.
 */

/** E.164 dialing code (international prefix) → ISO 3166-1 alpha-2 country. */
const DIALING_CODE_TO_COUNTRY: Record<string, string[]> = {
  "93": ["AF"],
  "355": ["AL"],
  "213": ["DZ"],
  "376": ["AD"],
  "244": ["AO"],
  "54": ["AR"],
  "374": ["AM"],
  "61": ["AU", "CX", "CC"],
  "43": ["AT"],
  "994": ["AZ"],
  "1242": ["BS"],
  "973": ["BH"],
  "880": ["BD"],
  "375": ["BY"],
  "32": ["BE"],
  "501": ["BZ"],
  "229": ["BJ"],
  "975": ["BT"],
  "591": ["BO"],
  "387": ["BA"],
  "267": ["BW"],
  "55": ["BR"],
  "673": ["BN"],
  "359": ["BG"],
  "226": ["BF"],
  "257": ["BI"],
  "855": ["KH"],
  "237": ["CM"],
  "1": ["US", "CA", "PR", "GU", "VI", "AS", "MP"],
  "238": ["CV"],
  "236": ["CF"],
  "235": ["TD"],
  "56": ["CL"],
  "86": ["CN"],
  "57": ["CO"],
  "242": ["CG"],
  "506": ["CR"],
  "385": ["HR"],
  "53": ["CU"],
  "357": ["CY"],
  "420": ["CZ"],
  "45": ["DK"],
  "253": ["DJ"],
  "593": ["EC"],
  "20": ["EG"],
  "503": ["SV"],
  "240": ["GQ"],
  "372": ["EE"],
  "251": ["ET"],
  "298": ["FO"],
  "679": ["FJ"],
  "358": ["FI"],
  "33": ["FR"],
  "241": ["GA"],
  "220": ["GM"],
  "995": ["GE"],
  "49": ["DE"],
  "233": ["GH"],
  "30": ["GR"],
  "590": ["GP"],
  "502": ["GT"],
  "224": ["GN"],
  "245": ["GW"],
  "592": ["GY"],
  "509": ["HT"],
  "504": ["HN"],
  "852": ["HK"],
  "36": ["HU"],
  "354": ["IS"],
  "91": ["IN"],
  "62": ["ID"],
  "98": ["IR"],
  "964": ["IQ"],
  "353": ["IE"],
  "39": ["IT"],
  "225": ["CI"],
  "81": ["JP"],
  "962": ["JO"],
  "254": ["KE"],
  "82": ["KR"],
  "965": ["KW"],
  "996": ["KG"],
  "856": ["LA"],
  "371": ["LV"],
  "961": ["LB"],
  "266": ["LS"],
  "231": ["LR"],
  "218": ["LY"],
  "423": ["LI"],
  "370": ["LT"],
  "352": ["LU"],
  "853": ["MO"],
  "389": ["MK"],
  "60": ["MY"],
  "265": ["MW"],
  "960": ["MV"],
  "223": ["ML"],
  "356": ["MT"],
  "222": ["MR"],
  "230": ["MU"],
  "52": ["MX"],
  "373": ["MD"],
  "377": ["MC"],
  "976": ["MN"],
  "382": ["ME"],
  "212": ["MA"],
  "258": ["MZ"],
  "95": ["MM"],
  "264": ["NA"],
  "977": ["NP"],
  "31": ["NL"],
  "64": ["NZ"],
  "505": ["NI"],
  "227": ["NE"],
  "234": ["NG"],
  "47": ["NO"],
  "968": ["OM"],
  "92": ["PK"],
  "507": ["PA"],
  "675": ["PG"],
  "595": ["PY"],
  "51": ["PE"],
  "63": ["PH"],
  "48": ["PL"],
  "351": ["PT"],
  "974": ["QA"],
  "40": ["RO"],
  "7": ["RU", "KZ"],
  "250": ["RW"],
  "966": ["SA"],
  "221": ["SN"],
  "381": ["RS"],
  "65": ["SG"],
  "421": ["SK"],
  "386": ["SI"],
  "27": ["ZA"],
  "34": ["ES"],
  "94": ["LK"],
  "249": ["SD"],
  "597": ["SR"],
  "46": ["SE"],
  "41": ["CH"],
  "963": ["SY"],
  "886": ["TW"],
  "992": ["TJ"],
  "255": ["TZ"],
  "66": ["TH"],
  "228": ["TG"],
  "216": ["TN"],
  "90": ["TR"],
  "993": ["TM"],
  "256": ["UG"],
  "380": ["UA"],
  "971": ["AE"],
  "44": ["GB"],
  "598": ["UY"],
  "998": ["UZ"],
  "58": ["VE"],
  "84": ["VN"],
  "967": ["YE"],
  "260": ["ZM"],
  "263": ["ZW"],
};

function longestDialingCodeMatch(phoneDigits: string): string | null {
  for (let len = 4; len >= 1; len -= 1) {
    const prefix = phoneDigits.slice(0, len);
    if (prefix.length > 0 && DIALING_CODE_TO_COUNTRY[prefix]) return prefix;
  }
  return null;
}

/**
 * Derive the best-guess ISO alpha-2 country from a phone number.
 *
 * - If the phone starts with `+` (E.164) the dialing code is parsed and the
 *   first matching country is returned.
 * - If the phone is a bare national number with no `+` and the configured
 *   default is set, that default is the only safe interpretation.
 *
 * Returned country may be ambiguous (e.g. `+1` → US/CA) — the first hash
 * entry is the primary market. When nothing can be derived, returns null so
 * the caller must surface an actionable error (never silently assume).
 */
export function deriveCountryFromPhone(
  phone: string | undefined | null,
  defaultCountry?:
    | string
    | null,
): string | null {
  if (defaultCountry) return defaultCountry;

  const raw = (phone ?? "").trim().replace(/[^\d+]/g, "");
  if (!raw.startsWith("+")) return null;

  const digits = raw.slice(1);
  const prefix = longestDialingCodeMatch(digits);
  if (!prefix) return null;

  const countries = DIALING_CODE_TO_COUNTRY[prefix];
  if (countries && countries.length > 0) return countries[0]!;
  return null;
}
