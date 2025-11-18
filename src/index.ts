/**
 * ============================================
 * MAIN ENTRY POINT - MASTRA INITIALIZATION
 * ============================================
 */

// Disable telemetry warnings (harmless, but cleans up output)
globalThis.___MASTRA_TELEMETRY___ = true;
console.log('Env check → IMAP_USER:', process.env.IMAP_USER ? 'loaded' : 'missing');
console.log('Env check → OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'loaded' : 'missing');

import dotenv from 'dotenv';
import { Mastra } from '@mastra/core/mastra';  // Subpath for Mastra class
import { createBankAlertAgent } from './agents/bank-alert-agent.js';
import type { Transaction } from './services/transaction-matcher.js';  // For self-test

dotenv.config();

const bankAlertAgent = createBankAlertAgent();

export const mastra = new Mastra({
  agents: {
    bankAlertMatcher: bankAlertAgent.getAgent(),
  },
  // Optional: Auto-start server for A2A endpoint (runs on port 3000)
  server: {
    port: Number(process.env.PORT) || 3000,
  },
});

console.log('');
console.log('✅ Telex Bank Alert Agent initialized successfully');
console.log('');
console.log('🔧 Agent Configuration:');
console.log('   - Name: Bank Alert Matcher');
console.log('   - Model: gpt-4o');
console.log('   - Purpose: Match bank alerts to transactions');
console.log('');
console.log('📊 Current Metrics:');
const metrics = bankAlertAgent.getMetrics();
console.log(`   - Total Alerts: ${metrics.totalAlerts}`);
console.log(`   - Matched Alerts: ${metrics.matchedAlerts}`);
console.log(`   - Accuracy: ${(metrics.accuracy * 100).toFixed(2)}%`);
console.log('');
console.log('🚀 Ready to process bank alerts');
console.log('');

// Quick self-test (runs 1s after startup — optional, comment out if annoying)
setTimeout(async () => {
  console.log('\n🧪 Quick self-test (sample alert match)...\n');
  const sampleEmails = [
    `Subject: GTBank Alert\nAmount: NGN 1,250.00\nDate: 2025-11-10 14:32\nDescription: Transfer to ACME Corp`,
  ];
  const sampleTransactions: Transaction[] = [
    {
      id: 'tx-001',
      amount: 1250,
      currency: 'NGN',
      date: new Date('2025-11-10T14:32:00Z'),
      description: 'Transfer to ACME Corp',
      account: '1234567890',
    },
  ];
  try {
    const results = await bankAlertAgent.processAlerts(sampleEmails, sampleTransactions, 'gtbank');
    results.forEach((r, i) => {
      console.log(`  Alert ${i + 1}: ${r.matched ? '✅ Matched' : '❌ Unmatched'} (confidence: ${(r.confidence * 100).toFixed(1)}%)`);
    });
    console.log(`\nUpdated Metrics: Total ${bankAlertAgent.getMetrics().totalAlerts} | Matched ${bankAlertAgent.getMetrics().matchedAlerts} | Accuracy ${(bankAlertAgent.getMetrics().accuracy * 100).toFixed(2)}%`);
  } catch (err) {
    console.error('Self-test error:', err);
  }
}, 1000);

export { bankAlertAgent };