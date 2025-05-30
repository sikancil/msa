// Forward declaration or import for Message and MessageHandler if they are complex types
// For now, using 'any' as placeholders.
export type Message = unknown; 
export type MessageHandler = (message: Message) => void;

export interface ITransport {
  listen(port: number | string): Promise<void>; // Port or path (e.g., for Unix sockets)
  send(message: Message): Promise<void>;
  onMessage(handler: MessageHandler): void;
  close(): Promise<void>;
}
