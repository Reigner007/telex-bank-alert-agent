/**
 * ============================================
 * BANK ALERT MATCHER AGENT
 * ============================================
 * 
 * ROLE: The orchestrator that ties everything together
 * 
 * This is the Mastra Agent that:
 * 1. Coordinates the entire matching workflow
 * 2. Manages state and metrics
 * 3. Gets called by the A2A route handler
 * 4. Returns structured results
 * 
 * WORKFLOW:
 * 1. Receives bank emails and transaction list from Telex (via A2A)
 * 2. Parses emails using BankAlertParser
 * 3. Matches alerts to transactions using TransactionMatcher
 * 4. Tracks accuracy metrics
 * 5. Returns match results with confidence scores
 * 
 * WHY A SEPARATE CLASS:
 * - Encapsulates the core business logic
 * - Can be used standalone or as a Mastra Agent
 * - Makes testing easier
 * - Separation of concerns
 */

import { Agent } from '@mastra/core';
import { BankAlertParser } from '../services/bank-parser.js';
import { TransactionMatcher, type Transaction, type MatchResult } from '../services/transaction-matcher.js';
import type { BankAlert } from '../services/bank-parser.js';

/**
 * Agent Metrics Interface
 */
export interface AgentMetrics {
  totalAlerts: number;
  matchedAlerts: number;
  accuracy: number;
  lastRun: Date;
}

/**
 * Agent Configuration Interface
 */
export interface AgentConfig {
  bankTypes?: string[];
  timeWindowMs?: number;
  amountTolerance?: number;
  confidenceThreshold?: number;
}

/**
 * TelexBankAlertMatcherAgent
 * 
 * Main orchestrator for the bank alert matching workflow.
 * Combines parsing, matching, and metrics tracking.
 */
export class TelexBankAlertMatcherAgent {
  // Core services
  private parser: BankAlertParser;
  private matcher: TransactionMatcher;

  // Metrics tracking
  private metrics: AgentMetrics = {
    totalAlerts: 0,
    matchedAlerts: 0,
    accuracy: 0,
    lastRun: new Date(),
  };

  // Configuration
  private config: Required<AgentConfig> = {
    bankTypes: ['gtbank', 'access'],
    timeWindowMs: 15 * 60 * 1000,          // 15 minutes
    amountTolerance: 0.02,                 // 2%
    confidenceThreshold: 0.6,              // 60%
  };

  // The Mastra Agent instance
  private agent: Agent;

  /**
   * Initialize the agent
   * 
   * @param config - Optional configuration overrides
   */
  constructor(config?: AgentConfig) {
    // Initialize services
    this.parser = new BankAlertParser();
    this.matcher = new TransactionMatcher();

    // Apply configuration
    if (config) {
      this.config = { ...this.config, ...config };
    }

    // Create Mastra Agent
    // This agent is what actually gets registered with Mastra framework
    this.agent = new Agent({
      name: 'Bank Alert Matcher',
      instructions: `
        You are a bank alert matching agent. Your primary responsibilities are:
        
        1. **Parse Bank Alerts**: Extract structured data from bank email alerts
           - Amount, timestamp, account number, transaction type
           - Support multiple bank formats (GTBank, Access, FirstBank, etc)
        
        2. **Match Transactions**: Match alerts to transactions from the polled list
           - Use confidence scoring based on amount, account, time, description
           - Maintain 80%+ accuracy rate
           - Handle edge cases and ambiguities
        
        3. **Track Metrics**: Monitor and report performance
           - Total alerts processed
           - Successful matches
           - Accuracy percentage
           - Last run timestamp
        
        4. **Return Structured Results**:
           - Include confidence scores for each match
           - Provide detailed breakdown of scoring
           - Mark matches as successful only if above threshold
        
        Always prioritize:
        - Accuracy over speed
        - Clear explanations of why matches succeeded/failed
        - Handling of ambiguous cases gracefully
        - Privacy of financial data
      `,
      model: 'gpt-4o',
    });
  }

