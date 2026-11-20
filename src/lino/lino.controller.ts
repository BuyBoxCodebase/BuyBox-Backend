import { BadRequestException, Controller, Post, Body, Res, Get, Param, Req, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { LinoService } from './services/lino.service';
import { ChatRequestDto } from './dto/chat-request.dto';
import { JwtAuthGuard } from '../customer/auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../customer/auth/guards/optional-jwt-auth.guard';
import { Roles, RolesGuard } from '../../libs/common/src';

@Controller('lino')
export class LinoController {
  constructor(private readonly linoService: LinoService) {}

  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat')
  async chat(@Body() chatRequest: ChatRequestDto, @Req() req: any) {
    assertChatRequest(chatRequest);
    return this.linoService.handleChat(chatRequest.sessionId, chatRequest.message, req.user?.userId);
  }

  @UseGuards(OptionalJwtAuthGuard)
  @Post('chat-stream')
  async chatStream(@Body() chatRequest: ChatRequestDto, @Res() res: Response, @Req() req: any) {
    assertChatRequest(chatRequest);
    return this.linoService.handleChatStream(chatRequest.sessionId, chatRequest.message, res, req.user?.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('history/:sessionId')
  async getHistory(@Param('sessionId') sessionId: string, @Req() req: any) {
    return this.linoService.getConversationForUser(sessionId, req.user.userId);
  }

  // Customer Route — fetch all chats for the logged-in user (side panel)
  @UseGuards(JwtAuthGuard)
  @Get('user/sessions')
  async getUserSessions(@Req() req: any) {
    return this.linoService.getUserConversations(req.user.userId);
  }

  // Admin Routes for Chat History
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/conversations')
  async getConversations() {
    return this.linoService.getAllConversations();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'SUPER_ADMIN')
  @Get('admin/conversations/:sessionId')
  async getConversationDetails(@Param('sessionId') sessionId: string) {
    return this.linoService.getConversationDetails(sessionId);
  }
}

// A missing sessionId would reach Prisma as `where: { sessionId: undefined }` and 500.
function assertChatRequest(chatRequest: ChatRequestDto) {
  if (typeof chatRequest?.sessionId !== 'string' || !chatRequest.sessionId) {
    throw new BadRequestException('sessionId is required');
  }
  if (typeof chatRequest.message !== 'string' || !chatRequest.message) {
    throw new BadRequestException('message is required');
  }
}
