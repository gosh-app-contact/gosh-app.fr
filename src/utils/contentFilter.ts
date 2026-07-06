const BANNED_WORDS: string[] = [
  // ── Insultes françaises ──────────────────────────────────────────────────────
  'connard', 'connarde', 'connards', 'connardes',
  'con', 'conne', 'cons', 'connes',
  'salope', 'salopes', 'salopard', 'salopards', 'saloperie',
  'pute', 'putes', 'putain', 'putains',
  'enculé', 'enculée', 'enculés', 'encule', 'enculer',
  'fdp', 'fils de pute', 'fille de pute',
  'bâtard', 'batard', 'bâtards', 'batards',
  'merde', 'merdes', 'emmerdeur', 'emmerdeuse',
  'couille', 'couilles', 'couillon', 'couillonne',
  'nique', 'niquer', 'niqué', 'niquée', 'nique ta mère', 'ntm', 'nique ta mere',
  'va te faire', 'va te faire foutre', 'vtff',
  'cul', 'trou du cul', 'trouduc', 'trouduc',
  'bite', 'bites', 'grosse bite',
  'chatte', 'chattes',
  'pénis', 'penis', 'vagin', 'vulve',
  'branleur', 'branleuse', 'branler', 'branlette',
  'baiser', 'baise', 'baisé', 'baisée', 'baiseur', 'baiseuse',
  'sucer', 'suce', 'suceur', 'suceuse',
  'fellation', 'cunnilingus', 'sodomie', 'sodomiser',
  'abruti', 'abrutie', 'abrutils',
  'attardé', 'attardée', 'retardé', 'retardée',
  'idiot', 'idiote', 'idiocy',
  'imbécile', 'imbecile', 'imbéciles',
  'crétin', 'crétine', 'cretins',
  'débile', 'débiles',
  'bouffon', 'bouffonne', 'bouffons',
  'nabot', 'nabots',
  'tocard', 'tocarde',
  'raclure', 'raclures',
  'ordure', 'ordures',
  'déchet', 'déchets',
  'lâche', 'lache',
  'traître', 'traitre', 'traîtresse',
  'porc', 'porcs',
  'espèce de', 'sale',
  'va mourir', 'crève', 'tu vas crever', 'je te tue', 'je vais te tuer',
  'mort', 'mourir', 'suicide', 'suicider', 'te suicider',
  'ferme ta gueule', 'ta gueule', 'tg', 'ferme ta bouche',
  'dégage', 'casse-toi', 'cassez-vous', 'barre-toi',

  // ── Racisme / Discrimination ─────────────────────────────────────────────────
  'nègre', 'negre', 'nègres', 'negres',
  'negro', 'negros',
  'bamboula', 'bamboulas',
  'bougnoule', 'bougnoules',
  'bicot', 'bicots',
  'raton', 'ratons',
  'youpin', 'youpins', 'youpin',
  'feuj', 'feujs',
  'sale arabe', 'sale noir', 'sale juif', 'sale blanc',
  'chinetoque', 'chinetoques',
  'bridé', 'bridée', 'bridés',
  'bounty', 'bounties',
  'caillera',
  'raciste', 'racism', 'nazi', 'nazisme', 'nazis',
  'antisémite', 'antisemite', 'antisémitisme',
  'islamophobe', 'islamophobie',
  'xénophobe', 'xenophobe', 'xénophobie',
  'homophobe', 'homophobie',
  'pédé', 'pede', 'pédés', 'pedes',
  'tapette', 'tapettes', 'fiotte', 'fiottes',
  'gouine', 'gouines',
  'travelo', 'travelos',
  'transphobe', 'transphobie',
  'sale gay', 'sale homo', 'sale lesbienne',
  'white power', 'heil hitler', 'sieg heil',
  '88', 'ku klux klan', 'kkk',
  'suprémaciste', 'supremaciste',

  // ── Menaces / Violence ───────────────────────────────────────────────────────
  'je vais te frapper', 'je vais te casser la gueule',
  'je vais te défoncer', 'je vais te massacrer',
  'je vais te butter', 'je vais te niquer',
  'tu vas morfler', 'tu vas prendre', 'tu vas regretter',
  'tabasser', 'défoncer', 'massacrer', 'butter',
  'couteau', 'flingue', 'arme',
  'attentat', 'terroriste', 'terrorisme', 'bombe',
  'viol', 'violer', 'violeur', 'violeuse',
  'pédophile', 'pedophile', 'pédophilie', 'pedophilie',
  'inceste', 'incestueux',

  // ── Contenu adulte explicite ─────────────────────────────────────────────────
  'porn', 'porno', 'pornographie', 'xxx',
  'sexe', 'sexuel', 'sexuelle',
  'nude', 'nudes', 'nu', 'nue',
  'érotique', 'erotique',
  'masturbation', 'masturber', 'se masturber',
  'orgasme', 'jouir', 'éjaculer', 'ejaculer', 'éjaculation',
  'strip', 'striptease', 'strip-tease',
  'escorte', 'escort', 'prostitué', 'prostituée', 'prostitution',
  'partouze', 'orgie',
  'cougar', 'milf',
  'gangbang', 'threesome',
  'bdsm', 'bondage',
  'fétiche', 'fetiche', 'fétichisme',

  // ── Drogues / Substances ─────────────────────────────────────────────────────
  'cocaïne', 'cocaine', 'coke',
  'héroïne', 'heroine', 'hero',
  'crack', 'crystal meth', 'meth',
  'ecstasy', 'mdma', 'molly',
  'kétamine', 'ketamine', 'ket',
  'lsd', 'acide',
  'opium', 'opioïde', 'opioide',
  'fentanyl',
  'dealer', 'deal', 'deale',
  'shit', 'beuh', 'weed', 'cannabis', 'joint', 'spliff', 'pétard',
  'acheter de la drogue', 'vendre de la drogue',
  'se piquer', 'se shooter', 'sniffer',

  // ── Harcèlement / Humiliation ────────────────────────────────────────────────
  'harcèlement', 'harcelement', 'harceler',
  'cyberharcèlement', 'cyberharcelement',
  'humilier', 'humiliation',
  'doxing', 'doxxing',
  'fake account', 'faux compte', 'usurpation',
  'blackmail', 'chantage',
  'menacer', 'menaçant', 'menace',

  // ── Insultes anglaises ───────────────────────────────────────────────────────
  'fuck', 'fucker', 'fucked', 'fucking', 'fucks',
  'shit', 'bullshit',
  'bitch', 'bitches',
  'asshole', 'assholes',
  'bastard', 'bastards',
  'cunt', 'cunts',
  'dick', 'dicks',
  'cock', 'cocks',
  'pussy', 'pussies',
  'whore', 'whores',
  'slut', 'sluts',
  'motherfucker', 'mf',
  'nigger', 'niggers', 'nigga', 'niggas',
  'faggot', 'faggots', 'fag', 'fags',
  'retard', 'retards',
  'idiot', 'idiots',
  'moron', 'morons',
  'loser', 'losers',
  'kill yourself', 'kys',
  'go die', 'die',
  'hate you', 'i hate you',
  'rape', 'rapist', 'raping',
  'pedophile', 'pedophilia',
  'terrorist', 'terrorism',

  // ── Spam / Arnaque ───────────────────────────────────────────────────────────
  'arnaque', 'arnaquer', 'arnaqueur',
  'scam', 'scammer',
  'clique ici', 'click here',
  'gagner de l\'argent', 'argent facile',
  'investissement garanti', 'rendement garanti',
  'crypto', 'bitcoin', 'nft',
  'onlyfans', 'only fans',
];

