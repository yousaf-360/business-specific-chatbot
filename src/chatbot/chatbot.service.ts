import { Injectable } from '@nestjs/common';

interface Question {
  field: string;
  question: string;
}

@Injectable()
export class ChatbotService {
  private sessions: Map<string, {
    businessData: Record<string, string>;
    currentQuestionIndex: number;
  }> = new Map();

  private questions = [
    { field: 'businessName', question: 'What is the name of your business?' },
    { field: 'purposeOrMission', question: 'What is the purpose or mission of your business?' },
    { field: 'productsOrServices', question: 'What products or services do you offer?' },
    { field: 'targetAudience', question: 'Who is your target audience?' },
    { field: 'uniqueSellingPoints', question: 'What are your unique selling points?' },
    { field: 'operationalProcesses', question: 'What are your operational processes? (Optional)' },
  ];

  initializeSession(clientId: string): void {
    this.sessions.set(clientId, {
      businessData: {},
      currentQuestionIndex: 0
    });
  }

  collectAnswer(clientId: string, field: string, value: string): void {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');
    
    session.businessData[field] = value || null;
    session.currentQuestionIndex++;
  }

  hasIncompleteInformation(clientId: string): boolean {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    const requiredFields = ['businessName', 'purposeOrMission', 'productsOrServices', 'targetAudience', 'uniqueSellingPoints'];
    return requiredFields.some(field => !session.businessData[field] || session.businessData[field].trim() === '');
  }

  getCurrentQuestion(clientId: string): Question {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    if (session.currentQuestionIndex < this.questions.length) {
      return this.questions[session.currentQuestionIndex];
    }
    return null;
  }

  getNextQuestion(clientId: string): string | null {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    if (session.currentQuestionIndex < this.questions.length) {
      return this.questions[session.currentQuestionIndex].question;
    }
    return null;
  }

  isCollectionComplete(clientId: string): boolean {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    return session.currentQuestionIndex >= this.questions.length;
  }

  getBusinessSummary(clientId: string): Record<string, any> {
    const session = this.sessions.get(clientId);
    if (!session) throw new Error('Session not found');

    return session.businessData;
  }

  removeSession(clientId: string): void {
    this.sessions.delete(clientId);
  }
}
