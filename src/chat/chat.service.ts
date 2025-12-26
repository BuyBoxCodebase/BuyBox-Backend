import { Injectable } from '@nestjs/common';
import { ConversationType, Message } from '@prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) { }

  async getOrCreateConversation(
    buyerId: string,
    sellerId: string,
    productId?: string,
    orderId?: string,
  ) {
    let conversation = await this.prisma.conversation.findFirst({
      where: {
        buyerId,
        sellerId,
        ...(productId && { productId }),
        ...(orderId && { orderId }),
      },
      include: {
        buyer: { select: { id: true, name: true, profilePic: true } },
        seller: { select: { id: true, name: true, profilePic: true } },
        product: { select: { id: true, name: true, images: true } },
        order: { select: { id: true, totalAmount: true, status: true } },
      },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          buyerId,
          sellerId,
          productId,
          orderId,
          type: orderId ? ConversationType.POST_PURCHASE : ConversationType.PRE_PURCHASE,
        },
        include: {
          buyer: { select: { id: true, name: true, profilePic: true } },
          seller: { select: { id: true, name: true, profilePic: true } },
          product: { select: { id: true, name: true, images: true } },
          order: { select: { id: true, totalAmount: true, status: true } },
        },
      });
    }

    return conversation;
  }

  // Send a message in a conversation
  async sendMessage({
    identifier,
    senderId,
    senderType,
    content,
    type = 'TEXT',
    metadata,
  }: {
    senderId: string,
    senderType: 'buyer' | 'seller',
    content: string,
    type: 'TEXT' | 'QUICK_REPLY',
    identifier: {
      conversationId?: string,
      productId?: string,
      buyerId?: string,
      sellerId?: string,
    },
    metadata?: any,
  }
  ) {

    const { buyerId, conversationId, productId, sellerId } = identifier;
    let message: Message;
    if (conversationId) {
      message = await this.prisma.message.create({
        data: {
          conversationId,
          senderId,
          senderType,
          content,
          type,
          metadata,
        },
      });
    } else {
      const conversation = await this.getOrCreateConversation(buyerId, sellerId, productId);
      message = await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderId,
          senderType,
          content,
          type,
          metadata,
        }
      });
    }


    // Update conversation's last message info
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageId: message.id,
        lastMessageAt: new Date(),
      },
    });

    // Create notification for recipient
    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        product: { select: { name: true } },
        order: { select: { id: true } },
      },
    });

    if (conversation) {
      const recipientId =
        senderType === 'buyer' ? conversation.sellerId : conversation.buyerId;
      const recipientType = senderType === 'buyer' ? 'seller' : 'buyer';

      const notificationTitle = conversation.productId
        ? `New message about ${conversation.product?.name}`
        : conversation.orderId
          ? `New message about Order #${conversation.order?.id}`
          : 'New message';

      await this.createChatNotification(
        conversationId,
        recipientId,
        recipientType,
        message.id,
        notificationTitle,
        content.length > 50 ? content.substring(0, 50) + '...' : content,
      );
    }

    return message;
  }

  // Get messages in a conversation with pagination
  async getMessages(
    conversationId: string,
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'desc' },
      skip,
      take: limit,
      include: {
        conversation: {
          select: {
            buyer: { select: { id: true, name: true, profilePic: true } },
            seller: { select: { id: true, name: true, profilePic: true } },
          },
        },
      },
    });

    return messages.reverse(); // Return chronological order
  }

  // Mark messages as read
  async markMessagesAsRead(
    conversationId: string,
    userId: string,
    userType: 'buyer' | 'seller',
  ) {
    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: new Date(),
      },
    });
  }

  // Get user's inbox (conversations list)
  async getUserInbox(
    userId: string,
    userType: 'buyer' | 'seller',
    page: number = 1,
    limit: number = 20,
  ) {
    const skip = (page - 1) * limit;
    const isArchivedField =
      userType === 'buyer' ? 'isArchivedBuyer' : 'isArchivedSeller';

    const conversations = await this.prisma.conversation.findMany({
      where: {
        [userType === 'buyer' ? 'buyerId' : 'sellerId']: userId,
        [isArchivedField]: false,
        lastMessageAt: { not: null },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take: limit,
      include: {
        buyer: { select: { id: true, name: true, profilePic: true } },
        seller: { select: { id: true, name: true, profilePic: true } },
        product: { select: { id: true, name: true, images: true } },
        order: { select: { id: true, status: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            id: true,
            content: true,
            createdAt: true,
            senderId: true,
            senderType: true,
            isRead: true,
          },
        },
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                isRead: false,
              },
            },
          },
        },
      },
    });

    return conversations;
  }

  // Create chat notification
  async createChatNotification(
    conversationId: string,
    recipientId: string,
    recipientType: 'buyer' | 'seller',
    messageId: string,
    title: string,
    body: string,
  ) {
    return await this.prisma.chatNotification.create({
      data: {
        conversationId,
        recipientId,
        recipientType,
        messageId,
        title,
        body,
      },
    });
  }

  // Get unread notifications for user
  async getUnreadNotifications(userId: string, userType: 'buyer' | 'seller') {
    return await this.prisma.chatNotification.findMany({
      where: {
        recipientId: userId,
        recipientType: userType,
        isRead: false,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Mark notification as read
  async markNotificationAsRead(notificationId: string) {
    return await this.prisma.chatNotification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  // Archive conversation
  async archiveConversation(
    conversationId: string,
    userId: string,
    userType: 'buyer' | 'seller',
  ) {
    const updateField =
      userType === 'buyer' ? 'isArchivedBuyer' : 'isArchivedSeller';

    return await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { [updateField]: true },
    });
  }

  // Report conversation/user
  async reportUser(
    conversationId: string,
    reporterId: string,
    reporterType: 'buyer' | 'seller',
    reportedId: string,
    reportedType: 'buyer' | 'seller',
    reason: string,
    description?: string,
  ) {
    return await this.prisma.chatReport.create({
      data: {
        conversationId,
        reporterId,
        reporterType,
        reportedId,
        reportedType,
        reason,
        description,
      },
    });
  }

  // Get conversation by ID with messages
  async getConversationById(
    conversationId: string,
    userId: string,
    userType: 'buyer' | 'seller',
  ) {
    const conversation = await this.prisma.conversation.findFirst({
      where: {
        id: conversationId,
        [userType === 'buyer' ? 'buyerId' : 'sellerId']: userId,
      },
      include: {
        buyer: { select: { id: true, name: true, profilePic: true } },
        seller: { select: { id: true, name: true, profilePic: true } },
        product: {
          select: { id: true, name: true, images: true, basePrice: true },
        },
        order: { select: { id: true, status: true, totalAmount: true } },
      },
    });

    return conversation;
  }

  // Get unread message count for user
  async getUnreadCount(userId: string, userType: 'buyer' | 'seller') {
    const conversations = await this.prisma.conversation.findMany({
      where: {
        [userType === 'buyer' ? 'buyerId' : 'sellerId']: userId,
        [userType === 'buyer' ? 'isArchivedBuyer' : 'isArchivedSeller']: false,
      },
      include: {
        _count: {
          select: {
            messages: {
              where: {
                senderId: { not: userId },
                isRead: false,
              },
            },
          },
        },
      },
    });

    return conversations.reduce(
      (total, conv) => total + conv._count.messages,
      0,
    );
  }

  // Send system message (auto-generated)
  async sendSystemMessage(
    conversationId: string,
    content: string,
    metadata?: any,
  ) {
    return await this.prisma.message.create({
      data: {
        conversationId,
        senderId: 'system',
        senderType: 'system',
        content,
        type: 'SYSTEM',
        metadata,
        isRead: false,
      },
    });
  }

  // Get quick reply suggestions based on conversation context
  getQuickReplySuggestions(
    conversationType: 'PRE_PURCHASE' | 'POST_PURCHASE',
    userType: 'buyer' | 'seller',
  ) {
    if (conversationType === 'PRE_PURCHASE') {
      if (userType === 'buyer') {
        return [
          'Is this still available?',
          'Do you have other sizes/colors?',
          'How soon can you deliver?',
          'What are the payment options?',
        ];
      } else {
        return [
          'Yes, available in all sizes',
          'Can deliver by 5PM',
          'Available for pickup',
          'Price negotiable',
        ];
      }
    } else {
      if (userType === 'buyer') {
        return [
          'Can I change delivery address?',
          'What time will you deliver?',
          'Can I collect instead?',
          'Is the order ready?',
        ];
      } else {
        return [
          'Will deliver today between 3-5PM',
          'Ready for pickup',
          'Order is being prepared',
          'Delivery confirmed',
        ];
      }
    }
  }

  // Delete old messages (cleanup job - run periodically)
  async deleteOldMessages(daysOld: number = 30) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    return await this.prisma.message.deleteMany({
      where: {
        createdAt: { lt: cutoffDate },
      },
    });
  }

  // Search conversations by product name or content
  async searchConversations(
    userId: string,
    userType: 'buyer' | 'seller',
    query: string,
    page: number = 1,
    limit: number = 10,
  ) {
    const skip = (page - 1) * limit;

    return await this.prisma.conversation.findMany({
      where: {
        [userType === 'buyer' ? 'buyerId' : 'sellerId']: userId,
        OR: [
          {
            product: {
              name: { contains: query, mode: 'insensitive' },
            },
          },
          {
            messages: {
              some: {
                content: { contains: query, mode: 'insensitive' },
              },
            },
          },
        ],
      },
      skip,
      take: limit,
      include: {
        buyer: { select: { id: true, name: true, profilePic: true } },
        seller: { select: { id: true, name: true, profilePic: true } },
        product: { select: { id: true, name: true, images: true } },
        order: { select: { id: true, status: true } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });
  }
}
