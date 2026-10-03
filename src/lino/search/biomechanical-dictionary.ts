export interface BiomechanicalMapping {
  displayName: string;
  searchTokens: string[];
  impliedDatabaseFilters: {
    category?: 'running' | 'training' | 'basketball' | 'lifestyle' | 'outdoor';
    cushionLevel?: 'maximum' | 'balanced' | 'responsive';
    supportType?: 'stability' | 'neutral';
    soleType?: 'flat_stiff' | 'flexible' | 'rocker';
    heelToToeDrop?: 'high' | 'low' | 'zero';
    upperMaterial?: 'mesh' | 'waterproof' | 'knit' | 'leather';
  };
}

export const SNEAKER_BIOMECHANICAL_DICTIONARY: Record<string, BiomechanicalMapping> = {
  PLANTAR_FASCIITIS: {
    displayName: 'Plantar Fasciitis Support',
    searchTokens: ['plantar', 'fasciitis', 'heel pain', 'sore heels', 'heel spur', 'arch pain'],
    impliedDatabaseFilters: {
      cushionLevel: 'maximum',
      supportType: 'stability',
      heelToToeDrop: 'high',
    },
  },
  OVERPRONATION: {
    displayName: 'Stability & Arch Support',
    searchTokens: ['flat feet', 'overpronation', 'collapsed arches', 'fallen arches', 'ankles rolling in', 'low arch'],
    impliedDatabaseFilters: {
      supportType: 'stability',
    },
  },
  BAD_KNEES: {
    displayName: 'Maximum Impact Absorption',
    searchTokens: ['bad knees', 'joint pain', 'knee arthritis', 'back pain', 'shin splints', 'heavy runner'],
    impliedDatabaseFilters: {
      cushionLevel: 'maximum',
      soleType: 'rocker',
    },
  },
  ALL_DAY_STANDING: {
    displayName: 'All-Day Comfort',
    searchTokens: ['standing all day', 'nursing shoes', 'retail work', 'walking concrete', 'walking all day', 'server shoes'],
    impliedDatabaseFilters: {
      cushionLevel: 'maximum',
      supportType: 'neutral',
    },
  },
  SUPINATION: {
    displayName: 'Neutral High-Arch Cushioning',
    searchTokens: ['supination', 'underpronation', 'high arches', 'ankles rolling out', 'rigid feet'],
    impliedDatabaseFilters: {
      cushionLevel: 'maximum',
      supportType: 'neutral',
    },
  },
  CROSSFIT_FUNCTIONAL: {
    displayName: 'Cross-Training & CrossFit',
    searchTokens: ['crossfit', 'hiit', 'f45', 'functional training', 'gym workout', 'aerobics'],
    impliedDatabaseFilters: {
      category: 'training',
      soleType: 'flat_stiff',
      cushionLevel: 'responsive',
    },
  },
  HEAVY_LIFTING: {
    displayName: 'Powerlifting & Weightlifting',
    searchTokens: ['heavy lifting', 'deadlift', 'squat', 'powerlifting', 'weightlifting', 'flat sole'],
    impliedDatabaseFilters: {
      category: 'training',
      soleType: 'flat_stiff',
      heelToToeDrop: 'zero',
    },
  },
  ANARCH_COURT_SUPPORT: {
    displayName: 'High-Ankle Ankle Support',
    searchTokens: ['ankle support', 'weak ankles', 'ankle sprain', 'high top basketball', 'ankle brace'],
    impliedDatabaseFilters: {
      category: 'basketball',
    },
  },
  MARATHON_RACING: {
    displayName: 'Marathon & Long Distance Racing',
    searchTokens: ['marathon', 'half marathon', 'race day', 'carbon plate', 'super shoe', 'tempo run'],
    impliedDatabaseFilters: {
      category: 'running',
      cushionLevel: 'maximum',
      soleType: 'rocker',
    },
  },
  DAILY_MILEAGE: {
    displayName: 'Daily Running Trainer',
    searchTokens: ['daily runner', 'jogging', 'couch to 5k', 'morning run', 'treadmill running'],
    impliedDatabaseFilters: {
      category: 'running',
      cushionLevel: 'balanced',
      supportType: 'neutral',
    },
  },
  TRAIL_OR_MUD: {
    displayName: 'Trail Running & Rugged Terrain',
    searchTokens: ['trail running', 'hiking sneakers', 'muddy trail', 'off road', 'gorpcore', 'mountain running'],
    impliedDatabaseFilters: {
      category: 'outdoor',
      upperMaterial: 'waterproof',
    },
  },
};

export const BIOMECHANICAL_SUMMARY = Object.entries(SNEAKER_BIOMECHANICAL_DICTIONARY).map(([id, mapping]) => ({
  id,
  displayName: mapping.displayName,
  searchTokens: mapping.searchTokens,
  impliedDatabaseFilters: mapping.impliedDatabaseFilters,
}));
