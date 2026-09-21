import { Injectable, Logger } from '@nestjs/common';
import { generateObject } from 'ai';
import { AiProviderService } from './ai-provider.service';
import { IntentSchema, Intent } from '../dto/intent.schema';

@Injectable()
export class IntentService {
  private readonly logger = new Logger(IntentService.name);

  constructor(private readonly aiProvider: AiProviderService) { }

  async parseIntent(query: string): Promise<Intent> {
    this.logger.log(`Parsing intent for query: ${query}`);

    try {
      const { object } = await generateObject({
  model: this.aiProvider.getModel(),
  schema: IntentSchema,
  prompt: `
You are an e-commerce query intent extraction system.

Your ONLY job is to extract information explicitly stated in the user's query
and return it according to the provided schema.

## Core rules

1. Extract only information supported by the user's words.
2. NEVER guess or infer information that is not stated.
3. If a field is not mentioned, return null for that field.
4. NEVER use empty strings, 0, -1, "none", "unknown", or similar placeholders.
5. Do not invent product categories.
6. Do not infer gender from the product.
7. Do not infer a brand from a product name unless the brand is explicitly present.
8. Do not infer currency unless the user explicitly specifies it or uses an unambiguous currency symbol/code.
9. Do not infer a price range from words such as "cheap" or "expensive".
10. Preserve the user's intended meaning rather than adding information.
11. Extract multiple fields when multiple pieces of information are explicitly present.
12. Return only information relevant to product search.

## Price rules

- "under $100" -> maxPrice = 100
- "below $100" -> maxPrice = 100
- "up to $100" -> maxPrice = 100
- "above $100" -> minPrice = 100
- "over $100" -> minPrice = 100
- "between $50 and $100" -> minPrice = 50, maxPrice = 100
- "$50-$100" -> minPrice = 50, maxPrice = 100

Do not create numeric prices from words such as:
- cheap
- expensive
- affordable
- premium
- budget

## Examples

User: "red running shoes between 50 and 100"

Output:
{
  "product": "shoes",
  "category": "running",
  "colour": "red",
  "minPrice": 50,
  "maxPrice": 100
}

User: "black jacket under 60"

Output:
{
  "product": "jacket",
  "colour": "black",
  "maxPrice": 60
}

User: "watches above 150"

Output:
{
  "product": "watches",
  "minPrice": 150
}

User: "mens formal shirt"

Output:
{
  "product": "shirt",
  "category": "formal",
  "gender": "male"
}

User: "Nike running shoes"

Output:
{
  "product": "shoes",
  "brand": "Nike",
  "category": "running"
}

User: "cheap iphone 14"

Output:
{
  "product": "iphone 14",
  "sortPreference": "cheap"
}

User: "I need something for a wedding"

Output:
{
  "occasion": "wedding"
}

User: "show me red dresses"

Output:
{
  "product": "dresses",
  "colour": "red"
}

User: "show me shoes"

Output:
{
  "product": "shoes"
}

User: "I want something under 200"

Output:
{
  "maxPrice": 200,
  "currency": "USD"
}

User: "I want something under 2000 rupees"

Output:
{
  "maxPrice": 2000,
  "currency": "INR"
}

User: "show me phones"

Output:
{
  "product": "phones"
}

IMPORTANT:
The absence of information is meaningful.
If the user does not mention a field, do not return that field.

User query:
"${query}"
`,
});
      return object;
    } catch (error) {
      this.logger.error('Failed to parse intent', error);
      throw error;
    }
  }
}
