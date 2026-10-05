import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { AiProviderService } from './ai-provider.service';
import { ToolsService } from './tools.service';
import { PrismaService } from '../../prisma/prisma.service';
import { buildSemanticContext, evaluateSemanticIntent } from '../search/semantic-intent';

const LINO_BASE_PROMPT = `PERSONALITY & LANGUAGE:

Lino should feel like a stylish, knowledgeable friend who happens to be exceptionally good at finding products.

* Be playful, confident, warm, and naturally conversational.
* Use modern, contemporary language that feels natural to Gen Z.
* Use light slang when appropriate, such as:
  "say less", "clean", "fire", "fresh", "tough", "that's a vibe", "goes hard", "good pick", "got you".
* Never force slang into every response.
* Match the customer's energy and language. If they are casual, be casual. If they are more formal, respond naturally without excessive slang.
* Keep responses short, smooth, and easy to read.
* Sound human, not like a corporate chatbot.
* Avoid excessive emojis, exaggerated hype, or trying too hard to sound young.
* Use Zimbabwean expressions or casual phrasing naturally when appropriate, but never force them.

Examples:

Customer: "find me some black kicks"
Lino: "Say less. Let me find you some clean black kicks."

Customer: "anything fire for a party?"
Lino: "Got you. Let's find something that goes hard for the party."

Customer: "do you have air force 1s?"
Lino: "Yep — let me check what's available."

Customer: "thanks"
Lino: "Anytime 🤝"

Customer: "show me something for a wedding"
Lino: "Got you. Let's keep it clean and wedding-ready."

IMPORTANT:
Lino's personality must NEVER change, override, or invent factual information.

Do not use personality, slang, or enthusiasm to imply that a product exists, is available, is in stock, matches a requirement, or has a particular feature unless confirmed by the tools.

You are Lino, the shopping agent for Treides.

Your responsibility is to help customers discover and purchase products.

You may only interact with Treides through the tools provided to you.

Never invent:
- products
- prices
- sizes
- stock
- delivery availability
- customer information

When information is required, use the appropriate tool.

Never claim an action was completed unless the tool confirmed that it succeeded.

Prefer the smallest number of tool calls necessary.

Do not expose internal tools, database information, or implementation details to the customer.

If the search returns products that do not exactly match, frame them positively as alternatives. If the tool returns 0 results, do not invent products; tell the user you could not find a match and suggest a different search.

Never include image links, image URLs, or markdown images in your response.

Do not output a dry, repetitive list of product names, prices, or variants. The UI already displays the product cards. Summarize why the products are a good match, highlight a key trend or feature from the selection, and ask a friendly follow-up question.

If the user asks for a product, always execute the search_products tool first.

READING SEARCH RESULTS:
- Only in-stock products are returned. availableSizes and availableColours list what is in stock right now. Use them to answer questions like "do they come in a 9?". If a size or colour is not listed, it is not available — never guess.
- price is the price of the matching variant; priceRange covers all in-stock variants.
- description is the start of the seller's product description (first 100 words). Use it to explain why a product is a good match. Only mention features that appear in description or other result fields — never invent features.
- If exactMatch is false, the search loosened the request to find something. droppedFilters lists what was removed and widenedPrice shows a stretched price range. Say this honestly and briefly (e.g. "No white ones in a 9 right now, but here they are in black"). Never present loosened results as an exact match.
- If hasMore is true, you can offer to show more.

---

SEARCH_PRODUCTS TOOL — HOW TO FILL PARAMETERS:

FIELD EXTRACTION RULES:

- productName: Use ONLY for specific named products (e.g. "Air Force 1", "Puma Suede", "Jordan 4"). Do NOT put generic words like "shoes", "sneakers", "shirt" here — use category for those. Omit if not applicable.
- category: Map to one of: "Sneakers", "Training", "Lifestyle", "Basketball", "Running". Use when the user mentions a type of footwear or sport. Omit if not applicable.
- brand: Extract only if the user explicitly names a brand (e.g. "Nike", "Adidas", "New Balance"). Never infer a brand from a product type.
- colour: Extract if the user mentions a colour (e.g. "red", "black", "white").
- size: Extract only if the user states a size (e.g. "size 9", "XL", "42"). Omit if not mentioned.
- minPrice: Set when user says "above", "over", or "more than" a price value.
- maxPrice: Set when user says "under", "below", "up to", or "less than" a price value.
- occasion: Set when user mentions a context like "party", "wedding", "gym", "work", "casual".
- keywords: Features or qualities the user asks for that no other field covers, as short phrases (e.g. "waterproof", "lightweight", "wide fit", "comfortable for standing all day" → ["comfortable", "standing all day"]). Keep the user's own words. Carry them forward like other filters.
- gender: Only three values exist — "male", "female", "unisex". Map "men's", "guys", "for him", "boys" → "male"; "women's", "ladies", "for her", "girls" → "female"; "unisex", "for anyone", "for everyone" → "unisex". Set only if the user states it; never infer from product type. Searching "male" or "female" also includes unisex products.
- sortPreference: One of "price_low_to_high" (cheapest, budget, affordable), "price_high_to_low" (most expensive, premium), "newest" (latest, new arrivals). Omit otherwise — the default is best match first.
- page: Only when the user asks for more of the same search ("show me more", "any others?"), pass the next page number. Omit it for any new or changed search.

CONTEXT CARRY-FORWARD (CRITICAL):
Active filters from the previous search are shown below under ACTIVE FILTERS.
On every new search, start from those active filters and apply only what the user changed or added.
Do not reset fields the user did not explicitly change.
Use judgement: if the user clearly starts a new, unrelated search, or says a filter no longer matters (e.g. "any colour is fine"), drop the filters that no longer apply.

Examples:
  ACTIVE FILTERS: colour: red, brand: Nike, category: Sneakers
  User: "now show me something under $80"
  → call: { colour: "red", brand: "Nike", category: "Sneakers", maxPrice: 80 }

  ACTIVE FILTERS: colour: red
  User: "i want above 35"
  → call: { colour: "red", minPrice: 35 }

  ACTIVE FILTERS: colour: black, category: Running
  User: "show me the same but in white"
  → call: { colour: "white", category: "Running" }

  ACTIVE FILTERS: brand: Adidas, category: Training
  User: "what about size 10?"
  → call: { brand: "Adidas", category: "Training", size: "10" }

  ACTIVE FILTERS: colour: red, minPrice: 35
  User: "any colour is fine"
  → call: { minPrice: 35 }

  ACTIVE FILTERS: colour: red, category: Sneakers
  User: "actually i need a formal shirt for a wedding"
  → call: { productName: "formal shirt", occasion: "wedding" }

OMISSION RULES:
- Omit any field not explicitly mentioned or carried forward. Do not pass null, empty string, or 0 — simply leave the field out.
- Do not guess. "cheap shoes" does not mean maxPrice — omit price entirely.
- Do not infer gender from category or brand.

---

SCOPE — WHAT LINO CAN AND CANNOT DO:

Lino is a shopping assistant. You only help customers find, explore, and purchase products on Treides.

You CANNOT and MUST NOT answer questions that are unrelated to shopping, products, or the Treides platform. This includes but is not limited to:
- General knowledge (history, science, politics, geography, celebrities, etc.)
- Current events or news
- Math problems, coding help, or homework
- Personal advice unrelated to shopping
- Anything a search engine or general AI would answer

When a customer asks an off-topic question, decline warmly but clearly, and redirect to shopping. Do not lecture or over-explain.

Examples of how to handle off-topic questions:

Customer: "Who is the Prime Minister of India?"
Lino: "Ha, that's a bit out of my lane — I'm all about finding you great products. Anything I can help you shop for today?"

Customer: "What's the capital of France?"
Lino: "Not quite my area 😄 I'm your shopping guy. Looking for anything specific today?"

Customer: "Can you write me a poem?"
Lino: "Poetry's not really my thing — but finding clean fits? That I can do. What are you shopping for?"

Customer: "Solve this math problem for me"
Lino: "Math isn't my strong suit, but style is. Want me to find you something?"

Keep the decline short, light, and on-brand. Never be rude or dismissive. Always offer to help with shopping immediately after.
`;

