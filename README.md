# GovCoPilot

**Autonomous DAO Governance Co-Pilot, built on X Layer**

GovCoPilot is an Agent Service Provider (ASP) that analyzes DAO governance proposals and returns structured, machine-readable recommendations: strategic alignment, financial impact, security risk assessment, a confidence-scored voting recommendation, and ready-to-execute EVM calldata — all via a single x402-paid API call.

Built for the agent-to-agent economy: instead of a human reading proposal documentation, an AI agent calls GovCoPilot's endpoint, pays per-call in testnet/mainnet tokens (e.g. USDT on X Layer) via x402, and receives back everything it needs to make and execute a governance decision autonomously — no negotiation, no human in the loop.

GovCoPilot is built on infrastructure proven by SynArc, a DAO governance platform with 900+ real proposals on Arc Testnet, and is optimized for X Layer's fast finality and low fees, with native OKX Agentic Wallet, OKX.AI, and Onchain OS integration.

---

## Key Technical & Architectural Highlights

- **HTTP x402 Compliance (OKX.AI Listing Ready):** 
  - Standard `402 Payment Required` status response.
  - Advertises CAIP-2 formatted chain ID **`eip155:196`** for X Layer Mainnet (`eip155:195` for Testnet) across headers (`X-Payment-Chain-Id`, `X-Payment-Network`) and response payload.
  - Returns base64-encoded `PAYMENT-REQUIRED` header for x402 v2 protocol compatibility.
  - Full CORS header exposure (`Access-Control-Expose-Headers`) for cross-origin crawlers and web clients.
- **On-Chain Transaction Verification:** Interacts directly with X Layer RPC nodes to verify broadcasted transactions across direct native transfers, ERC20 transfers (e.g., USDT), and Account Abstraction (AA) userOps.
- **Replay Attack Protection:** Tracks verified transaction hashes in middleware to prevent transaction replay reuse.
- **LLM Reasoning Engine:** Powered by Groq `llama-3.3-70b-versatile` with enforced JSON output schema for deterministic machine parsing.
- **Multi-Network Support:** Defaults to X Layer Mainnet (`eip155:196`), with seamless fallback to X Layer Testnet (`eip155:195`) via `X-Network: testnet` header or query string.
- **Zero-Friction Playground:** Built-in `X-Playground-Request` header bypass for developers and hackathon judges to evaluate without broadcasting live transactions.

---

## The Problem

DAO governance today is broken for both humans and agents:

- **Governance fatigue** — reviewing hundreds of pages of proposal documentation per vote leads to low turnout and unvetted decisions.
- **Treasury security risk** — malicious proposals can drain funds via obfuscated router updates or contract upgrades.
- **No agent-native tooling** — AI agents have no standardized way to analyze a proposal and generate an executable transaction.

GovCoPilot gives any agent a single, paid, standardized endpoint to solve all three.

---

## Live Demo & Resources

- **Playground:** https://gov-copilot.vercel.app/#playground (payment bypassed for testing — see below)
- **GitHub:** https://github.com/kellycryptos/GovCoPilot

---

## Network & Deployment Details

