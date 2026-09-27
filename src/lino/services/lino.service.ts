import { Injectable, Inject, Logger, OnModuleInit } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { AiProviderService } from './ai-provider.service';
import { ToolsService } from './tools.service';
import type { ModelMessage } from 'ai';
import { PrismaService } from '../../prisma/prisma.service';

const LINO_SYSTEM_PROMPT = `PERSONALITY & LANGUAGE:

Lino should feel like a stylish, knowledgeable friend who happens to be exceptionally good at finding products.

* Be playful, confident, warm, and naturally conversational.
* Use modern, contemporary language that feels natural to Gen Z.
* Use light slang when appropriate, such as:
  "say less", "clean", "fire", "fresh", "tough", "that’s a vibe", "goes hard", "good pick", "got you".
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
Lino: "Got you. Let’s find something that goes hard for the party."

Customer: "do you have air force 1s?"
Lino: "Yep — let me check what’s available."

Customer: "thanks"
Lino: "Anytime 🤝"

Customer: "show me something for a wedding"
Lino: "Got you. Let’s keep it clean and wedding-ready."

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
`;

@Injectable()
export class LinoService implements OnModuleInit {
  private readonly logger = new Logger(LinoService.name);
  private ai: any;

  constructor(
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly aiProvider: AiProviderService,
    private readonly toolsService: ToolsService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    this.ai = await eval(`import('ai')`);
  }

  async handleChat(sessionId: string, message: string) {
    let conversation = await this.prisma.linoConversation.findUnique({
      where: { sessionId }
    });
    if (!conversation) {
      conversation = await this.prisma.linoConversation.create({
        data: { sessionId }
      });
    }

    const previousMessages = await this.prisma.linoMessage.findMany({
      where: { linoConversationId: conversation.id },
      orderBy: { createdAt: 'asc' }
    });

    const history: ModelMessage[] = previousMessages.map(m => ({
      role: m.role as any,
      content: m.content
    }));
    
    // Append new user message
    history.push({ role: 'user', content: message });
    await this.prisma.linoMessage.create({
      data: {
        linoConversationId: conversation.id,
        role: 'user',
        content: message
      }
    });

    // 3. Setup AI Agent Call
    const model = this.aiProvider.getModel();
    
    this.logger.log(`Processing chat for session: ${sessionId}`);

    try {
      const { generateText, isStepCount } = this.ai;
      const result = await generateText({
        model,
        system: LINO_SYSTEM_PROMPT,
        messages: history,
        tools: this.toolsService.getTools(message),
        stopWhen: isStepCount(5),
      });


      let finalReply = result.text;
      let finalProducts: any[] = [];

      // Try to extract products if the model natively used tool_calls across any step
      if (result.steps && result.steps.length > 0) {
        for (const step of result.steps) {
          if (step.toolResults && step.toolResults.length > 0) {
            const searchResult = step.toolResults.find((t: any) => t.toolName === 'search_products') as any;
            if (searchResult && searchResult.output && searchResult.output.products) {
              finalProducts = searchResult.output.products;
            }
          }
        }
      } else if (result.toolResults && result.toolResults.length > 0) {
        const searchResult = result.toolResults.find((t: any) => t.toolName === 'search_products') as any;
        if (searchResult && searchResult.output && searchResult.output.products) {
          finalProducts = searchResult.output.products;
        }
      }

      // 🛠️ Fallback for local models (like Qwen 3B) that output raw JSON text instead of proper API tool calls
      if (finalReply.trim().startsWith('{') && finalReply.includes('search_products')) {
        try {
          const parsed = JSON.parse(finalReply.trim());
          if (parsed.name === 'search_products') {
            this.logger.log('Intercepted raw JSON tool call. Executing manual fallback...');
            
            // 1. Manually execute the tool
            const toolFunc = this.toolsService.getTools(message).search_products.execute;
            if (toolFunc) {
              const searchResult = await toolFunc(parsed.arguments || {}, {} as any);
              finalProducts = (searchResult as any).products || [];
              
              // 2. Perform a second LLM pass to summarize the results
              const summaryResult = await generateText({
                model,
                system: 'You are Lino, a playful, warm, modern Gen Z-friendly shopping assistant. Use light slang naturally when it fits, but never force it or sound childish. Be conversational and engaging. Summarize why these products are a great match and ask a friendly follow-up question. NEVER output a dry list of product names, prices, or details (the UI already shows the cards). Never use negative words or apologize. Never include image URLs.',
                prompt: `User query: "${message}"\nSearch Results: ${JSON.stringify(searchResult)}`,
              });
              
              finalReply = summaryResult.text;
            }
          }
        } catch (e) {
          this.logger.warn('Failed to parse manual JSON tool call fallback', e);
        }
      }

      // Save assistant response to DB
      await this.prisma.linoMessage.create({
        data: {
          linoConversationId: conversation.id,
          role: 'assistant',
          content: finalReply,
          metadata: finalProducts.length > 0 ? { products: finalProducts } : null
        }
      });
      
      return {
        reply: finalReply,
        products: finalProducts
      };
    } catch (error) {
      this.logger.error('Error during AI generation', error);
      throw error;
    }
  }

