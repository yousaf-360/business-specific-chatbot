import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatbotService } from './chatbot.service';
import { Logger } from '@nestjs/common';
import OpenAI from 'openai';

@WebSocketGateway({
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
  namespace: '/chatbot',
})
export class ChatbotGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatbotGateway.name);
  private readonly openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  private readonly assistant: Promise<any>;

  private sessions: Map<
    string,
    {
      thread: any;
      isOpenAIMode: boolean;
      businessData?: Record<string, any>;
    }
  > = new Map();

  constructor(private readonly chatbotService: ChatbotService) {
    this.assistant = this.initializeAssistant();
  }

  private async initializeAssistant() {
    try {
      const assistant = await this.openai.beta.assistants.create({
        name: 'Business Validator',
        instructions: `You are a business information validator and advisor. Your role is to:
          1. Validate if the provided business information is clear and complete
          2. If valid, respond with 'VALID' followed by a concise business summary
          3. After summary generation:
             - Only answer questions about improving or clarifying the existing business information
             - Stay within the scope of: business name, purpose, products/services, target audience, USP, and operations
             - If a question is outside this scope, respond with: "I can only help with questions related to your business summary and its components."
          4. Keep responses focused and practical`,
        model: 'gpt-4o-mini',
      });
      this.logger.log('Assistant initialized successfully');
      return assistant;
    } catch (error) {
      this.logger.error('Failed to initialize assistant:', error);
      throw error;
    }
  }

  afterInit(server: Server) {
    this.logger.log('Chatbot WebSocket Gateway initialized');
  }

  handleConnection(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
    this.sessions.set(client.id, {
      thread: null,
      isOpenAIMode: false,
    });

    try {
      this.chatbotService.initializeSession(client.id);
      const firstQuestion = this.chatbotService.getNextQuestion(client.id);
      client.emit('question', { question: firstQuestion });
    } catch (error) {
      this.logger.error(`Error in handleConnection: ${error.message}`);
      client.emit('error', { message: 'Connection error occurred' });
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.sessions.delete(client.id);
    this.chatbotService.removeSession(client.id);
  }

  @SubscribeMessage('answer')
  async handleAnswer(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    try {
      let session = this.sessions.get(client.id);
      if (!session) {
        session = { thread: null, isOpenAIMode: false };
        this.sessions.set(client.id, session);
      }

      let answer: string;
      if (typeof payload === 'object' && payload !== null) {
        answer = payload.answer;
      } else if (typeof payload === 'string') {
        answer = payload;
      } else {
        throw new Error('Invalid payload format');
      }

      if (answer === undefined) {
        throw new Error('No answer provided in payload');
      }

      this.logger.log(`Processing answer for client ${client.id}: ${answer}`);

      const currentQuestion = this.chatbotService.getCurrentQuestion(client.id);

      if (!currentQuestion && session.thread) {
        await this.handlePostSummaryConversation(answer, client, session);
        return;
      }

      if (session.isOpenAIMode) {
        await this.handleOpenAIConversation(answer, client, session);
        return;
      }

      if (currentQuestion) {
        this.chatbotService.collectAnswer(
          client.id,
          currentQuestion.field,
          answer,
        );

        if (this.chatbotService.isCollectionComplete(client.id)) {
          const businessData = this.chatbotService.getBusinessSummary(
            client.id,
          );
          session.businessData = businessData;
          if (this.chatbotService.hasIncompleteInformation(client.id)) {
            session.isOpenAIMode = true;
            await this.startOpenAIConversation(businessData, client, session);
          } else {
            await this.startOpenAIConversation(businessData, client, session);
          }
        } else {
          const nextQuestion = this.chatbotService.getNextQuestion(client.id);
          client.emit('question', { question: nextQuestion });
        }
      }
    } catch (error) {
      this.logger.error(
        `Error in handleAnswer for client ${client.id}: ${error.message}`,
      );
      client.emit('error', {
        message: `Failed to process answer: ${error.message}`,
      });
    }
  }

  private async handlePostSummaryConversation(
    question: string,
    client: Socket,
    session: any,
  ) {
    try {
      const businessData = this.chatbotService.getBusinessSummary(client.id);

      await this.openai.beta.threads.messages.create(session.thread.id, {
        role: 'user',
        content: `Question about the business summary: ${question}

Current Business Information:
${Object.entries(businessData)
  .map(([key, value]) => `${key}: ${value || 'Not provided'}`)
  .join('\n')}`,
      });

      const run = await this.openai.beta.threads.runs.create(
        session.thread.id,
        { assistant_id: (await this.assistant).id },
      );

      const response = await this.waitForRunCompletion(
        run.id,
        session.thread.id,
      );
      client.emit('answer', { answer: response.validation });
    } catch (error) {
      this.logger.error(
        `Error in post-summary conversation for client ${client.id}:`,
        error,
      );
      client.emit('error', { message: 'Failed to process your question' });
    }
  }

  private async startOpenAIConversation(
    businessData: Record<string, any>,
    client: Socket,
    session: any,
  ) {
    try {
      this.logger.log('Starting OpenAI conversation with data:', businessData);
      session.thread = await this.openai.beta.threads.create();

      await this.openai.beta.threads.messages.create(session.thread.id, {
        role: 'user',
        content: `Please validate the following business information:
          Business Name: ${businessData.businessName || 'Not provided'}
          Purpose/Mission: ${businessData.purposeOrMission || 'Not provided'}
          Products/Services: ${businessData.productsOrServices || 'Not provided'}
          Target Audience: ${businessData.targetAudience || 'Not provided'}
          Unique Selling Points: ${businessData.uniqueSellingPoints || 'Not provided'}
          Operational Processes: ${businessData.operationalProcesses || 'Not provided'}
          
          Please validate if this information is clear and complete for a basic business summary. 
          If the information is valid, respond with 'VALID' followed by a concise business summary.
          If any required field needs clarification, ask a specific question about that field only.`,
      });

      const run = await this.openai.beta.threads.runs.create(
        session.thread.id,
        { assistant_id: (await this.assistant).id },
      );

      const response = await this.waitForRunCompletion(
        run.id,
        session.thread.id,
      );
      this.logger.log('OpenAI response:', response);

      if (response.validation.startsWith('VALID')) {
        client.emit('summary', {
          summary: businessData,
          message: response.validation.replace('VALID', '').trim(),
          note: 'You can now ask questions to improve or clarify your business summary.',
        });
        session.isOpenAIMode = false;
      } else {
        client.emit('question', { question: response.validation });
      }
    } catch (error) {
      this.logger.error('Error starting OpenAI conversation:', error);
      client.emit('error', { message: 'Failed to start AI conversation' });
    }
  }

  private async handleOpenAIConversation(
    answer: string,
    client: Socket,
    session: any,
  ) {
    try {
      await this.openai.beta.threads.messages.create(session.thread.id, {
        role: 'user',
        content: answer,
      });

      const run = await this.openai.beta.threads.runs.create(
        session.thread.id,
        { assistant_id: (await this.assistant).id },
      );

      const response = await this.waitForRunCompletion(
        run.id,
        session.thread.id,
      );

      if (response.validation.startsWith('VALID')) {
        const businessData = this.chatbotService.getBusinessSummary(client.id);
        client.emit('summary', {
          summary: businessData,
          message: response.validation.replace('VALID', '').trim(),
        });
        session.isOpenAIMode = false;
      } else {
        client.emit('question', { question: response.validation });
      }
    } catch (error) {
      this.logger.error('Error in OpenAI conversation:', error);
      client.emit('error', { message: 'Failed to process conversation' });
    }
  }

  private async waitForRunCompletion(runId: string, threadId: string) {
    let run;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      this.logger.log('Run status:', run.status);
    } while (run.status === 'in_progress');

    const messages = await this.openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];

    const messageContent = lastMessage.content[0];
    const validationText =
      'text' in messageContent
        ? messageContent.text.value
        : 'No validation message available';

    this.logger.log('Validation text:', validationText);

    return {
      validation: validationText,
      requires_action: run.status === 'requires_action',
      required_info: run.required_action?.submit_tool_outputs || null,
    };
  }
}
