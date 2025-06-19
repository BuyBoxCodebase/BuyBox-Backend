import { Injectable, Logger } from '@nestjs/common';
import { NotificationPayload } from './notification.service';

interface WhatsAppMessage {
  recipientNumber: string;
  payload: NotificationPayload;
  timestamp: number;
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private messageQueue: Map<string, WhatsAppMessage[]> = new Map();
  private queueTimers: Map<string, NodeJS.Timeout> = new Map();
  
  // How long to wait for batching messages (in milliseconds)
  private readonly BATCH_WINDOW = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Clean up old messages every hour
    setInterval(() => this.cleanupOldMessages(), 60 * 60 * 1000);
  }

  async queueMessage(recipientNumber: string, payload: NotificationPayload): Promise<void> {
    const message: WhatsAppMessage = {
      recipientNumber,
      payload,
      timestamp: Date.now(),
    };

    // Add to queue
    if (!this.messageQueue.has(recipientNumber)) {
      this.messageQueue.set(recipientNumber, []);
    }
    this.messageQueue.get(recipientNumber).push(message);

    // Set or reset timer for this recipient
    if (this.queueTimers.has(recipientNumber)) {
      clearTimeout(this.queueTimers.get(recipientNumber));
    }

    const timer = setTimeout(() => {
      this.processQueue(recipientNumber);
    }, this.BATCH_WINDOW);

    this.queueTimers.set(recipientNumber, timer);
  }

  // Process messages for a specific recipient
  private async processQueue(recipientNumber: string): Promise<void> {
    const messages = this.messageQueue.get(recipientNumber) || [];
    if (messages.length === 0) return;

    try {
      // Clear from queue before processing to avoid duplicate sends
      this.messageQueue.delete(recipientNumber);
      this.queueTimers.delete(recipientNumber);

      // Group messages by type
      const groupedByType = this.groupMessagesByType(messages);
      
      // Send batched messages
      await Promise.all(
        Object.entries(groupedByType).map(([type, typeMessages]) => 
          this.sendBatchedMessage(recipientNumber, type, typeMessages)
        )
      );
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp messages to ${recipientNumber}`,
        error,
      );
    }
  }

  // Group messages by notification type
  private groupMessagesByType(messages: WhatsAppMessage[]): Record<string, WhatsAppMessage[]> {
    return messages.reduce((acc, message) => {
      const type = message.payload.type;
      if (!acc[type]) {
        acc[type] = [];
      }
      acc[type].push(message);
      return acc;
    }, {} as Record<string, WhatsAppMessage[]>);
  }

  // Send batched messages for a specific type
  private async sendBatchedMessage(
    recipientNumber: string, 
    type: string, 
    messages: WhatsAppMessage[]
  ): Promise<void> {
    if (messages.length === 0) return;

    // For a single message, just send it normally
    if (messages.length === 1) {
      await this.sendWhatsAppMessage(
        recipientNumber, 
        messages[0].payload.title, 
        messages[0].payload.body
      );
      return;
    }

    // For multiple messages, create a batch message
    const typeLabel = this.getReadableType(type);
    const title = `You have ${messages.length} new ${typeLabel} notifications`;
    
    // Create a summary of all messages
    let body = '';
    
    // Limit to 5 notifications in the body to keep message reasonable
    const displayMessages = messages.slice(0, 5);
    displayMessages.forEach((message, index) => {
      body += `${index + 1}. ${message.payload.title}\n`;
    });
    
    if (messages.length > 5) {
      body += `...and ${messages.length - 5} more. Check your dashboard for details.`;
    } else {
      body += `\nCheck your dashboard for details.`;
    }

    await this.sendWhatsAppMessage(recipientNumber, title, body);
  }

  // Convert notification type to readable format
  private getReadableType(type: string): string {
    switch (type) {
      case 'orderUpdates': return 'order';
      case 'promotions': return 'promotion';
      case 'accountAlerts': return 'account';
      case 'deliveryUpdates': return 'delivery';
      case 'inventoryAlerts': return 'inventory';
      default: return '';
    }
  }

  // Actual implementation of WhatsApp sending
  private async sendWhatsAppMessage(
    recipientNumber: string,
    title: string,
    body: string,
  ): Promise<void> {
    try {
      // This is where you would integrate with WhatsApp Business API
      // For example, using a library like whatsapp-web.js or the official WhatsApp Business API
      
      this.logger.log(
        `Sending WhatsApp message to ${recipientNumber}: ${title}`
      );
      
      // Example integration with WhatsApp Business API
      // const response = await axios.post('https://whatsapp-api-url/send', {
      //   to: recipientNumber,
      //   type: 'text',
      //   text: {
      //     body: `*${title}*\n\n${body}`
      //   }
      // }, {
      //   headers: {
      //     'Authorization': `Bearer ${process.env.WHATSAPP_API_TOKEN}`
      //   }
      // });
      
      // For now, we'll just log it
      this.logger.debug(`Message content: ${body}`);
    } catch (error) {
      this.logger.error(`Failed to send WhatsApp message`, error);
      throw error;
    }
  }

  // Clean up messages older than 24 hours to prevent memory leaks
  private cleanupOldMessages(): void {
    const now = Date.now();
    const cutoff = now - 24 * 60 * 60 * 1000; // 24 hours ago
    
    for (const [recipientNumber, messages] of this.messageQueue.entries()) {
      const filteredMessages = messages.filter(msg => msg.timestamp >= cutoff);
      
      if (filteredMessages.length === 0) {
        this.messageQueue.delete(recipientNumber);
        
        if (this.queueTimers.has(recipientNumber)) {
          clearTimeout(this.queueTimers.get(recipientNumber));
          this.queueTimers.delete(recipientNumber);
        }
      } else if (filteredMessages.length !== messages.length) {
        this.messageQueue.set(recipientNumber, filteredMessages);
      }
    }
  }
}