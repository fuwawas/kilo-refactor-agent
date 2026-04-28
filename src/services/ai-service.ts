/**
 * AI Service - Wraps KiloCode SDK for agent communication
 * Handles planner, executor, and validator agent calls
 */

import { KiloSDK } from 'kilo-sdk';
import type { CompletionOptions, CompletionResponse } from '../types';

interface AIServiceConfig {
  model: string;
  maxTokens: number;
  apiKey?: string;
}

export class AIService {
  private readonly client: KiloSDK;
  private readonly config: AIServiceConfig;
  private totalTokensUsed = 0;

  constructor(config: AIServiceConfig) {
    this.config = config;
    this.client = new KiloSDK({
      apiKey: config.apiKey || process.env.KILO_API_KEY,
      model: config.model,
    });
  }

  /**
   * Send a completion request to the AI model
   */
  async complete(prompt: string, options: CompletionOptions = {}): Promise<string> {
    const startTime = Date.now();

    try {
      const response = await this.client.chat.completions.create({
        model: options.model || this.config.model,
        messages: [
          ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
          { role: 'user' as const, content: prompt },
        ],
        max_tokens: options.maxTokens || this.config.maxTokens,
        temperature: options.temperature ?? 0.1,
      });

      const content = response.choices[0]?.message?.content || '';
      const tokensUsed = response.usage?.total_tokens || 0;
      this.totalTokensUsed += tokensUsed;

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.debug(`[AI] ${elapsed}s | tokens=${tokensUsed} | total=${this.totalTokensUsed}`);

      return content;
    } catch (error) {
      if ((error as any).status === 429) {
        // Rate limited - wait and retry
        const retryAfter = parseInt((error as any).headers?.['retry-after'] || '5');
        console.warn(`Rate limited, retrying in ${retryAfter}s...`);
        await this.sleep(retryAfter * 1000);
        return this.complete(prompt, options);
      }
      throw error;
    }
  }

  /**
   * Stream a completion response
   */
  async *completeStream(prompt: string, options: CompletionOptions = {}): AsyncGenerator<string> {
    const stream = await this.client.chat.completions.create({
      model: options.model || this.config.model,
      messages: [
        ...(options.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
      max_tokens: options.maxTokens || this.config.maxTokens,
      temperature: options.temperature ?? 0.1,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        yield content;
      }
    }
  }

  /**
   * Get total tokens consumed in this session
   */
  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
