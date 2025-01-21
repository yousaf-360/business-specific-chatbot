import { Module } from '@nestjs/common';
import { ChatbotService } from './chatbot.service';
import { ChatbotController } from './chatbot.controller';
import { ChatbotGateway } from './chatbot.gateway';

@Module({
  providers: [ChatbotService, ChatbotGateway],
  controllers: [ChatbotController]
})
export class ChatbotModule {}