  /**
   * Process a batch of bank alerts
   * 
   * Main workflow:
   * 1. Parse raw emails into structured BankAlert objects
   * 2. For each alert, find the best matching transaction
   * 3. Return match results with metrics
   * 
   * @param emails - Array of raw email texts from banks
   * @param transactions - Array of polled transactions to match against
   * @param bankType - Which bank format to parse (default: gtbank)
   * @returns Array of match results with metrics
   */
  async processAlerts(
    emails: string[],
    transactions: Transaction[],
    bankType: string = 'gtbank'
  ): Promise<MatchResult[]> {
    // ========== PARSE EMAILS INTO ALERTS ==========
    const alerts: BankAlert[] = emails.map((email, idx) => ({
      id: `alert-${Date.now()}-${idx}`,
      ...(this.parser.parseEmail(email, bankType) as BankAlert),
    }));

    // ========== MATCH EACH ALERT TO TRANSACTIONS ==========
    const results: MatchResult[] = [];

    for (const alert of alerts) {
      // Get all matches sorted by confidence
      const matches = this.matcher.findMatches(alert, transactions);

      // Take the best match (or null if none above threshold)
      const bestMatch = matches[0];

      results.push(bestMatch);

      // ========== UPDATE METRICS ==========
      this.metrics.totalAlerts++;
      if (bestMatch.matched) {
        this.metrics.matchedAlerts++;
      }
    }

    // ========== CALCULATE ACCURACY ==========
    // Accuracy = (matched alerts / total alerts) * 100
    this.metrics.accuracy =
      this.metrics.totalAlerts > 0
        ? this.metrics.matchedAlerts / this.metrics.totalAlerts
        : 0;

    // ========== UPDATE LAST RUN TIME ==========
    this.metrics.lastRun = new Date();

    return results;
  }

  /**
   * Get current agent metrics
   * 
   * Useful for monitoring performance and accuracy over time.
   */
  getMetrics(): AgentMetrics {
    return {
      ...this.metrics,
      // Round accuracy to 2 decimal places for display
      accuracy: parseFloat(this.metrics.accuracy.toFixed(2)),
    };
  }

  /**
   * Reset metrics to initial state
   * 
   * Useful for testing or when starting a new batch.
   */
  resetMetrics(): void {
    this.metrics = {
      totalAlerts: 0,
      matchedAlerts: 0,
      accuracy: 0,
      lastRun: new Date(),
    };
  }

  /**
   * Get the underlying Mastra Agent
   * 
   * Needed to register with Mastra instance for A2A endpoint.
   */
  getAgent(): Agent {
    return this.agent;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<AgentConfig> {
    return this.config;
  }

  /**
   * Update configuration
   * 
   * Allows changing matching parameters at runtime.
   */
  updateConfig(newConfig: Partial<AgentConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Check if we're meeting accuracy target
   * 
   * Target is 80% accuracy.
   */
  isMeetingTarget(): boolean {
    return this.metrics.accuracy >= 0.8;
  }

  /**
   * Get a summary report of agent performance
   * 
   * Useful for monitoring and debugging.
   */
  getSummaryReport(): string {
    const metrics = this.getMetrics();
    const target = this.isMeetingTarget() ? '✅' : '⚠️';

    return `
    ========== BANK ALERT MATCHER REPORT ==========
    Total Alerts Processed: ${metrics.totalAlerts}
    Successfully Matched: ${metrics.matchedAlerts}
    Accuracy: ${(metrics.accuracy * 100).toFixed(2)}% ${target}
    Target (80%): ${this.isMeetingTarget() ? 'ACHIEVED' : 'NOT YET'}
    Last Run: ${metrics.lastRun.toISOString()}
    ===============================================
    `.trim();
  }
}

// Export instance creation function for use in Mastra setup
export function createBankAlertAgent(config?: AgentConfig): TelexBankAlertMatcherAgent {
  return new TelexBankAlertMatcherAgent(config);
}