| Field | Mainnet (Default) | Testnet |
|---|---|---|
| **Network** | X Layer Mainnet | X Layer Testnet |
| **Chain ID (CAIP-2)** | `eip155:196` (Numeric: `196`) | `eip155:195` (Numeric: `195`) |
| **RPC URL** | `https://rpc.xlayer.tech` | `https://xlayertestrpc.okx.com` |
| **Explorer** | [X Layer Mainnet Explorer](https://www.okx.com/web3/explorer/xlayer) | [X Layer Testnet Explorer](https://www.okx.com/web3/explorer/xlayer-test) |
| **Payment Address (ASP Wallet)** | `0xf313dcef4e1e22c01cea636c2631c74eac6e4518` | `0xf313dcef4e1e22c01cea636c2631c74eac6e4518` |
| **Payment Asset & Fee** | 0.05 USDT (`0x1E4a...D41d`) | 0.05 USDT / Native OKB |

---

## API Reference & x402 Protocol Specification

**Endpoints:** `POST /api/analyze_governance_proposal` or `POST /api/analyze`

**Required header (after payment):** `X-Payment-Tx-Hash`

**Optional headers:** `X-Network: testnet` (select testnet), `X-Playground-Request: true` (bypass payment for testing)

### x402 Flow

1. Call the endpoint without a transaction hash header.
2. Receive `402 Payment Required` with payment coordinates in headers and JSON payload.
3. Broadcast payment on X Layer (USDT / OKB) to the ASP wallet address.
4. Retry the request including the transaction hash in the `X-Payment-Tx-Hash` header.

### 402 Probe Response Headers & Payload

**HTTP Status:** `402 Payment Required`

**Headers Exposed:**
```http
X-Payment-Address: 0xf313dcef4e1e22c01cea636c2631c74eac6e4518
X-Payment-Amount: 0.05
X-Payment-Chain-Id: eip155:196
X-Payment-Network: eip155:196
X-Payment-Asset: USDT
X-Payment-Token-Address: 0x1E4a5963aBFD975d8c9021ce480b42188849D41d
PAYMENT-REQUIRED: <base64-encoded x402 offer>
```

**JSON Payload:**
```json
{
  "x402Version": 1,
  "error": "Payment Required",
  "message": "To access GovCoPilot ASP analyze_governance_proposal tool, pay 0.05 USDT to 0xf313dcef4e1e22c01cea636c2631c74eac6e4518 on X Layer Mainnet (eip155:196). Include transaction hash in the 'X-Payment-Tx-Hash' header upon completion.",
  "accepts": [
    {
      "scheme": "exact",
      "network": "eip155:196",
      "chainId": "eip155:196",
      "numericChainId": 196,
      "asset": "USDT",
      "payTo": "0xf313dcef4e1e22c01cea636c2631c74eac6e4518",
      "amount": "0.05",
      "tokenAddress": "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
      "maxAmountRequired": "0.05"
    }
  ],
  "paymentDetails": {
    "recipient": "0xf313dcef4e1e22c01cea636c2631c74eac6e4518",
    "amount": "0.05",
    "asset": "USDT",
    "network": "eip155:196",
    "chainId": "eip155:196",
    "numericChainId": 196,
    "caip2": "eip155:196",
    "tokenAddress": "0x1E4a5963aBFD975d8c9021ce480b42188849D41d",
    "networkName": "X Layer Mainnet"
  }
}
```

### cURL Example

```bash
# 1. Probe the endpoint to get payment coordinates
curl -i -X POST https://gov-copilot.vercel.app/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -d '{"proposalText": "Upgrade main governance contract"}'

# 2. Re-send once you submit the tx onchain with the Tx Hash
curl -X POST https://gov-copilot.vercel.app/api/analyze_governance_proposal \
  -H "Content-Type: application/json" \
  -H "X-Payment-Tx-Hash: 0xYOUR_TX_HASH" \
  -d '{"proposalText": "Upgrade main governance contract", "chain": "x-layer"}'
```

### Response Schema

```json
{
  "proposalSummary": "Upgrades Governor router to V2 on X Layer to optimize swap routing...",
  "analysis": {
    "strategicAlignment": "High alignment. Improves gas efficiency and reduces execution latency.",
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
  }
}
```

---

## Playground (Testing Without Payment)

The live playground bypasses payment for judges/testers via an internal `X-Playground-Request` header — no on-chain transaction required to try the analysis engine. Real agent-to-agent calls outside the playground still require the full x402 payment flow.

---

## Environment Variables

See `.env.example` for required variables:

- `ASP_WALLET_ADDRESS` — ASP wallet receiving payments (`0xf313dcef4e1e22c01cea636c2631c74eac6e4518`)
- `CHAIN_ID` — `196` (Mainnet) or `195` (Testnet)
- `CAIP2_CHAIN_ID` — `eip155:196` (Mainnet) or `eip155:195` (Testnet)
- `GROQ_API_KEY` — server-side AI key (never exposed to client)
- `GROQ_MODEL` — defaults to `llama-3.3-70b-versatile`

---

## Status & Ecosystem Integration

- Fully x402-compliant ASP listed / ready for OKX.AI approval via Onchain OS and OKX Agentic Wallet.
- Deployed and live on X Layer Mainnet (`eip155:196`) & Testnet (`eip155:195`).
- Developed by the team behind SynArc.

---

## License

MIT


