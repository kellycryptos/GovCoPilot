import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const DELIVERABLES_DIR = path.join(process.cwd(), 'data');
const DELIVERABLES_FILE = path.join(DELIVERABLES_DIR, 'deliverables.json');

export interface DeliverableRecord {
  jobId: string;
  proposalTitle: string;
  proposalText: string;
  votingRecommendation: {
    vote: 'YES' | 'NO' | 'ABSTAIN';
    confidence: number;
    reasoning: string;
  };
  proposalSummary: string;
  analysis: {
    strategicAlignment: string;
    financialImpact: string;
    securityRisks: string;
    opportunities: string;
  };
  executionGuidance: {
    steps: string[];
    xLayerOptimizations?: string;
    calldataHint?: string;
  };
  timestamp: string;
  status: 'SUBMITTED' | 'ACCEPTED' | 'COMPLETED';
}

function ensureStorageExists() {
  if (!fs.existsSync(DELIVERABLES_DIR)) {
    fs.mkdirSync(DELIVERABLES_DIR, { recursive: true });
  }
  if (!fs.existsSync(DELIVERABLES_FILE)) {
    fs.writeFileSync(DELIVERABLES_FILE, JSON.stringify([]), 'utf8');
  }
}

export function saveDeliverable(record: DeliverableRecord): DeliverableRecord {
  ensureStorageExists();
  const raw = fs.readFileSync(DELIVERABLES_FILE, 'utf8');
  let list: DeliverableRecord[] = [];
  try {
    list = JSON.parse(raw);
  } catch {
    list = [];
  }

  // Deduplicate by jobId
  const existingIdx = list.findIndex((d) => d.jobId === record.jobId);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...record };
  } else {
    list.unshift(record);
  }

  fs.writeFileSync(DELIVERABLES_FILE, JSON.stringify(list, null, 2), 'utf8');

  // Write individual json file per jobId for CLI deliverable compatibility
  const jobFile = path.join(DELIVERABLES_DIR, `deliverable_${record.jobId}.json`);
  fs.writeFileSync(jobFile, JSON.stringify(record, null, 2), 'utf8');

  // Try calling onchainos task-deliverable-save in background
  try {
    const shortId = record.jobId.slice(0, 10);
    const titleClean = (record.proposalTitle || 'Proposal').replace(/"/g, "'").slice(0, 30);
    const cmd = `onchainos agent task-deliverable-save --job-id "${record.jobId}" --role asp --file "${jobFile}" --title "${titleClean}" --short-id "${shortId}"`;
    exec(cmd, (err) => {
      if (err) {
        console.warn(`[OKX Deliverable Save Warning] Could not register with onchainos CLI: ${err.message}`);
      } else {
        console.log(`[OKX Deliverable Save Success] Registered deliverable for job ${record.jobId} with onchainos CLI`);
      }
    });
  } catch (e: any) {
    console.warn(`[OKX Deliverable Save Exception] ${e.message}`);
  }

  return record;
}

export function getDeliverable(jobId: string): DeliverableRecord | undefined {
  ensureStorageExists();
  const raw = fs.readFileSync(DELIVERABLES_FILE, 'utf8');
  try {
    const list: DeliverableRecord[] = JSON.parse(raw);
    return list.find((d) => d.jobId === jobId || d.jobId.toLowerCase() === jobId.toLowerCase());
  } catch {
    return undefined;
  }
}

export function listDeliverables(): DeliverableRecord[] {
  ensureStorageExists();
  const raw = fs.readFileSync(DELIVERABLES_FILE, 'utf8');
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

/**
 * Attempt to retrieve task context (title/description) from OKX CLI or backend
 * given a jobId when an empty-body direct-accept call arrives.
 */
export async function fetchTaskContextFromOKX(jobId: string, aspAgentId: string = '5965'): Promise<{ title?: string; text?: string } | null> {
  try {
    console.log(`[OKX Task Context] Attempting to fetch task description for job ${jobId} via onchainos common context...`);
    const { stdout } = await execAsync(`onchainos agent common context ${jobId} --role asp --agent-id ${aspAgentId}`);
    if (stdout && stdout.trim().length > 0) {
      console.log(`[OKX Task Context] Successfully retrieved context for job ${jobId}`);
      return {
        title: `OKX Task ${jobId}`,
        text: stdout.trim(),
      };
    }
  } catch (err: any) {
    console.warn(`[OKX Task Context Warning] Could not fetch task context for job ${jobId}: ${err.message}`);
  }

  try {
    console.log(`[OKX Task Context] Fallback: Checking onchainos status for job ${jobId}...`);
    const { stdout } = await execAsync(`onchainos agent status ${jobId} --agent-id ${aspAgentId}`);
    if (stdout && stdout.trim().length > 0) {
      const parsed = JSON.parse(stdout);
      const text = parsed.description || parsed.serviceParams || parsed.taskDescription || parsed.title;
      if (text) {
        return {
          title: parsed.title || `OKX Task ${jobId}`,
          text: text,
        };
      }
    }
  } catch (err: any) {
    console.warn(`[OKX Task Context Warning] Status lookup failed for job ${jobId}: ${err.message}`);
  }

  return null;
}
