import { Service, Logger, PluginConfig, IPlugin } from '@arifwidianto/msa-core';
import { HttpPlugin } from '@arifwidianto/msa-plugin-http';
import axios from 'axios';
import { Request, Response } from 'express';

const POST_SERVICE_PORT = 3003;
const USER_SERVICE_BASE_URL = 'http://localhost:3002'; // As defined in user-service

interface Post {
  id: number;
  userId: number;
  title: string;
  content?: string; // Optional
}

interface User {
  id: number;
  name: string;
  email?: string;
}

interface EnrichedPost extends Omit<Post, 'userId'> {
  user: Partial<User>; // User details might be partial or just name/id
}

// In-memory post store
const posts: Post[] = [
  { id: 101, userId: 1, title: 'Alice\'s First Post', content: 'Hello from Alice!' },
  { id: 102, userId: 2, title: 'Bob\'s Thoughts', content: 'MSA framework is interesting.' },
  { id: 103, userId: 1, title: 'Alice\'s Second Post', content: 'Working with microservices.' },
  { id: 104, userId: 3, title: 'Charlie\'s Musings', content: 'Thinking about system design.' },
];

async function main() {
  Logger.info('Starting Post Service...');

  const service = new Service();
  const httpPlugin = new HttpPlugin();

  const httpConfig: PluginConfig = { port: POST_SERVICE_PORT };
  service.registerPlugin(httpPlugin);

  // API Endpoint: GET /posts/user/:userId
  httpPlugin.registerRoute('get', '/posts/user/:userId', (req: Request, res: Response) => {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID format.' });
    }
    const userPosts = posts.filter(p => p.userId === userId);
    Logger.info(`Post Service: Found ${userPosts.length} posts for user ${userId}`);
    res.status(200).json(userPosts);
  });

  // API Endpoint: GET /posts/:id
  httpPlugin.registerRoute('get', '/posts/:id', async (req: Request, res: Response) => {
    const postId = parseInt(req.params.id, 10);
    if (isNaN(postId)) {
      return res.status(400).json({ error: 'Invalid post ID format.' });
    }

    const post = posts.find(p => p.id === postId);

    if (!post) {
      Logger.warn(`Post Service: Post ${postId} not found.`);
      return res.status(404).json({ error: `Post with ID ${postId} not found.` });
    }

    try {
      Logger.info(`Post Service: Fetching user details for userId ${post.userId} from User Service.`);
      const userResponse = await axios.get<User>(`${USER_SERVICE_BASE_URL}/users/${post.userId}`);
      
      if (userResponse.status === 200 && userResponse.data) {
        const enrichedPost: EnrichedPost = {
          id: post.id,
          title: post.title,
          content: post.content,
          user: {
            id: userResponse.data.id,
            name: userResponse.data.name,
            // email: userResponse.data.email // Can include more fields if needed
          },
        };
        Logger.info(`Post Service: Successfully fetched user details for post ${postId}. User: ${userResponse.data.name}`);
        return res.status(200).json(enrichedPost);
      } else {
        // User not found or other error from user service
        Logger.warn(`Post Service: User ${post.userId} not found in User Service (status: ${userResponse.status}). Returning post without full user details.`);
        const partialEnrichedPost: EnrichedPost = {
            id: post.id,
            title: post.title,
            content: post.content,
            user: { id: post.userId, name: 'Unknown User (Not Found)' }, // Fallback user data
        };
        return res.status(200).json(partialEnrichedPost); // Or choose to return a 404/500 for the post itself
      }
    } catch (error: any) {
      Logger.error(`Post Service: Error fetching user details for post ${postId} (userId: ${post.userId}). Error: ${error.message}`);
      // Fallback: return post data with minimal user info (or an error)
      const fallbackPost: EnrichedPost = {
        id: post.id,
        title: post.title,
        content: post.content,
        user: { id: post.userId, name: 'Unknown User (Error Fetching)' },
      };
      // Depending on requirements, might return 503 (Service Unavailable for user data) or 200 with partial data.
      // For this example, we return 200 with partial data to show the post still exists.
      return res.status(200).json(fallbackPost);
    }
  });
  
  // Optional: Root path handler
  httpPlugin.onMessage((msg) => {
    const payload = msg as unknown as { request: Request, response: Response};
    if (payload.request.path === '/') {
        payload.response.json({ message: 'Post Service is active. Use /posts/user/:userId or /posts/:id.' });
    } else {
        if (!payload.response.headersSent) {
            payload.response.status(404).json({ error: 'Post Service: Endpoint not found.'});
        }
    }
  });

  try {
    await service.initializeService({
      [httpPlugin.name]: httpConfig,
    });
    await service.startService();

    Logger.info(`Post Service with HTTP API listening on port ${POST_SERVICE_PORT}`);
    Logger.info('Post Service started successfully.');

  } catch (error) {
    Logger.error('Failed to start the Post Service:', error);
    process.exit(1);
  }
}

main().catch(error => {
  Logger.error('Unhandled error in Post Service main execution:', error);
  process.exit(1);
});
