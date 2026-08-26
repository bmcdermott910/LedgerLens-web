// Derives a vendor for the drill-down from `description` when `txn_name` is blank, which is
// true of 3,176 of 4,232 rows. Three families live in that column: card/bank descriptors
// ("ANTHROPIC SAN FRANCISCO CA XXXX1117"), ACH/payroll strings, and journal-entry memos
// ("To accrue DocuSign Annual expense"). Only the first is machine-parseable; the other two
// resolve by alias or not at all. Returning null is always preferable to guessing -- a wrong
// vendor on a CFO's expense analysis is worse than an honest "No vendor".

// The bank pads the merchant field to a fixed width and truncates it, so a long merchant name
// runs straight into the city with no space: "ANTHROPIC: CLAUDE TES" + "AN FRANCISCO" (the "S"
// of SAN was eaten), "DD *DOORDASH MCDONAL" + "SAN FRANCISCO". Column positions can't be used
// to undo this because the source has already collapsed the padding to single spaces, so the
// city stripper below matches any suffix of a known city, glued or not.

// City tails observed in this dataset, longest first so "SALT LAKE CITY" wins over "LAKE CITY".
// The regex allows the leading characters to be missing to survive the truncation described
// above ("...TESAN FRANCISCO" still loses "AN FRANCISCO").
const CITIES = [
  'SALT LAKE CITY', 'OKLAHOMA CITY', 'GREENWOOD VILLAGE', 'FORT LAUDERDALE', 'FT LAUDERDALE',
  'FT. LAUDERDALE', 'FORT LAUDERDA', 'CRESTVIEW HILLS', 'CRESTVIEW HILL', 'CRESTVIEW HIL',
  'CRESCENT SPRINGS', 'CRESCENT SPRING', 'HIGHLAND HEIGHTS', 'HIGHLAND HEIG', 'SAN FRANCISCO',
  'REDWOOD CITY', 'HOFFMAN ESTAT', 'PLEASANT GROVE', 'MOUNTAIN VIEW', 'TRAVERSE CITY',
  'EAST ELMHURST', 'NEWPORT BEACH', 'LAKESIDE PARK', 'BENTONVILLE', 'MISSISSAUGA', 'JACKSONVILLE',
  'SAN LEANDRO', 'ALPHARETTA', 'LOUISVILLE', 'DES PLAINES', 'FT MITCHELL', 'FORT MITCHELL',
  'INDEPENDENCE', 'AUBURN HILLS', 'CHATSWORTH', 'CLEARWATER', 'FORT WRIGHT', 'FT WRIGHT',
  'PARK HILLS', 'NEW ALBANY', 'NEW HAVEN', 'SASKATOON', 'CINCINNATI', 'COVINGTON', 'WASHINGTON',
  'CHARLOTTE', 'NASHVILLE', 'LAS VEGAS', 'NEW YORK', 'PLANTATION', 'SUNNYVALE', 'FORT WAYNE',
  'RISING SUN', 'THOMASTON', 'WILMINGTON', 'FRANKFORT', 'SINGAPORE', 'LOVELAND', 'BELLEVUE',
  'MONTVALE', 'COLUMBUS', 'ORLANDO', 'HOUSTON', 'ATLANTA', 'DETROIT', 'CHICAGO', 'WESTLAKE',
  'MILFORD', 'ERLANGER', 'EDGEWOOD', 'FLORENCE', 'NEWPORT', 'WINNIPEG', 'TORONTO', 'HARTFORD',
  'NAPLES', 'AUSTIN', 'BOSTON', 'DALLAS', 'LONDON', 'DUBLIN', 'TAMPA', 'TEMPE', 'TEMPLE',
  'HEBRON', 'WALTON', 'BETHEL', 'AMELIA', 'BATAVIA', 'DE PERE', 'ARMONK', 'TUSTIN', 'MONTGOMERY',
  'SAN JOSE', 'QUEBEC', 'QUÉBEC', 'PROVO', 'PLANO', 'UNION', 'TROY', 'ACME', 'LYON',
  'NEW YORK CITY', 'CRESTVIEW HLS', 'CRESTVIEW', 'WILLIAMSBURG', 'BIRMINGHAM', 'PALO ALTO',
  'HAWTHORNE', 'WHITECHAPEL', 'MOUNT ZION',
];

