import { Controller, Post, Body, Res, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { LinoService } from './services/lino.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../customer/auth/guards/optional-jwt-auth.guard';

@Controller('lino')
export class LinoController {
  constructor(private readonly linoService: LinoService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat')
  async chat(@Body() chatRequest: ChatRequestDto, @Req() req: any) {
    const userId = req.user?.userId ?? chatRequest.userId;
    return this.linoService.handleChat(chatRequest.sessionId, chatRequest.message, userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat-stream')
  async chatStream(@Body() chatRequest: ChatRequestDto, @Res() res: Response, @Req() req: any) {
    const userId = req.user?.userId ?? chatRequest.userId;
    return this.linoService.handleChatStream(chatRequest.sessionId, chatRequest.message, res, userId);
  }

  // Customer Route — fetch history for a specific session
  @Get('history/:sessionId')
  async getHistory(@Param('sessionId') sessionId: string) {
    return this.linoService.getConversationDetails(sessionId);
  }

  // Customer Route — fetch all chats for the logged-in user (side panel)
  @UseGuards(JwtAuthGuard)
  @Get('user/sessions')
  async getUserSessions(@Req() req: any) {
    return this.linoService.getUserConversations(req.user.userId);
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