// Mapping des homoglyphes Cyrillique/Grec → Latin (contournement Unicode)
const HOMOGLYPHS: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x',
  'і': 'i', 'ї': 'i', 'ё': 'e', 'ѕ': 's', 'ј': 'j', 'ԁ': 'd',
  'α': 'a', 'β': 'b', 'ε': 'e', 'η': 'n', 'ι': 'i', 'κ': 'k',
  'ν': 'n', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x',
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's',
};

function replaceHomoglyphs(text: string): string {
  return text.split('').map((c) => HOMOGLYPHS[c] ?? c).join('');
}

// Normalise le texte pour détecter les variantes (é→e, accents, homoglyphes, espaces)
function normalize(text: string): string {
  return replaceHomoglyphs(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ');
}

export function containsBannedWord(text: string): string | null {
  const normalized = normalize(text);
  for (const word of BANNED_WORDS) {
    const normalizedWord = normalize(word);
    // Cherche le mot comme mot entier ou sous-chaîne
    const regex = new RegExp(`(^|\\s)${normalizedWord.replace(/\s+/g, '\\s+')}(\\s|$)`, 'i');
    if (regex.test(normalized)) return word;
  }
  return null;
}

export function filterContent(text: string): { allowed: boolean; bannedWord?: string } {
  const found = containsBannedWord(text);
  if (found) return { allowed: false, bannedWord: found };
  return { allowed: true };
}