// Each city contributes itself plus its two shorter suffixes, so a city that lost a leading
// character to the truncation ("SAN FRANCISCO" arriving as "...AN FRANCISCO") still matches.
// No leading \s is required, because the truncated form is glued to the merchant.
const CITY_TAIL = new RegExp(
  `\\s*(?:${CITIES.flatMap((city) => [city, city.slice(1), city.slice(2)])
    .filter((form) => form.length >= 4)
    .sort((a, b) => b.length - a.length)
    .map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|')})$`,
  'i',
);

// A two-letter state/province/country code sits between the city and the card mask.
const STATE_TAIL = /\s+(?:[A-Z]{2}|GB|SG|RH)\s*$/;

// Anything with a masked account number in it came off a card or bank feed. This is the gate
// for the generic parser: memos never carry one, so prose can't reach the parser by accident.
const CARD_MASK = /X{2,}[\dX]/i;

// Processor prefixes that sit in front of the real merchant (Toast, Square, DoorDash, Apple Pay,
// GoDaddy's reseller, etc.). Stripped after the alias pass so aliases can still see them.
const PROCESSOR_PREFIX = /^(?:AplPay|APPLE PAY|TST[-*]|SPO\*|SQ ?\*|PY \*|BT\*|PAR\*|GLF\*|FS \*|SMK\*|PST\*|DNH\*|FH\* |BM \* |HLU\*|WEB\*|DOJO\*|ZETTLE \*|SUMUP\*|SP |FREEMIUS\*|WPMET\*|CITY HIVE INC\*|XXXX?\d* )\s*/i;

// Tokens that are all X's and digits -- the card mask itself, plus store/invoice numbers the
// feed also masks ("KROGER #XXX XXXX0042NEWPORT", "ARBYS XXXX 6354X1042").
const MASK_TOKEN = /(?:\s*\S*X{2,}[\dX-]*\d*|\s*\S*X\d{3,})\s*$/i;

