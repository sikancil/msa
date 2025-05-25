import { Service, Logger, Message, PluginConfig, IPlugin } from '@arifwidianto/msa-core';
import { HttpPlugin, HttpMessagePayload } from '@arifwidianto/msa-plugin-http';
import { WebSocketPlugin, WebSocketMessagePayload } from '@arifwidianto/msa-plugin-websocket';
import { RawData, WebSocket } from 'ws'; // Import WebSocket for type usage if needed

const HTTP_PORT = 3000;
const WS_PORT = 3001;

async function main() {
  Logger.info('Starting HTTP & WebSocket Echo Service...');

  // 1. Instantiate the Service
  const service = new Service();

  // 2. Instantiate Plugins
  const httpPlugin = new HttpPlugin();
  const webSocketPlugin = new WebSocketPlugin();

  // 3. Register Plugins
  const httpConfig: PluginConfig = { port: HTTP_PORT };
  const wsConfig: PluginConfig = { port: WS_PORT };
  
  service.registerPlugin(httpPlugin);
  service.registerPlugin(webSocketPlugin);

  // 4. Configure HTTP Functionality
  // Using registerRoute for a specific echo endpoint
  httpPlugin.registerRoute('get', '/echo/:message', (req, res) => {
    const messageToEcho = req.params.message;
    Logger.info(`HTTP: Echoing message: ${messageToEcho}`);
    res.json({ echo: messageToEcho });
  });

  // Fallback/root path handler using onMessage
  httpPlugin.onMessage((msg: Message) => {
    const payload = msg as unknown as HttpMessagePayload; // Cast from unknown
    const { request, response } = payload;

    if (request.path === '/') {
      Logger.info(`HTTP: Root path requested from ${request.ip}`);
      response.json({ message: 'Welcome to the MSA Echo Service. Use /echo/:message for HTTP echo, or connect via WebSocket.' });
    } else {
      // This generic handler will be called for routes not specifically registered
      // if HttpPlugin's internal catch-all is reached.
      // We could also choose to send a 404 here if not already handled by Express.
      Logger.warn(`HTTP: Unhandled path: ${request.path}`);
      if (!response.headersSent) {
        response.status(404).json({ error: 'Not Found' });
      }
    }
  });

  // 5. Configure WebSocket Functionality
  webSocketPlugin.onMessage(async (msg: Message) => {
    // Here, msg is unknown. We need to cast it to WebSocketMessagePayload.
    // The actual WebSocketMessagePayload interface is defined in WebSocketPlugin.ts
    // For this example, we assume its structure.
    const payload = msg as unknown as WebSocketMessagePayload; 
    
    const clientId = payload.clientId;
    const data = payload.data; // This is RawData
    const isBinary = payload.isBinary;

    let messageToEcho: string | Buffer;
    if (isBinary) {
      messageToEcho = data as Buffer; // Echo binary data as is
      Logger.info(`WebSocket: Echoing binary data from client ${clientId}`);
    } else {
      messageToEcho = data.toString(); // Echo text data
      Logger.info(`WebSocket: Echoing text message from client ${clientId}: ${messageToEcho}`);
    }

    try {
      // Echo back to the same client
      await webSocketPlugin.sendToClient(clientId, messageToEcho);
    } catch (error) {
      Logger.error(`WebSocket: Failed to send echo to client ${clientId}`, error);
    }
  });

  // 6. Initialize and Start the Service
  try {
    await service.initializeService({
      [httpPlugin.name]: httpConfig,
      [webSocketPlugin.name]: wsConfig,
    });
    await service.startService(); // This will call listen on transport plugins

    Logger.info(`HTTP Echo Service listening on port ${HTTP_PORT}`);
    Logger.info(`WebSocket Echo Service listening on port ${WS_PORT}`);
    Logger.info('Service started successfully.');

  } catch (error) {
    Logger.error('Failed to start the echo service:', error);
    process.exit(1);
  }

  // Keep the service running (e.g., for WebSocket connections)
  // The graceful shutdown is handled by the Service class for SIGINT/SIGTERM
}

main().catch(error => {
  Logger.error('Unhandled error in main execution:', error);
  process.exit(1);
});
