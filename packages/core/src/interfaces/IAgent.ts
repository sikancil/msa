// Placeholder types for AgentRequest, AgentResponse, ProtocolType, AgentCapability
export type AgentRequest = any;
export type AgentResponse = any;
export type ProtocolType = string; // Or an enum
export type AgentCapability = { name: string; version: string; }; // Example structure

export interface IAgent {
  processRequest(request: AgentRequest): Promise<AgentResponse>;
  handleProtocol(protocol: ProtocolType): boolean;
  getCapabilities(): AgentCapability[];
}