  async handleChatStream(sessionId: string, message: string, res: any) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial status
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Analyzing your request...' })}\n\n`);

    let conversation = await this.prisma.linoConversation.findUnique({
      where: { sessionId }
    });
    if (!conversation) {
      conversation = await this.prisma.linoConversation.create({
        data: { sessionId }
      });
    }

    const previousMessages = await this.prisma.linoMessage.findMany({
      where: { linoConversationId: conversation.id },
      orderBy: { createdAt: 'asc' }
    });

    let history: ModelMessage[] = previousMessages.map(m => ({
      role: m.role as any,
      content: m.content
    }));
    
    history.push({ role: 'user', content: message });
    await this.prisma.linoMessage.create({
      data: {
        linoConversationId: conversation.id,
        role: 'user',
        content: message
      }
    });

    const model = this.aiProvider.getModel();
    this.logger.log(`Processing chat STREAM for session: ${sessionId}`);

    try {
      const { streamText } = this.ai;
      const result = streamText({
        model,
        system: LINO_SYSTEM_PROMPT,
        messages: history,
        tools: this.toolsService.getTools(message)
      });

      let finalReply = '';
      let finalProducts: any[] = [];
      let isJSON = false;
      let firstChunk = true;

      for await (const chunk of result.fullStream) {
        if (chunk.type === 'text-delta') {
          if (firstChunk) {
            firstChunk = false;
            if (chunk.text.trim().startsWith('{')) {
              isJSON = true;
            }
          }
          finalReply += chunk.text;
          if (!isJSON) {
            res.write(`data: ${JSON.stringify({ type: 'text', chunk: chunk.text })}\n\n`);
          }
        } else if (chunk.type === 'tool-call') {
          let toolDesc = 'Working on it...';
          if (chunk.toolName === 'search_products') toolDesc = 'Searching catalog for products...';
          res.write(`data: ${JSON.stringify({ type: 'status', message: toolDesc })}\n\n`);
        } else if (chunk.type === 'tool-result') {
          if (chunk.toolName === 'search_products') {
            finalProducts = (chunk as any).output?.products || [];
            res.write(`data: ${JSON.stringify({ type: 'products', products: finalProducts })}\n\n`);
            res.write(`data: ${JSON.stringify({ type: 'status', message: 'Summarizing results...' })}\n\n`);
          }
        }
      }

      // 🛠️ Fallback for local models that output raw JSON text instead of proper API tool calls in the stream
      if (isJSON && finalReply.includes('search_products')) {
        try {
          const parsed = JSON.parse(finalReply.trim());
          if (parsed.name === 'search_products') {
            this.logger.log('Intercepted raw JSON tool call in stream. Executing manual fallback...');
            res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching catalog for products...' })}\n\n`);
            
            const toolFunc = this.toolsService.getTools(message).search_products.execute;
            if (toolFunc) {
              const searchResult = await toolFunc(parsed.arguments || {}, {} as any);
              finalProducts = (searchResult as any).products || [];
              res.write(`data: ${JSON.stringify({ type: 'products', products: finalProducts })}\n\n`);
              res.write(`data: ${JSON.stringify({ type: 'status', message: 'Summarizing results...' })}\n\n`);
              
              // Clear finalReply because it was just JSON, allowing the summary fallback below to run
              finalReply = '';
            }
          }
        } catch (e) {
          this.logger.warn('Failed to parse manual JSON tool call fallback in stream', e);
        }
      }

      // 🛠️ Fallback: If the model natively executed the tool but failed to generate a summary text afterwards,
      // run a quick secondary stream just to summarize the products.
      if (finalReply.trim() === '' && finalProducts.length > 0) {
        this.logger.log('Model did not provide a text summary. Running fallback summary stream...');
        const summaryResult = streamText({
          model,
          system: 'You are Lino, a playful, warm, modern Gen Z-friendly shopping assistant. Use light slang naturally when it fits, but never force it or sound childish. Be conversational and engaging. Summarize why these products are a great match and ask a friendly follow-up question. NEVER output a dry list of product names, prices, or details (the UI already shows the cards). Never use negative words or apologize. Never include image URLs.',
          prompt: `User query: "${message}"\nSearch Results: ${JSON.stringify(finalProducts.slice(0, 5))}`,
        });
        
        for await (const chunk of summaryResult.fullStream) {
          if (chunk.type === 'text-delta') {
            finalReply += (chunk as any).text || (chunk as any).textDelta;
            res.write(`data: ${JSON.stringify({ type: 'text', chunk: (chunk as any).text || (chunk as any).textDelta })}\n\n`);
          }
        }
      }

      // Save assistant message to DB
      await this.prisma.linoMessage.create({
        data: {
          linoConversationId: conversation.id,
          role: 'assistant',
          content: finalReply,
          metadata: finalProducts.length > 0 ? { products: finalProducts } : null
        }
      });

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
        messages: true
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async getConversationDetails(sessionId: string) {
    return this.prisma.linoConversation.findUnique({
      where: { sessionId },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    });
  }
}
