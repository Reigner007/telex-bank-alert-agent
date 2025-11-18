/**
 * ============================================
 * A2A ROUTE HANDLER
 * ============================================
 * 
 * ROLE: HTTP endpoint that Telex communicates with via A2A protocol
 * 
 * This route:
 * 1. Receives JSON-RPC 2.0 requests from Telex
 * 2. Validates the request format
 * 3. Extracts email and transaction data
 * 4. Calls the bank alert agent
 * 5. Formats response according to A2A protocol
 * 6. Returns to Telex
 * 
 * Note: We'll set this up as an Express/Hono route when needed
 */

import { randomUUID } from 'crypto';
import { TelexBankAlertMatcherAgent } from './bank-alert-agent.js';
import type { Transaction, MatchResult } from '../services/transaction-matcher.js';

/**
 * A2A Request Types
 */
export interface A2AMessage {
  kind: 'message';
  role: 'user' | 'agent';
  parts: A2APart[];
  messageId?: string;
  taskId?: string;
}

export interface A2APart {
  kind: 'text' | 'data';
  text?: string;
  data?: unknown;
}

export interface A2ARequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: {
    message?: A2AMessage;
    messages?: A2AMessage[];
    emails?: string[];
    transactions?: Transaction[];
    bankType?: string;
    contextId?: string;
    taskId?: string;
    metadata?: Record<string, unknown>;
  };
}

export interface A2AResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: {
    id: string;
    contextId: string;
    status: {
      state: 'completed' | 'processing' | 'error';
      timestamp: string;
      message: A2AMessage;
    };
    artifacts: A2AArtefact[];
    history: unknown[];
    kind: 'task';
  };
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface A2AArtefact {
  artifactId: string;
  name: string;
  parts: A2APart[];
}

/**
 * Process A2A Request
 * 
 * This is the main handler that processes JSON-RPC 2.0 requests
 * 
 * @param agent - The bank alert agent instance
 * @param body - The A2A request body
 * @returns A2A response
 */
export async function processA2ARequest(
  agent: TelexBankAlertMatcherAgent,
  body: A2ARequest
): Promise<A2AResponse> {
  try {
    // ========== VALIDATE REQUEST ==========
    const { jsonrpc, id: requestId, params } = body;

    // Check JSON-RPC 2.0 compliance
    if (jsonrpc !== '2.0' || !requestId) {
      return {
        jsonrpc: '2.0',
        id: requestId || null,
        error: {
          code: -32600,
          message: 'Invalid Request: jsonrpc must be "2.0" and id is required',
        },
      };
    }

    // ========== EXTRACT PARAMETERS ==========
    const {
      message,
      messages,
      emails,
      transactions,
      bankType = 'gtbank',
      contextId,
      taskId,
    } = params || {};

    // ========== BUILD MESSAGE LIST ==========
    let messagesList: A2AMessage[] = [];
    if (message) {
      messagesList = [message];
    } else if (messages && Array.isArray(messages)) {
      messagesList = messages;
    }

    // ========== PROCESS ALERTS IF PROVIDED ==========
    let matchResults: MatchResult[] = [];
    let processingError: string | null = null;

    if (emails && Array.isArray(emails) && transactions && Array.isArray(transactions)) {
      try {
        matchResults = await agent.processAlerts(emails, transactions, bankType);
      } catch (error) {
        processingError = error instanceof Error ? error.message : 'Unknown error';
      }
    }

    // ========== BUILD RESPONSE ARTIFACTS ==========
    const artifacts: A2AArtefact[] = [];

    // Main response artifact
    artifacts.push({
      artifactId: randomUUID(),
      name: 'BankAlertMatcherResponse',
      parts: [
        {
          kind: 'text',
          text: `Processed ${matchResults.length} alerts. ${agent.getMetrics().matchedAlerts} successfully matched. Accuracy: ${(agent.getMetrics().accuracy * 100).toFixed(2)}%`,
        },
      ],
    });

    // Match results artifact
    if (matchResults.length > 0) {
      artifacts.push({
        artifactId: randomUUID(),
        name: 'BankAlertMatches',
        parts: [
          {
            kind: 'data',
            data: {
              matches: matchResults,
              summary: {
                total: matchResults.length,
                matched: matchResults.filter(m => m.matched).length,
                accuracy: agent.getMetrics().accuracy,
              },
            },
          },
        ],
      });
    }

    // Metrics artifact
    artifacts.push({
      artifactId: randomUUID(),
      name: 'AgentMetrics',
      parts: [
        {
          kind: 'data',
          data: agent.getMetrics(),
        },
      ],
    });

    // Error artifact if there was an error
    if (processingError) {
      artifacts.push({
        artifactId: randomUUID(),
        name: 'ProcessingError',
        parts: [
          {
            kind: 'text',
            text: `Error during processing: ${processingError}`,
          },
        ],
      });
    }

    // ========== BUILD CONVERSATION HISTORY ==========
    const history = [
      ...messagesList.map((msg) => ({
        kind: 'message',
        role: msg.role,
        parts: msg.parts,
        messageId: msg.messageId || randomUUID(),
        taskId: msg.taskId || taskId || randomUUID(),
      })),
      {
        kind: 'message',
        role: 'agent',
        parts: [
          {
            kind: 'text',
            text: `Successfully processed ${matchResults.length} bank alerts`,
          },
        ],
        messageId: randomUUID(),
        taskId: taskId || randomUUID(),
      },
    ];

    // ========== BUILD A2A RESPONSE ==========
    const response: A2AResponse = {
      jsonrpc: '2.0',
      id: requestId,
      result: {
        id: taskId || randomUUID(),
        contextId: contextId || randomUUID(),
        status: {
          state: processingError ? 'error' : 'completed',
          timestamp: new Date().toISOString(),
          message: {
            kind: 'message',
            messageId: randomUUID(),
            role: 'agent',
            parts: [
              {
                kind: 'text',
                text: processingError
                  ? `Error: ${processingError}`
                  : `Successfully matched ${matchResults.filter((m) => m.matched).length} of ${matchResults.length} alerts`,
              },
            ],
          },
        },
        artifacts,
        history,
        kind: 'task',
      },
    };

    return response;
  } catch (error) {
    console.error('A2A processing error:', error);

    return {
      jsonrpc: '2.0',
      id: body.id || null,
      error: {
        code: -32603,
        message: 'Internal server error',
        data: {
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
    };
  }
}

/**
 * Helper function to create a test A2A request
 */
export function createTestA2ARequest(
  emails: string[],
  transactions: Transaction[],
  bankType: string = 'gtbank'
): A2ARequest {
  return {
    jsonrpc: '2.0',
    id: `test-${Date.now()}`,
    method: 'message/send',
    params: {
      message: {
        kind: 'message',
        role: 'user',
        parts: [
          {
            kind: 'text',
            text: `Process bank alerts for ${bankType}`,
          },
        ],
        messageId: randomUUID(),
        taskId: randomUUID(),
      },
      emails,
      transactions,
      bankType,
    },
  };
}