// Trailing store / terminal numbers ("BRAXTONS CLEANERS #2", "TST* THE 19TH HOLE 0"). The
// boundary before the digits matters: without it this eats the tail of a mask token too.
const STORE_NUMBER = /(?:\s+#?|#)\d{1,6}\s*$/;

// What is left when the parser has stripped everything meaningful -- never a vendor.
const NOT_A_VENDOR = /^(?:the|and|inc|llc|ltd|sp|dd|bt|tst|x+)$/i;

const CAPS_KEEP = new Set(['LLC', 'LLP', 'LP', 'USA', 'US', 'UK', 'BBQ', 'IV', 'TV', 'AI', 'NKU', 'OTR', 'DC']);

// Ordered: bank/internal noise first so a wire-fee line naming a payee ("Wire Fee ... BNF:TRACXN
// TECHNOLOGIES") is booked as a bank charge and not as that payee; then specific merchants before
// generic ones. `name: null` means "recognised, but deliberately no vendor".
//
// To extend: add a `{ match, name }` here for any new recurring merchant, above the generic
// entries and below the noise block. Anchor the regex (^, \b, or a distinctive token) rather
// than relying on a bare substring -- see the false-merge note on OPENAI/OPENART below.
const ALIASES = [
  // --- bank, transfer and investment-account noise: real rows, but no vendor ---
  { match: /^(?:incoming )?wire (?:fee|in|out)\b|^incoming wire\b/i, name: null },
  { match: /^internet transfer\b/i, name: null },
  { match: /^(?:reinvest dividend|non-qualified div|sell |buy )/i, name: null },
  { match: /^(?:margin interest|bank interest|credit interest|interest$)/i, name: null },
  { match: /^(?:deposit|withdrawal|service charge|centralnet business)\b/i, name: null },
  { match: /^ach (?:items originated|collection module)\b/i, name: null },
  { match: /^(?:monthly paper statement fee|check & ach positive pay)\b/i, name: null },
  { match: /^(?:return deposited item charge|charge back item|rush card fee)\b/i, name: null },
  { match: /^mobile payment|^apple pay pay with points/i, name: null },
  { match: /\bACCTVERIFY\b|\bBill\.com\b/i, name: null },
  { match: /^check \d{3,}/i, name: null },
  { match: /^renewal membership fee\b/i, name: null },

  // --- internal / employee items that name a person or a bucket, not a vendor ---
  { match: /^Josefczyk .* Expenses$/i, name: null },
  { match: /^HANNAH CREECH\b/i, name: null },
  { match: /^(?:brad|joe|kyle)('s)?\s+(?:life|disability)\s+polic/i, name: null },
  { match: /^(?:travel-|airfare$|dues & subs$|candles for office|monthly retainer|brad \+ lily|cincy chamber dinner)/i, name: null },
  { match: /^(?:IJT Simplified billing|Hourly [Ss]ervices billing)/i, name: null },
  { match: /^First distribution related to/i, name: null },

  // --- AI / dev tooling: the family Brian specifically asked about ---
  // ANTHROPIC / ANTHROPIC: CLAUDE TES.. / ANTHROPIC* CLAUDE SU.. / CLAUDE.AI SUBSCRIPTI.. are
  // all the same subscription; the truncated forms are unparseable without this entry.
  { match: /\bANTHROPIC\b|\bCLAUDE\.AI\b/i, name: 'Anthropic' },
  { match: /\bOPENAI\b|membership for ChatGPT/i, name: 'OpenAI (ChatGPT)' },
  { match: /\bOPENART\b/i, name: 'OpenArt AI' },
  { match: /^GROK\b|\bGROK XAI\b/i, name: 'xAI (Grok)' },
  { match: /\bPERPLEXITY\b/i, name: 'Perplexity' },
  { match: /\bCURSOR AI\b/i, name: 'Cursor' },
  { match: /\bVERCEL\b/i, name: 'Vercel' },
  { match: /\bSUPABASE\b/i, name: 'Supabase' },
  { match: /\bRESEND\b/i, name: 'Resend' },
  { match: /\bSUPERHUMAN\b/i, name: 'Superhuman' },
  { match: /\bGREMINDERS\b/i, name: 'GReminders' },
  { match: /\bKEEPERSECURITY\b/i, name: 'Keeper Security' },
  { match: /\bEODHD\b/i, name: 'EODHD' },
  { match: /\bPLAID INC\b/i, name: 'Plaid' },
  { match: /\bCONNECTWISE\b/i, name: 'ConnectWise' },
  { match: /\bSURFERSEO\b/i, name: 'Surfer SEO' },
  { match: /\bELEMENTOR\b/i, name: 'Elementor' },
  { match: /\bELEMENTSKIT\b/i, name: 'WPmet (ElementsKit)' },
  { match: /\bIMAGIFY\b/i, name: 'WP Media (Imagify)' },
  { match: /\bBLUEHOST\b/i, name: 'Bluehost' },
  { match: /\bIPAGE\b/i, name: 'iPage' },
  { match: /\bGODADDY\b/i, name: 'GoDaddy' },
  { match: /\bDROPBOX\b/i, name: 'Dropbox' },
  { match: /\bADOBE\b/i, name: 'Adobe' },
  { match: /\bCANVA\b/i, name: 'Canva' },
  { match: /\bBUZZSPROUT\b/i, name: 'Buzzsprout' },
  { match: /\bRB2B\b/i, name: 'RB2B' },
  { match: /\bDRIPIFY\b/i, name: 'Dripify' },
  { match: /\bSURVEYMONKEY\b/i, name: 'SurveyMonkey' },
  { match: /\bBITLY\b/i, name: 'Bitly' },
  { match: /\bMOO INC\b/i, name: 'MOO' },
  { match: /\bWWW\.UI\.COM\b/i, name: 'Ubiquiti' },
  { match: /LINKEDIN/i, name: 'LinkedIn' },
  { match: /\bIBM Corporation\b/i, name: 'IBM' },
  { match: /\bSTARLINK\b/i, name: 'Starlink' },
  { match: /\bVENDASTA\b/i, name: 'Vendasta' },
  // "GOOGLE *X" is Google billing on behalf of X, so the payee depends on X.
  { match: /^GOOGLE \*GOOGLE ONE\b/i, name: 'Google One' },
  { match: /^GOOGLE \*PARAMOUNT\b/i, name: 'Paramount+' },
  { match: /\bHULUPLUS\b/i, name: 'Hulu' },
  // Bank feed "MICROSOFT CORPOR - XXXXXX1921", plus the memos that amortise the same licences.
  { match: /\bMICROSOFT\b|\bCoPilot annual license\b/i, name: 'Microsoft' },
  { match: /\bINTUIT\b|\bQuickBooks Payments\b/i, name: 'Intuit (QuickBooks)' },
  { match: /\bAPPLE\.COM\b|^APPLE STORE\b/i, name: 'Apple' },
  { match: /\bINGRAM MICRO\b|Azure Ingram Revenue|licenses for Lighthouse/i, name: 'Ingram Micro' },
  { match: /\bPAX8\b/i, name: 'Pax8' },
  { match: /\bINTY\b/i, name: 'INTY' },

  // --- subscriptions and services named only in journal-entry memos ---
  { match: /\bDocuSign\b/i, name: 'DocuSign' },
  { match: /\bSparkhaus\b/i, name: 'Sparkhaus' },
  { match: /\bSMARSH\b/i, name: 'Smarsh' },
  { match: /\bTRACXN\b/i, name: 'Tracxn' },
  { match: /\bYcharts\b/i, name: 'YCharts' },
  { match: /\bVisible Annual Expense\b/i, name: 'Visible' },
  { match: /monthly expense for IDX\b/i, name: 'IDX' },
  { match: /\bMULTIPLES\b/i, name: 'Multiples' },
  { match: /\bCincinnati Chamber\b/i, name: 'Cincinnati Chamber' },
  { match: /\bNKYCHAMBER\b/i, name: 'NKY Chamber' },

  // --- travel, food delivery and rides ---
  // No \b after DOORDASH: the feed glues the sub-brand on ("DD *DOORDASHDASHPASS").
  { match: /DOORDASH/i, name: 'DoorDash' },
  { match: /\bUBER EATS\b/i, name: 'Uber Eats' },
  { match: /\bUBER (?:TRIP|ONE)\b/i, name: 'Uber' },
  { match: /\bLYFT\b/i, name: 'Lyft' },
  { match: /\bEZCATER\b/i, name: 'ezCater' },
  { match: /\bDELTA VACATIONS\b/i, name: 'Delta Vacations' },
  { match: /\bDELTA AIR LIN/i, name: 'Delta Air Lines' },
  { match: /\bUNITED AIRLINES\b/i, name: 'United Airlines' },
  { match: /\bALLEGIANT AIR\b/i, name: 'Allegiant Air' },
  { match: /\bAIRCANADA\b/i, name: 'Air Canada' },
  { match: /\bSouthwest Air/i, name: 'Southwest Airlines' },
  { match: /\bHERTZ\b/i, name: 'Hertz' },
  { match: /\bDOUBLETREE\b/i, name: 'DoubleTree' },
  { match: /\bHILTON\b/i, name: 'Hilton' },
  { match: /\bAIRBNB\b/i, name: 'Airbnb' },
  { match: /\bABM ?(?:PARKING|Covington)/i, name: 'ABM Parking' },
  { match: /\bMETROPOLIS PARKING\b/i, name: 'Metropolis Parking' },
  { match: /\bGRAND TRAV/i, name: 'Grand Traverse Resort' },
  { match: /\bMOXY LONDON\b/i, name: 'Moxy London Excel' },
  { match: /\bPRIME IV\b/i, name: 'Prime IV Hydration' },

  // --- retail / restaurants seen under many store numbers and cities ---
  { match: /\bAMAZON\b/i, name: 'Amazon' },
  { match: /\bSAM'?S ?CLUB\b/i, name: "Sam's Club" },
  { match: /\bKROGER\b/i, name: 'Kroger' },
  { match: /\bWALGREENS\b/i, name: 'Walgreens' },
  { match: /\bDOLLAR ?TREE\b/i, name: 'Dollar Tree' },
  { match: /\bMCDONALD'?S\b/i, name: "McDonald's" },
  { match: /\bCHICK-FIL-A\b/i, name: 'Chick-fil-A' },
  { match: /\bWAFFLE HOUSE\b/i, name: 'Waffle House' },
  { match: /\bWENDY'?S\b(?!.*WENDAL)/i, name: "Wendy's" },
  { match: /\bJIMMY JOHNS\b/i, name: "Jimmy John's" },
  { match: /\bSTARBUCKS\b/i, name: 'Starbucks' },
  { match: /\bWHITE CASTLE\b/i, name: 'White Castle' },
  { match: /\bUSPS\b/i, name: 'USPS' },
  // Local venues whose descriptor arrives truncated or under two different store strings.
  { match: /\bBETTER BLEND\b|BETTER BFLORENCE/i, name: 'Better Blend' },
  { match: /\bGOODFELLAS\b/i, name: 'Goodfellas' },
  { match: /\bSMOKE ?JUSTIS\b/i, name: 'Smoke Justis' },
  { match: /\bMADRES MODERN MEXICA/i, name: 'Madres Modern Mexican' },

  // --- utilities and telecom ---
  { match: /\bVZW\b|\bVERIZON\b/i, name: 'Verizon' },
  { match: /^AT&T\b/i, name: 'AT&T' },
  { match: /^SPECTRUM\b/i, name: 'Spectrum' },
  { match: /\bALTAFIBER\b/i, name: 'Altafiber' },

  // --- insurance, payroll, banking and regulators (ACH strings, no card mask) ---
  { match: /\bAmeritas Life\b/i, name: 'Ameritas Life' },
  { match: /^CNA\s|\bCNA\s+ACH\b/i, name: 'CNA Insurance' },
  { match: /\bCHARLES SCHWAB\b/i, name: 'Charles Schwab' },
  // These are card-payment lines ("AMEX EPAYMENT ... ACH PMT"), so the counterparty is the card
  // issuer rather than whoever was actually paid. Named that way explicitly so nobody reads it
  // as a supplier in a spend analysis.
  { match: /^AMEX\b/i, name: 'American Express (card payment)' },
  { match: /^5-3 COMMRCL LN\b/i, name: 'Fifth Third Bank' },
  { match: /\bFINRA\b/i, name: 'FINRA' },
  { match: /\bCFP BD STDS\b/i, name: 'CFP Board' },
  { match: /\bKY-SEC OF STATE\b/i, name: 'Kentucky Secretary of State' },
  { match: /^KENTUCKY DOR/i, name: 'Kentucky Dept. of Revenue' },
  { match: /^OHIO BWC\b/i, name: 'Ohio BWC' },
  { match: /\bKAPLAN\b/i, name: 'Kaplan' },
  { match: /^Cintas\b/i, name: 'Cintas' },
  { match: /^KYLE RUSSELL\b/i, name: 'Kyle Russell' },
  // Intercompany payroll/fee runs, not third-party spend, but they are a real identifiable
  // counterparty string so the drill-down shows them rather than hiding them under "No vendor".
  { match: /^CONNETIC RIA\b/i, name: 'Connetic RIA LLC' },
  { match: /^WENDAL INC WENDAL\b/i, name: 'Wendal Inc. (payroll)' },
];

// Journal-entry memos are prose: "To update to fair market value" would parse to a vendor named
// "Fair Market Value". They only ever resolve through the alias list above.
const MEMO_SHAPE = /^to\s+(?:accrue|expense|exp|book|recognize|recognise|capture|move|update|adjust|reclass|depreciate|amortize|record|reverse|true)\b/i;

function titleCase(text) {
  // Mixed-case input already carries the vendor's own capitalisation ("Uber Trip", "Moxy
  // Cincinnati Down"); only ALL-CAPS bank text needs to be re-cased.
  if (/[a-z]/.test(text)) return text;
  return text
    .split(/\s+/)
    .map((word) => {
      const bare = word.replace(/[^A-Z]/g, '');
      if (CAPS_KEEP.has(bare)) return word;
      return word.replace(/\p{Lu}+/gu, (run, offset) =>
        offset === 0 ? run[0] + run.slice(1).toLowerCase() : run.toLowerCase());
    })
    .join(' ');
}

// Some rows carry a hand-typed note glued onto the descriptor with dashes
// ("SAM'S CLUB XXXX -snacks and drinks-XXXX1034"). Cut at the first dash whose remainder
// contains lowercase prose, but only if enough of a merchant name survives -- otherwise
// "KY-SEC OF STATE ... -Notary Filing" would be cut down to "KY".
function stripHandNote(text) {
  const parts = text.split('-');
  for (let i = 1; i < parts.length; i += 1) {
    const head = parts.slice(0, i).join('-');
    const tail = parts.slice(i).join('-');
    if (head.trim().length >= 5 && /[a-z]/.test(tail)) return head;
  }
  return text;
}

function parseDescriptor(raw) {
  let text = stripHandNote(raw);
  text = text.replace(/\s*\bhttps?:\/\/\S+/gi, '');
  text = text.replace(/\s+\S*\.(?:com|org|net|ai|io|uk|gov)(?:\/\S*)?/gi, '');
  text = text.replace(/\s+XXX-XXX-?[\dX]+/gi, '');
  for (let i = 0; i < 3 && MASK_TOKEN.test(text); i += 1) text = text.replace(MASK_TOKEN, '');
  text = text.replace(STATE_TAIL, '');
  const withoutCity = text.replace(CITY_TAIL, '');
  if (withoutCity.trim()) text = withoutCity;
  // The city sat between the merchant and the mask, so more mask and store-number junk can
  // surface once it is gone ("TST* LIBBYS XXXX0722COVINGTON KY XXXX1042" -> "TST* LIBBYS
  // XXXX0722", "ACE PARKING XXX2 500CINCINNATI OH ..." -> "ACE PARKING XXX2 500"). They
  // alternate, so peel them in one loop rather than in two passes.
  for (let i = 0; i < 4; i += 1) {
    const before = text;
    text = text.replace(MASK_TOKEN, '').replace(STORE_NUMBER, '');
    if (text === before) break;
  }
  // Processor prefixes nest ("AplPay TST* ...", "BT*DD *DOORDASH ..."), so peel repeatedly.
  for (let i = 0; i < 3 && PROCESSOR_PREFIX.test(text); i += 1) text = text.replace(PROCESSOR_PREFIX, '');
  text = text.replace(/^WWW\./i, '').replace(/\.(?:com|org|net|ai|io)\b/gi, '');
  text = text.replace(/[\s*,#&:.-]+$/, '').replace(/^[\s*#-]+/, '').trim();
  // A short remnant, or a bare article/suffix, is truncation debris rather than a merchant.
  if (text.length < 3 || NOT_A_VENDOR.test(text)) return null;
  // When the merchant name is clipped entirely, what survives is the head of the city that was
  // glued onto it ("CINCINCINCINNATI OH XXXX1042" leaves "CINCIN"). That is the city, not a
  // vendor, so it belongs in No vendor rather than in a bucket of its own.
  const bare = text.toUpperCase();
  if (CITIES.some((city) => city !== bare && city.startsWith(bare))) return null;
  return titleCase(text);
}

export function deriveVendor(txnName, description) {
  const named = String(txnName ?? '').trim();
  if (named) return named;

  const desc = String(description ?? '').trim();
  if (!desc) return null;

  for (const alias of ALIASES) {
    if (alias.match.test(desc)) return alias.name;
  }

  if (MEMO_SHAPE.test(desc)) return null;
  if (!CARD_MASK.test(desc)) return null;

  return parseDescriptor(desc);
}
