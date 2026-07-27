import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { analyzeProposal } from '../src/services/analyzer.js';

const ASP_AGENT_ID = '5965';

async function autoDeliverAcceptedTasks() {
  console.log(`[ASP Auto-Deliver] Checking in-progress tasks for ASP #${ASP_AGENT_ID}...`);

  try {
    const rawStatus = execSync(`onchainos agent task-in-progress --agent-ids ${ASP_AGENT_ID}`, {
      encoding: 'utf-8',
    });
    const parsed = JSON.parse(rawStatus);

    if (!parsed.ok || !parsed.data) {
      console.log('[ASP Auto-Deliver] No task data returned.');
      return;
    }

    const providerTasks = parsed.data.providerTasks || [];
    console.log(`[ASP Auto-Deliver] Found ${providerTasks.length} active provider task(s).`);

    for (const task of providerTasks) {
      const jobId = task.jobId || task.id;
      const status = task.statusStr || task.status;

      console.log(`[ASP Auto-Deliver] Task ${jobId} status: ${status}`);

      // If task is accepted or in progress, auto-generate and upload deliverable
      if (status === 'accepted' || status === '1' || status === 1) {
        console.log(`[ASP Auto-Deliver] Processing async deliverable for ${jobId}...`);

        const title = task.title || 'DAO Governance Proposal Analysis';
        const description = task.description || task.summary || 'DAO governance evaluation request.';

        const analysisResult = await analyzeProposal({
          proposalTitle: title,
          proposalText: description,
          chain: 'ethereum',
          daoContext: 'DAO Governance Protocol',
        });

        // Save deliverable file locally
        const scratchDir = path.join(process.cwd(), 'scratch');
        if (!fs.existsSync(scratchDir)) {
          fs.mkdirSync(scratchDir, { recursive: true });
        }
        const deliverablePath = path.join(scratchDir, `deliverable_${jobId.slice(0, 10)}.json`);
        fs.writeFileSync(deliverablePath, JSON.stringify(analysisResult, null, 2), 'utf-8');

        // Save deliverable to task-deliverable-list
        execSync(
          `onchainos agent task-deliverable-save --job-id ${jobId} --role asp --file "${deliverablePath}" --title "${title} Deliverable" --short-id "${jobId.slice(0, 10)}" --counterparty-agent-id ${task.buyerAgentId || 'user'} --token-symbol USDT --token-amount 0.05`,
          { stdio: 'inherit' }
        );

        console.log(`[ASP Auto-Deliver] Deliverable successfully saved to task-deliverable-list for ${jobId}!`);
      }
    }
  } catch (error: any) {
    console.error('[ASP Auto-Deliver] Error processing tasks:', error.message || error);
  }
}

autoDeliverAcceptedTasks();
