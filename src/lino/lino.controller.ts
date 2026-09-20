import { Controller, Post, Body, Res } from '@nestjs/common';
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
}
