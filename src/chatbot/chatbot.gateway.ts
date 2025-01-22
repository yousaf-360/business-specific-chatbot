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

interface FlowData {
  data: {
    data: Array<{
      data: string;
      type: "text" | "image";
    }>;
    name: string;
    purpose: string;
    trigger_reason: string;
  };
}

interface FunctionData {
  data: {
    name: string;
    purpose: string;
    trigger_reason: string;
    body: Record<string, any>;
    type: string;
    headers: Record<string, string>;
    req_url: string;
    req_type: string;
    variables: Array<{
      prop_name: string;
      prop_reason: string;
    }>;
  };
}

interface OpenAIResponse {
  validation: string;
  flowData: FlowData;
  functionData: FunctionData;
  requires_action: boolean;
  required_info: any;
}

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
        name: 'Business Analyzer',
        instructions: `You are a business analyzer that helps generate structured data about businesses. 
          Your task is to:

          1. Validate the basic business information:
             - Business name should be proper and not generic
             - Purpose should be specific and clear
             - Products/Services should be detailed
             - Target audience should be well-defined
             - USP should be distinctive
             - Operational processes should be clear

          2. If basic information is valid, collect detailed information for flows and functions:
             - Ask about specific user interaction points
             - Inquire about customer journey steps
             - Get details about required API integrations
             - Understand data processing needs

          3. Only when you have ALL required information, generate:
             - Business summary
             - Flow data with specific user interactions
             - Function data with detailed API endpoints

          Never return null for flowData or functionData. Instead, ask specific questions to gather missing information.`,
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
      client.emit('serverResponse', { 
        message: firstQuestion 
      });
    } catch (error) {
      this.logger.error(`Error in handleConnection: ${error.message}`);
      client.emit('serverResponse', { 
        message: 'Connection error occurred' 
      });
    }
  }

  handleDisconnect(@ConnectedSocket() client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.sessions.delete(client.id);
    this.chatbotService.removeSession(client.id);
  }

  @SubscribeMessage('clientResponse')
  async handleAnswer(
    @MessageBody() payload: any,
    @ConnectedSocket() client: Socket,
  ) {
    try {
      let session = this.sessions.get(client.id);
      if (!session) {
        session = { thread: null, isOpenAIMode: false };
        this.sessions.set(client.id, session);
      }

      const answer = typeof payload === 'object' ? payload.answer : payload;
      if (!answer) {
        throw new Error('No answer provided');
      }

      this.logger.log(`Processing answer for client ${client.id}: ${answer}`);

      // If we have an active thread, continue the conversation
      if (session.thread) {
        this.logger.log('Continuing existing conversation');
        await this.openai.beta.threads.messages.create(session.thread.id, {
          role: 'user',
          content: answer
        });

        const run = await this.openai.beta.threads.runs.create(
          session.thread.id,
          { assistant_id: (await this.assistant).id }
        );
        this.logger.log(`Created follow-up run: ${run.id}`);

        const response = await this.waitForRunCompletion(run.id, session.thread.id);
        this.logger.log('Received follow-up response');

        try {
          // Try to parse as JSON first
          const parsedContent = JSON.parse(response.validation);
          this.logger.log('Response is JSON format');
          
          if (!parsedContent.flowData || !parsedContent.functionData) {
            // Missing required data, treat as a question
            this.logger.log('Incomplete data, sending as question');
            client.emit('serverResponse', {
              message: response.validation
            });
          } else {
            // Complete data received
            this.logger.log('Complete data received');
            client.emit('serverResponse', {
              message: parsedContent.message,
              data: {
                summary: session.businessData,
                flowData: this.validateFlowData(parsedContent.flowData),
                functionData: this.validateFunctionData(parsedContent.functionData)
              }
            });
          }
        } catch (error) {
          // If parsing fails, it's a question from the assistant
          this.logger.log('Response is a question');
          client.emit('serverResponse', {
            message: response.validation
          });
        }
      } else {
        // Handle initial data collection
        const currentQuestion = this.chatbotService.getCurrentQuestion(client.id);
        if (currentQuestion) {
          this.chatbotService.collectAnswer(client.id, currentQuestion.field, answer);

          if (this.chatbotService.isCollectionComplete(client.id)) {
            const businessData = this.chatbotService.getBusinessSummary(client.id);
            session.businessData = businessData;
            await this.startOpenAIConversation(businessData, client, session);
          } else {
            const nextQuestion = this.chatbotService.getNextQuestion(client.id);
            client.emit('serverResponse', { 
              message: nextQuestion 
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error in handleAnswer:', error);
      client.emit('serverResponse', { 
        message: 'Failed to process your response' 
      });
    }
  }

  private async startOpenAIConversation(
    businessData: Record<string, any>,
    client: Socket,
    session: any,
  ) {
    try {
      this.logger.log('Starting new OpenAI conversation');
      session.thread = await this.openai.beta.threads.create();
      this.logger.log(`Created new thread: ${session.thread.id}`);

      this.logger.log('Sending initial message to OpenAI');
      await this.openai.beta.threads.messages.create(session.thread.id, {
        role: 'user',
        content: `Analyze this business information and gather required details:

          Business Name: ${businessData.businessName}
          Purpose/Mission: ${businessData.purposeOrMission}
          Products/Services: ${businessData.productsOrServices}
          Target Audience: ${businessData.targetAudience}
          Unique Selling Points: ${businessData.uniqueSellingPoints}
          Operational Processes: ${businessData.operationalProcesses}

          Required Information:
          1. User Interaction Details:
             - What are the main ways users interact with the software?
             - What are common user requests or queries?
             - What is the typical user journey?
             - What are the key interaction points?

          2. API and Function Requirements:
             - What specific API endpoints are needed?
             - What data needs to be processed?
             - What are the authentication requirements?
             - What are the main business processes that need automation?

          Ask questions to gather any missing information before generating the final response.
          Do not generate flowData or functionData until you have all necessary details.`
      });

      this.logger.log('Creating run with assistant');
      const run = await this.openai.beta.threads.runs.create(
        session.thread.id,
        { assistant_id: (await this.assistant).id }
      );
      this.logger.log(`Created run: ${run.id}`);

      const response = await this.waitForRunCompletion(run.id, session.thread.id);
      this.logger.log('Received response from OpenAI');

      if (response.requires_action) {
        this.logger.log('More information needed, sending question to client');
        client.emit('serverResponse', {
          message: response.validation
        });
      } else {
        this.logger.log('Complete data received, sending full response');
        client.emit('serverResponse', {
          message: response.validation,
          data: {
            summary: businessData,
            flowData: this.validateFlowData(response.flowData),
            functionData: this.validateFunctionData(response.functionData)
          }
        });
      }

    } catch (error) {
      this.logger.error('Error in OpenAI conversation:', error);
      client.emit('serverResponse', { 
        message: 'Failed to process your information' 
      });
    }
  }

  private async waitForRunCompletion(runId: string, threadId: string): Promise<OpenAIResponse> {
    let run;
    do {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      run = await this.openai.beta.threads.runs.retrieve(threadId, runId);
      this.logger.log(`Run status: ${run.status}`);
    } while (['queued', 'in_progress', 'requires_action'].includes(run.status));

    this.logger.log(`Run completed with status: ${run.status}`);
    
    if (run.status === 'failed') {
      throw new Error(`Run failed: ${run.last_error?.message || 'Unknown error'}`);
    }

    const messages = await this.openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];
    const messageContent = lastMessage.content[0];
    const content = 'text' in messageContent ? messageContent.text.value : '';

    try {
      const parsedContent = JSON.parse(content);
      this.logger.log('Successfully parsed response content');
      
      if (!parsedContent.flowData?.data || !parsedContent.functionData?.data) {
        this.logger.log('Missing required data, requesting more information');
        return {
          validation: content,
          flowData: null,
          functionData: null,
          requires_action: true,
          required_info: null
        };
      }

      this.logger.log('Complete data received');
      return {
        validation: content,
        flowData: parsedContent.flowData,
        functionData: parsedContent.functionData,
        requires_action: false,
        required_info: null
      };
    } catch (error) {
      this.logger.log('Failed to parse response, treating as question');
      return {
        validation: content,
        flowData: null,
        functionData: null,
        requires_action: true,
        required_info: null
      };
    }
  }

  private cleanAndValidateResponse(response: any) {
    try {
      const parsedResponse = JSON.parse(response.validation);
      
      return {
        summary: parsedResponse.summary?.trim() || '',
        flowData: this.validateFlowData(parsedResponse.flowData),
        functionData: this.validateFunctionData(parsedResponse.functionData)
      };
    } catch (error) {
      this.logger.error('Error parsing response:', error);
      return {
        summary: response.validation?.trim() || '',
        flowData: null,
        functionData: null
      };
    }
  }

  private validateFlowData(flowData: any): FlowData | null {
    if (!flowData?.data) return null;

    return {
      data: {
        data: flowData.data.data?.map(item => ({
          data: String(item.data || '').trim(),
          type: item.type === 'image' ? 'image' : 'text'
        })) || [],
        name: String(flowData.data.name || '').trim(),
        purpose: String(flowData.data.purpose || '').trim(),
        trigger_reason: String(flowData.data.trigger_reason || '').trim()
      }
    };
  }

  private validateFunctionData(functionData: any): FunctionData | null {
    if (!functionData?.data) return null;

    return {
      data: {
        name: String(functionData.data.name || '').trim(),
        purpose: String(functionData.data.purpose || '').trim(),
        trigger_reason: String(functionData.data.trigger_reason || '').trim(),
        body: functionData.data.body || {},
        type: String(functionData.data.type || '').trim(),
        headers: functionData.data.headers || {},
        req_url: String(functionData.data.req_url || '').trim(),
        req_type: String(functionData.data.req_type || '').trim(),
        variables: functionData.data.variables?.map(v => ({
          prop_name: String(v.prop_name || '').trim(),
          prop_reason: String(v.prop_reason || '').trim()
        })) || []
      }
    };
  }
}
