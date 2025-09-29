import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { GetUser } from '@app/common';

@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) { }

  @Post('/send-message')
  sendMessage(@GetUser("userId") userId: string, @Body() body: any) {

    // identifier={
    //   conversationId:"", // The conversationId that is required to implement.
    // productId:"", // The productId under which we do chats
    // buyerId:"", // The buyerId, the person who is trying to contact the seller
    // sellerId:"", // The sellerId, with whom buyer wants to contact, basically the person who is the owner of the product's brand
    // }

    return this.chatService.sendMessage({
      senderId: userId,
      content: String(body.content),
      senderType: "buyer",
      type: "TEXT",
      identifier: {
        conversationId: body.identifier.conversationId,
        productId: body.identifier.productId,
        buyerId: body.identifier.buyerId,
        sellerId: body.identifier.sellerId,
      },
      metadata: body.metadata,
    });
  }
}
