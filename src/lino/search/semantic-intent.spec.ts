import { buildSemanticContext, evaluateSemanticIntent, extractSemanticIntent } from './semantic-intent';

describe('semantic intent helpers', () => {
  it('extracts the core shopping intent from a natural language query', () => {
    const result = extractSemanticIntent('Looking for black Nike running shoes under $120 for a gym session');

    expect(result).toMatchObject({
      colour: 'black',
      brand: 'Nike',
      category: 'Running',
      maxPrice: 120,
      occasion: 'gym',
    });
  });

  it('keeps confidence high when the query contains strong semantic signals', () => {
    const evalResult = evaluateSemanticIntent('I need clean white sneakers for a wedding under 90', {
      colour: 'white',
      category: 'Sneakers',
      occasion: 'wedding',
      maxPrice: 90,
    });

    expect(evalResult.confidence).toBeGreaterThan(0.7);
    expect(evalResult.coverage).toBeGreaterThan(0.5);
    expect(evalResult.reasons.length).toBeGreaterThan(0);
  });

  it('builds a semantic prompt block that preserves query and intent context', () => {
    const context = buildSemanticContext('show me black sneakers under 100', { brand: 'Adidas' });

    expect(context.intent).toMatchObject({
      brand: 'Adidas',
      colour: 'black',
      category: 'Sneakers',
      maxPrice: 100,
    });
    expect(context.prompt).toContain('SEMANTIC INTENT');
    expect(context.prompt).toContain('black');
  });
});
