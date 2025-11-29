export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  text?: string;
  image?: string; // base64
  isError?: boolean;
  groundingLinks?: Array<{
    title: string;
    url: string;
  }>;
}

export interface ChatState {
  messages: Message[];
  isLoading: boolean;
}

export enum AppMode {
  CHAT = 'CHAT',
  EDIT = 'EDIT'
}