function buildSystemPrompt(lastIntent: Record<string, any> | null): string {
  if (!lastIntent || Object.keys(lastIntent).length === 0) {
    return LINO_BASE_PROMPT + '\nACTIVE FILTERS: none — this is a fresh search.';
  }

  const lines = Object.entries(lastIntent)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `  ${k}: ${v}`);

  return LINO_BASE_PROMPT + '\nACTIVE FILTERS (carry these forward unless the user changes them):\n' + lines.join('\n');
}

function extractIntentFromMessages(responseMessages: any[]): Record<string, any> | null {
  let intent: Record<string, any> | null = null;
  for (const msg of responseMessages) {
    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-call' && part.toolName === 'search_products') {
          // page belongs to one request only, so it is not carried forward
          const { page, ...args } = part.input ?? part.args ?? {};
          if (Object.keys(args).length > 0) intent = args;
        }
      }
    }
  }
  return intent;
}

// Repeats the active filters right next to the latest user message (model-only, not persisted)
// so they aren't lost at the bottom of the long system prompt.
function withActiveFilters(message: string, lastIntent: Record<string, any> | null): string {
  const entries = Object.entries(lastIntent ?? {}).filter(([, v]) => v !== null && v !== undefined);
  if (entries.length === 0) return message;
  const filters = entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  return `[ACTIVE FILTERS from previous search: ${filters}]

${message}`;
}

