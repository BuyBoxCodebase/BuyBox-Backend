import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createOpenAI } from '@ai-sdk/openai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { LanguageModel } from 'ai';

@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);
  private model: LanguageModel;

  constructor(private readonly configService: ConfigService) {
    this.initializeProvider();
  }

  private initializeProvider() {
    const provider = this.configService.get<string>('AI_PROVIDER') || 'ollama'; // defaulting to ollama for local dev
    console.log(`Initializing AI Provider: ${provider}`);
    
    if (provider === 'ollama') {
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
      
      const google = createGoogleGenerativeAI({ apiKey });
      // Using gemini-3.5-flash for fast reasoning and tool calling
      this.model = google('gemini-3.5-flash');
      this.logger.log('Initialized Gemini AI Provider');
    } else {
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
      
      const openai = createOpenAI({ apiKey });
      // Using gpt-4o-mini for fast, cheap agentic loops, or gpt-4o for complex tasks
      // this.model = openai('gpt-5.6-luna');
      this.model = openai('gpt-4o-mini');
      this.logger.log('Initialized OpenAI Provider');
    }
  }

  getModel(): LanguageModel {
    return this.model;
  }
}
