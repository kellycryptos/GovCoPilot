# GovCoPilot

**Autonomous DAO Governance Co-Pilot, built on X Layer**

GovCoPilot is an Agent Service Provider (ASP) that analyzes DAO governance proposals and returns a structured, machine-readable recommendation ,strategic alignment, security risk assessment, a confidence-scored vote recommendation, and ready-to-execute EVM calldata ,all via a single x402-paid API call.

Built for the agent-to-agent economy: instead of a human reading proposal documentation, an AI agent calls GovCoPilot's endpoint, pays per-call in testnet OKB/USDC via x402, and receives back everything it needs to make and execute a governance decision autonomously ,no negotiation, no human in the loop.

GovCoPilot is built on infrastructure proven by SynArc, a DAO governance platform with 900+ real proposals on Arc Testnet, and is optimized for X Layer's fast finality and low fees, with native OKX Agentic Wallet integration for programmatic per-call payments.

---

## The Problem

DAO governance today is broken for both humans and agents:

- **Governance fatigue** — reviewing hundreds of pages of proposal documentation per vote leads to low turnout and unvetted decisions.
- **Treasury security risk** — malicious proposals can drain funds via obfuscated router updates or contract upgrades.
- **No agent-native tooling** — AI agents have no standardized way to analyze a proposal and generate an executable transaction.

GovCoPilot gives any agent a single, paid, standardized endpoint to solve both.

---

## Live Demo

- **Playground:** https://gov-copilot.vercel.app/#playground (payment bypassed for testing — see below)
- **GitHub:** https://github.com/kellycryptos/GovCoPilot

---

## Network & Deployment Details

| Field | Value |
|---|---|
| Network | X Layer **Testnet** |
| Chain ID | `195` |
| RPC URL | `https://xlayertestrpc.okx.com` |
| Payment Address (ASP wallet) | `0xC91766bfeB093cF177936E95FF187FF7Cc13fe5b` |
| Payment amount per call | 0.05 (native token/USDC, testnet) |
| Smart contract | None — payment is a direct EOA-to-EOA transfer, verified onchain by tx hash |

> This is a testnet deployment. No real funds are used or at risk. The payment address above is a wallet controlled by the project maintainer for testnet demo purposes only.

---

## API Reference

**Endpoint:** `POST /api/analyze_governance_proposal`

**Required header (after payment):** `X-Payment-Tx-Hash`

### x402 Flow

1. Call the endpoint without a tx hash header.
2. Receive `402 Payment Required` with payment coordinates in the response headers/body.
3. Broadcast payment on X Layer Testnet (native token/USDC) to the address above.
4. Retry the request including the transaction hash in the `X-Payment-Tx-Hash` header.

### cURL Example

```bash
# 1. Probe the endpoint to get payment coordinates
curl -i -X POST https://gov-copilot.vercel.app/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -d '{"proposalText": "Upgrade main governance contract"}'

# Response includes headers:
# X-Payment-Address: 0xC91766bfeB093cF177936E95FF187FF7Cc13fe5b
# X-Payment-Amount: 0.05
# X-Payment-Chain-Id: 195

# 2. Re-send once you submit the tx onchain with the Tx Hash
curl -X POST https://gov-copilot.vercel.app/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx-Hash: 0xYOUR_TX_HASH" \
  -d '{"proposalText": "Upgrade main governance contract", "chain": "x-layer"}'
```

### Example Response

```json
{
  "proposalSummary": "Upgrades Governor router to V2 on X Layer...",
  "analysis": {
    "strategicAlignment": "High alignment. Improves gas efficiency...",
    "financialImpact": "...",
    "securityRisks": "No immediate smart contract risks identified...",
    "opportunities": "..."
  },
  "votingRecommendation": {
    "vote": "YES",
    "confidence": 0.94,
    "reasoning": "Saves 15% transaction fees and boosts router stability."
  },
  "executionGuidance": {
    "steps": ["Submit vote transaction to X Layer Governor at contract 0xabc..."],
    "xLayerOptimizations": "Verify transaction has finality on block height > 50000.",
    "calldataHint": "cast send 0xabc... 'castVote(uint256,uint8)' 42 1"
  }
}
```

---

## Playground (Testing Without Payment)

The live playground bypasses payment for judges/testers via an internal `X-Playground-Request` header — no on-chain transaction required to try the analysis engine. Real agent-to-agent calls outside the playground still require the full x402 payment flow described above.

---

## Environment Variables

See `.env.example` for required variables. Notably:

- `ASP_WALLET_ADDRESS` — the testnet wallet receiving x402 payments
- `CHAIN_ID` — `195` (X Layer Testnet)
- `GROQ_API_KEY` — server-side only, never exposed to the client

---

## Status

- Registered as an Agent-to-MCP (A2MCP) Agent Service Provider on OKX.AI via Onchain OS and OKX Agentic Wallet.
- Currently in testnet deployment.
- No external fundraising to date — self-funded, built as part of the SynArc ecosystem.

---

## License

MIT