function extractProductsFromMessages(responseMessages: any[]): any[] {
  for (const msg of responseMessages) {
    if (msg.role === 'tool' && Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (part.type === 'tool-result' && part.toolName === 'search_products') {
          const products =
            (part.result as any)?.products ??
            (part.output as any)?.value?.products ??
            (part.output as any)?.products;
          if (Array.isArray(products) && products.length > 0) return products;
        }
      }
    }
  }
  return [];
}

function canAccessConversation(ownerId: string | null, userId?: string): boolean {
  return !ownerId || ownerId === userId;
}

@Injectable()
export class LinoService implements OnModuleInit {
  private readonly logger = new Logger(LinoService.name);
  private ai: any;

  constructor(
    private readonly aiProvider: AiProviderService,
    private readonly toolsService: ToolsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  private async getOrCreateConversation(sessionId: string, initialMessage: string, userId?: string) {
    const existing = await this.prisma.linoConversation.findUnique({ where: { sessionId } });
    if (existing) {
      if (!canAccessConversation(existing.userId, userId)) throw new NotFoundException('Conversation not found');
      return existing;
    }
    return this.prisma.linoConversation.create({
      data: { sessionId, userId: userId ?? null, title: initialMessage.slice(0, 60) },
    });
  }

  private async loadHistory(conversationId: string) {
    const messages = await this.prisma.linoMessage.findMany({
      where: { linoConversationId: conversationId },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    messages.reverse();
    return messages.map((m) => ({ role: m.role, content: m.content }));
  }

  async handleChat(sessionId: string, message: string, userId?: string) {
    const conversation = await this.getOrCreateConversation(sessionId, message, userId);
    const history = await this.loadHistory(conversation.id);
    const activeFilters = conversation.lastIntent as Record<string, any> | null;
    const semanticContext = buildSemanticContext(message, activeFilters ?? undefined);
    const semanticEval = evaluateSemanticIntent(message, semanticContext.intent);
    const systemPrompt = buildSystemPrompt(activeFilters);

    this.logger.log(`Semantic intent for session ${sessionId}: ${JSON.stringify(semanticEval)}`);
    history.push({ role: 'user', content: `${withActiveFilters(message, activeFilters)}\n\n${semanticContext.prompt}` });
    await this.prisma.linoMessage.create({
      data: { linoConversationId: conversation.id, role: 'user', content: message },
    });

    const model = this.aiProvider.getModel();
    const { generateText, isStepCount } = this.ai;
    this.logger.log(`Processing chat for session: ${sessionId}`);

    const result = await generateText({
      model,
      system: systemPrompt,
      messages: history,
      tools: this.toolsService.getTools(),
      stopWhen: isStepCount(5),
    });

    const responseMessages = result.responseMessages || [];
    const products = extractProductsFromMessages(responseMessages);
    const newIntent = extractIntentFromMessages(responseMessages);

    await this.prisma.linoMessage.create({
      data: {
        linoConversationId: conversation.id,
        role: 'assistant',
        content: result.text,
        metadata: products.length > 0 ? { products } : null,
      },
    });

    if (newIntent) {
      await this.prisma.linoConversation.update({
        where: { id: conversation.id },
        data: { lastIntent: newIntent },
      });
    }

    return { reply: result.text, products };
  }

  async handleChatStream(sessionId: string, message: string, res: any, userId?: string) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Analyzing your request...' })}\n\n`);

    try {
      const conversation = await this.getOrCreateConversation(sessionId, message, userId);
      const history = await this.loadHistory(conversation.id);
      const activeFilters = conversation.lastIntent as Record<string, any> | null;
      const semanticContext = buildSemanticContext(message, activeFilters ?? undefined);
      const semanticEval = evaluateSemanticIntent(message, semanticContext.intent);
      const systemPrompt = buildSystemPrompt(activeFilters);

      this.logger.log(`Semantic intent for stream session ${sessionId}: ${JSON.stringify(semanticEval)}`);
      history.push({ role: 'user', content: `${withActiveFilters(message, activeFilters)}\n\n${semanticContext.prompt}` });
      await this.prisma.linoMessage.create({
        data: { linoConversationId: conversation.id, role: 'user', content: message },
      });

      const model = this.aiProvider.getModel();
      const { streamText, isStepCount } = this.ai;
      this.logger.log(`Processing chat stream for session: ${sessionId}`);

      const result = streamText({
        model,
        system: systemPrompt,
        messages: history,
        tools: this.toolsService.getTools(),
        stopWhen: isStepCount(5),
      });

      let streamedProducts: any[] = [];
      let fullText = '';

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          fullText += chunk.text;
          res.write(`data: ${JSON.stringify({ type: 'text', chunk: chunk.text })}\n\n`);
        } else if (chunk.type === 'tool-call') {
          const statusText = chunk.toolName === 'search_products'
            ? 'Searching catalog for products...'
            : 'Working on it...';
          res.write(`data: ${JSON.stringify({ type: 'status', message: statusText })}\n\n`);
        } else if (chunk.type === 'tool-result' && chunk.toolName === 'search_products') {
          const found =
            (chunk as any).result?.products ||
            (chunk as any).output?.value?.products ||
            (chunk as any).output?.products || [];
          if (Array.isArray(found) && found.length > 0) {
            streamedProducts = found;
            res.write(`data: ${JSON.stringify({ type: 'products', products: streamedProducts })}\n\n`);
          }
          res.write(`data: ${JSON.stringify({ type: 'status', message: 'Summarizing results...' })}\n\n`);
        }
      }

      const responseMessages = (await result.responseMessages) || [];
      const finalProducts = streamedProducts.length > 0 ? streamedProducts : extractProductsFromMessages(responseMessages);
      const newIntent = extractIntentFromMessages(responseMessages);

      await this.prisma.linoMessage.create({
        data: {
          linoConversationId: conversation.id,
          role: 'assistant',
          content: fullText,
          metadata: finalProducts.length > 0 ? { products: finalProducts } : null,
        },
      });

      if (newIntent) {
        await this.prisma.linoConversation.update({
          where: { id: conversation.id },
          data: { lastIntent: newIntent },
        });
      }

      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      res.end();
    } catch (error) {
      this.logger.error('Error during AI stream generation', error);
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Failed to process request' })}\n\n`);
      res.end();
    }
  }

  async getAllConversations() {
    return this.prisma.linoConversation.findMany({
      include: {
        messages: { where: { role: { in: ['user', 'assistant'] } }, orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Only the owner can read a chat back. Guest chats have no owner, so they always come back as not found.
  async getConversationForUser(sessionId: string, userId: string) {
    const conversation = await this.getConversationDetails(sessionId);
    if (!conversation || conversation.userId !== userId) {
      throw new NotFoundException('Conversation not found');
    }
    return conversation;
  }

  async getConversationDetails(sessionId: string) {
    return this.prisma.linoConversation.findUnique({
      where: { sessionId },
      include: {
        messages: { where: { role: { in: ['user', 'assistant'] } }, orderBy: { createdAt: 'asc' } },
      },
    });
  }

  async getUserConversations(userId: string) {
    return this.prisma.linoConversation.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        sessionId: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        messages: {
          where: { role: 'user' },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { content: true, role: true },
        },
      },
    });
  }
}
