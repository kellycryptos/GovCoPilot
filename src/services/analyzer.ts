import { Groq } from 'groq-sdk';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GROQ_API_KEY;
const groq = new Groq({ apiKey });

export interface ProposalInput {
  proposalText: string;
  proposalTitle?: string;
  chain?: string;
  daoContext?: string;
  treasurySnapshot?: string;
}

export interface ProposalAnalysisResult {
  proposalSummary: string;
  analysis: {
    strategicAlignment: string;
    financialImpact: string;
    securityRisks: string;
    opportunities: string;
  };
  votingRecommendation: {
    vote: 'YES' | 'NO' | 'ABSTAIN';
    confidence: number; // 0.0 to 1.0
    reasoning: string;
  };
  executionGuidance: {
    steps: string[];
    xLayerOptimizations?: string;
    calldataHint?: string;
  };
}

export async function analyzeProposal(input: ProposalInput): Promise<ProposalAnalysisResult> {
  if (!apiKey) {
    throw new Error('GROQ_API_KEY is not defined in environment variables.');
  }

  const model = process.env.GROQ_MODEL || 'llama-3.3-70b-specdec';

  const systemPrompt = `You are GovCoPilot, an expert AI agent specializing in DAO governance, risk assessment, and onchain execution. Your job is to analyze governance proposals and recommend voting strategies with high precision.

You must output a valid JSON object matching the schema below. Do not include any markdown styling, conversational filler, or wrap the JSON in code blocks. Return ONLY the JSON object.

JSON Schema:
{
  "proposalSummary": "A concise summary of the proposal goals and actions.",
  "analysis": {
    "strategicAlignment": "Detailed evaluation of how this aligns with the DAO's objectives or standard governance principles.",
    "financialImpact": "Analysis of treasury implications, funding costs, or tokenomics impact.",
    "securityRisks": "Potential vulnerabilities, attack vectors, or regulatory/operational risks.",
    "opportunities": "Growth, efficiency, or value-creation potential."
  },
  "votingRecommendation": {
    "vote": "YES" | "NO" | "ABSTAIN",
    "confidence": 0.85, // A decimal between 0.0 and 1.0 representing recommendation confidence
    "reasoning": "Clear, objective explanation of why this vote is recommended."
  },
  "executionGuidance": {
    "steps": [
      "Step 1: Description of what action is needed.",
      "Step 2: Next chronological action."
    ],
    "xLayerOptimizations": "Specific guidelines if executing on X Layer (EVM compatibility, gas efficiency, fast finality benefits, low-fee options, or contract address structure). Include this only if the chain is X Layer or detected as EVM.",
    "calldataHint": "EVM-compatible calldata template or pseudocode representation of the transaction payload (e.g. target contract, function signature, and arguments)."
  }
}`;

  const userMessage = `Please analyze the following proposal:
Title: ${input.proposalTitle || 'Untitled Proposal'}
Chain: ${input.chain || 'EVM / Not Specified'}

[PROPOSAL TEXT]
${input.proposalText}

[DAO CONTEXT]
${input.daoContext || 'None provided. Analyze using standard DAO governance best practices.'}

[TREASURY SNAPSHOT]
${input.treasurySnapshot || 'None provided. Assume typical treasury structure.'}

Provide your analysis, strategic voting recommendation, and execution steps (optimized for ${input.chain || 'the specified chain'}).`;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      model: model,
      response_format: { type: 'json_object' },
      temperature: 0.1,
    });

    const content = chatCompletion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Groq returned empty response.');
    }

    return JSON.parse(content) as ProposalAnalysisResult;
  } catch (error) {
    console.error('Error during Groq API call:', error);
    throw error;
  }
}
