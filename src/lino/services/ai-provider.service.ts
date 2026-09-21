import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LanguageModel } from 'ai';

@Injectable()
export class AiProviderService implements OnModuleInit {
  private readonly logger = new Logger(AiProviderService.name);
  private model: LanguageModel;

  constructor(private readonly configService: ConfigService) {}

  async onModuleInit() {
    await this.initializeProvider();
  }

  private async initializeProvider() {
    const provider = this.configService.get<string>('AI_PROVIDER') || 'ollama'; // defaulting to ollama for local dev
    console.log(`Initializing AI Provider: ${provider}`);
    
    if (provider === 'ollama') {
      // Use eval to force native dynamic import and bypass TS CJS compilation
      const { createOpenAI } = await eval(`import('@ai-sdk/openai')`);
      const ollama = createOpenAI({
        baseURL: 'http://localhost:11434/v1',
        apiKey: 'ollama', // Ignored by Ollama, but satisfies the SDK
      });
      // Using Llama 3.1 8B
      this.model = ollama('llama3.1:8b');
      this.logger.log('Initialized Ollama Provider via OpenAI SDK (llama3.1:8b)');
    } else if (provider === 'gemini') {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (!apiKey) throw new Error('GEMINI_API_KEY is not set');
      
      const { createGoogleGenerativeAI } = await eval(`import('@ai-sdk/google')`);
      const google = createGoogleGenerativeAI({ apiKey });
      // Using gemini-3.5-flash for fast reasoning and tool calling
      this.model = google('gemini-3.5-flash');
      this.logger.log('Initialized Gemini AI Provider');
    } else {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
      
      const { createOpenAI } = await eval(`import('@ai-sdk/openai')`);
      const openai = createOpenAI({ apiKey });
      // Using gpt-4o-mini for fast, cheap agentic loops, or gpt-4o for complex tasks
      this.model = openai('gpt-4o-mini');
      this.logger.log('Initialized OpenAI Provider');
    }
  }

  getModel(): LanguageModel {
    if (!this.model) {
      throw new Error('AI Provider not initialized yet');
    }
    return this.model;
  }
}
