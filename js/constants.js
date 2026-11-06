// Vaste lijsten en standaardwaarden.

export const STATUSES = [
  ['open', 'Open'],
  ['gereed', 'Gereed'],
  ['akkoord', 'Akkoord'],
];
export const STATUS_LABEL = Object.fromEntries(STATUSES);
export const STATUS_UITLEG = {
  open: 'Nog niet hersteld',
  gereed: 'Hersteld gemeld door uitvoerende partij',
  akkoord: 'Gecontroleerd en goedgekeurd',
};

export const OPNAME_TYPES = [
  'Vooropname',
  'Tussentijdse opname',
  'Eindopname',
  'Heropname',
  'Opname einde onderhoudstermijn',
];

export const RAPPORT_TITELS = {
  'Vooropname': 'Rapport vooropname',
  'Tussentijdse opname': 'Rapport tussentijdse opname',
  'Eindopname': 'Proces-verbaal van oplevering',
  'Heropname': 'Rapport heropname',
  'Opname einde onderhoudstermijn': 'Rapport einde onderhoudstermijn',
};

export const CATEGORIEEN = [
  'Beschadiging',
  'Afwerking',
  'Ontbreekt',
  'Niet volgens tekening/bestek',
  'Vervuiling',
  'Werking/functie',
  'Brandveiligheid',
  'Overig',
];

export const PRIORITEITEN = [
  ['laag', 'Laag'],
  ['normaal', 'Normaal'],
  ['hoog', 'Hoog'],
];
export const PRIO_LABEL = Object.fromEntries(PRIORITEITEN);

export const DEFAULT_SETTINGS = {
  id: 'app',
  bedrijf: '',
  inspecteur: '',
  voettekst: '',
  logo: null,
  verklaring:
    'Partijen verklaren dat het werk op bovengenoemde datum gezamenlijk is opgenomen. ' +
    'De in dit verslag genoemde punten worden door de verantwoordelijke partij binnen de afgesproken termijn hersteld.',
  verantwoordelijken: [
    'Hoofdaannemer',
    'Installateur E',
    'Installateur W',
    'Schilder',
    'Afbouw/plafonds',
    'Vloerenlegger',
    'Gevelbouwer',
    'Dakdekker',
    'Liftleverancier',
    'Terreininrichting',
    'Opdrachtgever',
  ],
  snelteksten: [
    'Beschadiging',
    'Kras',
    'Deuk',
    'Lakschade',
    'Ontbreekt',
    'Niet afgewerkt',
    'Schilderwerk bijwerken',
    'Kitvoeg ontbreekt',
    'Vervuild, reinigen',
    'Plafondplaat beschadigd',
    'Afdekplaat ontbreekt',
    'Lekkage',
    'Werkt niet',
    'Scheur',
    'Niet volgens tekening',
  ],
  voorbeeldGeladen: false,
};
