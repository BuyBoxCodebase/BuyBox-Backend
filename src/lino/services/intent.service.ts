import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { IntentSchema, Intent } from '../dto/intent.schema';

@Injectable()
export class IntentService implements OnModuleInit {
  private readonly logger = new Logger(IntentService.name);
  private ai: any;

  constructor(private readonly aiProvider: AiProviderService) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  async parseIntent(query: string): Promise<Intent | null> {
    const { generateObject } = this.ai;

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
3. If a field is not explicitly mentioned, you MUST return null for that field.
4. NEVER use placeholders like "not mentioned", "none", "unknown", "N/A", empty strings, 0, or -1. Return null instead.
5. ONLY use one of the available categories: "Sneakers", "Training", "Lifestyle", "Basketball", "Running". Do not invent product categories.
6. Do not infer gender from the product.
7. Do not infer a brand from a product name unless the brand is explicitly present.
8. Do not infer currency unless the user explicitly specifies it or uses an unambiguous currency symbol/code.
9. Do not infer a price range from words such as "cheap" or "expensive".
10. Preserve the user's intended meaning rather than adding information.
11. Extract multiple fields when multiple pieces of information are explicitly present.
12. Return only information relevant to product search.
13. NEVER "think out loud", explain your reasoning, or include conversational text inside the JSON values. The JSON values must contain ONLY the exact extracted string or number.

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
  "category": "Running",
  "colour": "red",
  "minPrice": 50,
  "maxPrice": 100
}

User: "black jacket under 60"

Output:
{
  "colour": "black",
  "maxPrice": 60
}

User: "watches above 150"

Output:
{
  "minPrice": 150
}

User: "mens basketball shoes"

Output:
{
  "category": "Basketball",
  "gender": "male"
}

User: "Nike running shoes"

Output:
{
  "brand": "Nike",
  "category": "Running"
}

User: "cheap iphone 14"

Output:
{
  "productName": "iphone 14",
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
  "colour": "red"
}

User: "show me shoes"

Output:
{
  "category": "Sneakers"
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

User: "show me training gear"

Output:
{
  "category": "Training"
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
