import { Controller, Post, Body, Res, Get, Param } from '@nestjs/common';
import { Response } from 'express';
import { LinoService } from './services/lino.service';
import { ChatRequestDto } from './dto/chat-request.dto';

@Controller('lino')
export class LinoController {
  constructor(private readonly linoService: LinoService) {}

  @Post('chat')
  async chat(@Body() chatRequest: ChatRequestDto) {
    return this.linoService.handleChat(chatRequest.sessionId, chatRequest.message);
  }

  @Post('chat-stream')
  async chatStream(@Body() chatRequest: ChatRequestDto, @Res() res: Response) {
    return this.linoService.handleChatStream(chatRequest.sessionId, chatRequest.message, res);
  }

  // Admin Routes for Chat History
  @Get('admin/conversations')
  async getConversations() {
    return this.linoService.getAllConversations();
  }

  @Get('admin/conversations/:sessionId')
  async getConversationDetails(@Param('sessionId') sessionId: string) {
    return this.linoService.getConversationDetails(sessionId);
  }
}
