export interface MCPMessageBase {
  messageId: string;
  protocolVersion: string; // e.g., "1.0"
  timestamp: string; // ISO 8601
}

export interface MCPContext {
  sessionId?: string;
  [key: string]: any; // For arbitrary context data
}

export interface MCPRequest extends MCPMessageBase {
  type: 'request';
  action: string; // e.g., "generate_text", "get_capabilities"
  payload: any;
  context?: MCPContext;
}

export interface MCPResponse extends MCPMessageBase {
  type: 'response';
  requestId: string; // Corresponds to MCPRequest.messageId
  status: 'success' | 'error';
  payload?: any;
  error?: { code: string; message: string; };
  context?: MCPContext; // Updated context
}

export type MCPMessage = MCPRequest | MCPResponse;
