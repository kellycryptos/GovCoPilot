# GovCoPilot

**Autonomous DAO Governance Co-Pilot on X Layer Mainnet**

✅ **Listed on OKX.AI — [Agent ID 5965](https://www.okx.ai/agents/5965)**

GovCoPilot is an Agent Service Provider (ASP) that analyzes DAO governance proposals and returns structured, machine-readable recommendations: strategic alignment, financial impact, security risk assessment, a confidence-scored voting recommendation, and ready-to-execute EVM calldata — via x402-paid API calls and Onchain OS agent task marketplace integration.

Built for the autonomous agent economy: instead of a human reading proposal documentation, an AI agent calls GovCoPilot's production endpoint (`https://govcopilot-api.synarcdao.xyz`), pays per-call in USDT0 on X Layer Mainnet (`0x779ded0c9e1022225f8e0630b35a9b54be713736`) via x402, and receives everything needed to execute governance decisions autonomously — zero human in the loop.

GovCoPilot is built by the team behind SynArc, leveraging governance data models from 900+ DAO proposals, and optimized for X Layer's fast finality and low transaction fees.

---

## 🌐 Live Production Deployment

| Parameter | Mainnet Value |
|---|---|
| **Production Endpoint** | `https://govcopilot-api.synarcdao.xyz/api/analyze_governance_proposal` |
| **Health Check Proof** | `https://govcopilot-api.synarcdao.xyz/health` |
| **OKX.AI Listing** | [Agent ID 5965](https://www.okx.ai/agents/5965) |
| **Network** | X Layer Mainnet |
| **Chain ID (CAIP-2)** | `eip155:196` (Numeric: `196`) |
| **RPC URL** | `https://rpc.xlayer.tech` |
| **ASP Wallet Address** | `0xf313dcef4e1e22c01cea636c2631c74eac6e4518` |
| **Payment Asset & Token Address** | `USDT0` (`0x779ded0c9e1022225f8e0630b35a9b54be713736`) |

---

## 🤖 Registered OKX Agent Services & Pricing

GovCoPilot exposes 4 specialized AI Agent services registered on the OKX Agent Marketplace ([#5965](https://www.okx.ai/agents/5965)):

| Service Name | Price (USDT0) | Required Input | Description |
|---|---|---|---|
| 🔍 **DAO Proposal Analysis** | `0.05 USDT` | `proposalText` | Full multi-dimensional DAO proposal analysis returning strategy, security assessment, confidence score, and EVM calldata. |
| 🗳️ **DAO Voting Strategy** | `0.05 USDT` | `proposalTitle`, `proposalText`, `chain` | Fast confidence-scored voting strategy recommendations (YES/NO/ABSTAIN) for DAO proposals on X Layer. |
| 🛡️ **Governance Risk Assessment** | `0.05 USDT` | `proposalTitle`, `proposalText` | Deep security, treasury impact, and smart contract vulnerability risk modeling for governance proposals. |
| ⚙️ **Execution Calldata Generator** | `0.05 USDT` | `proposalTitle`, `proposalText`, `executionContext` | Generates EVM-compatible execution calldata and transaction parameters for approved DAO proposals. |

---

## 🏗️ Architecture & SDK Integration

### Official OKX Payment SDK Integration (`@okxweb3/x402-express`)
GovCoPilot natively integrates the official OKX Payment SDK stack:
- `@okxweb3/x402-express` (v0.1.1) `paymentMiddleware`
- `@okxweb3/x402-core` (v0.1.0) `OKXFacilitatorClient`
- `@okxweb3/x402-evm` (v0.2.1) `ExactEvmScheme`

### Dual-Mode Execution: A2MCP + A2A Support

1. **A2MCP Mode (Instant Pay-Per-Call)**:
   - Client sends POST request → receives HTTP 402 challenge header with `extra: { name: "USD₮0", version: "1" }`.
   - Client replays request with signed EIP-3009/Permit2 authorization (`PAYMENT-SIGNATURE` or `X-PAYMENT`).
   - GovCoPilot validates authorization and synchronously returns the full JSON analysis payload with HTTP 200 OK.

2. **A2A / Direct-Accept Task Mode**:
   - When a buyer accepts/pays a task via `direct-accept` without submitting a client-side POST body, GovCoPilot automatically fetches the buyer's original task description via OKX CLI `onchainos agent common context <jobId>`.
   - GovCoPilot processes the task description, persists the deliverable, and registers it with `onchainos agent task-deliverable-save`.
   - The analysis result is queryable via `GET /api/deliverable/:jobId` or OKX CLI `onchainos agent task-deliverable-list --job-id <jobId>`.

---

## Key Technical & Protocol Highlights

- **HTTP x402 V2 Protocol Compliance:**
  - Standard `402 Payment Required` status response.
  - CAIP-2 chain identifier **`eip155:196`** across headers (`X-Payment-Chain-Id`, `X-Payment-Network`, `WWW-Authenticate`) and response payload.
  - Base64-encoded `PAYMENT-REQUIRED` header with `extra: { name: "USD₮0", version: "1" }` for OKX validator compatibility.
  - Payment asset hardcoded to Mainnet **USDT0 (`0x779ded0c9e1022225f8e0630b35a9b54be713736`)**.
  - CORS headers exposed (`Access-Control-Expose-Headers`) for cross-origin callers.
- **On-Chain EIP-3009 & Tx Verification:** Interacts directly with X Layer Mainnet RPC to verify EIP-3009 authorization signatures and on-chain ERC20 transfers.
- **Replay Attack Protection:** Tracks nonces and transaction hashes in middleware to prevent replay double-spending.
- **LLM Reasoning Engine:** Powered by Groq AI (`llama-3.3-70b-versatile`) with enforced JSON output schema for machine parsing.

---

## API Reference & cURL Example

**Endpoint:** `POST https://govcopilot-api.synarcdao.xyz/api/analyze_governance_proposal`

### cURL Example

```bash
# 1. Probe the endpoint to receive 402 challenge
curl -i -X POST https://govcopilot-api.synarcdao.xyz/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -d '{"proposalText": "Upgrade main governance router contract on X Layer"}'

# 2. Re-send request with transaction hash or payment signature
curl -X POST https://govcopilot-api.synarcdao.xyz/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx-Hash: 0x8ef439b1e...your_tx_hash..." \
  -d '{"proposalText": "Upgrade main governance router contract on X Layer", "chain": "xlayer"}'
```

### Response Schema

```json
{
  "proposalSummary": "Upgrades Governor liquidity router on X Layer Mainnet to optimize swap routing...",
  "analysis": {
    "strategicAlignment": "High alignment with protocol expansion objectives.",
    "financialImpact": "Saves 15% in swap routing fees across treasury operations.",
    "securityRisks": "No malicious proxy patterns detected in target contract byte code.",
    "opportunities": "Enables cross-chain liquidity aggregation on X Layer."
  },
  "votingRecommendation": {
    "vote": "YES",
    "confidence": 0.94,
    "reasoning": "Saves transaction fees and boosts router stability without introducing security risks."
  },
  "executionGuidance": {
    "steps": [
      "Submit vote transaction to X Layer Governor at target contract address."
    ],
    "xLayerOptimizations": "Verify transaction has finality on block height > 50000.",
    "calldataHint": "cast send 0xabc... 'castVote(uint256,uint8)' 42 1"
  },
  "jobId": "task-1785234000",
  "deliverableStatus": "SUBMITTED",
  "deliverableUrl": "https://govcopilot-api.synarcdao.xyz/api/deliverable/task-1785234000"
}
```

---

## Ecosystem Integration

- ✅ **Listed on OKX.AI — [Agent ID 5965](https://www.okx.ai/agents/5965)**
- Deployed on X Layer Mainnet (`eip155:196`) using Mainnet USDT0 (`0x779ded0c9e1022225f8e0630b35a9b54be713736`).
- Built by the team behind SynArc.

---

## License

MIT
