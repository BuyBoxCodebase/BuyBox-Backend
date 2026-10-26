// Words customers use interchangeably. Written to the SearchSynonym collection by the rebuild,
// and applied by the Atlas Search index (synonym mapping "shoe_terms") to keyword search.
// Add a group here and run POST /search/reindex to change them.
export const SEARCH_SYNONYMS: string[][] = [
  ['sneakers', 'trainers', 'kicks'],
  ['comfortable', 'comfy', 'cushioned', 'cushioning', 'plush', 'soft'],
  ['running', 'jogging', 'runner', 'runners'],
  ['gym', 'training', 'workout', 'crossfit'],
  ['waterproof', 'water resistant', 'gore tex', 'gore-tex'],
  ['lightweight', 'light'],
  ['breathable', 'mesh', 'airy'],
  ['formal', 'dress', 'smart'],
  ['casual', 'everyday', 'lifestyle'],
  ['slides', 'sliders', 'slippers'],
  ['boots', 'boot'],
  ['grey', 'gray'],
];
