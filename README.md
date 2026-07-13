# GovCoPilot 🤖🏛️

**GovCoPilot** (by SynArc) is an AI-powered governance co-pilot ASP (Agentic Service Provider) designed for the **OKX AI Genesis Hackathon**. It analyzes DAO proposals, recommends voting strategies with confidence scores, and generates EVM-compatible execution calldata—optimized natively for the **X Layer** ecosystem.

## Core Features
1. **Strategic & Risk Analysis**: Deep analysis covering strategic alignment, financial/treasury implications, and security risks.
2. **Voting Recommendation**: Clear, action-oriented recommendations (`YES`, `NO`, `ABSTAIN`) with a detailed rationale and confidence score.
3. **EVM / X Layer Execution Guidance**: Provides step-by-step guidance and transaction calldata templates for immediate execution.
4. **x402 Payment Gateway**: Integrated Agent-to-Agent monetization flow using the `402 Payment Required` standard.

---

## Tech Stack
- **Runtime & Language**: Node.js & TypeScript
- **Server Framework**: Express.js
- **LLM Engine**: Groq API (`llama-3.3-70b-versatile` / Qwen models)
- **Onchain Queries**: Ethers.js (X Layer Testnet/Mainnet RPC)
- **Frontend**: Clean, premium dark-themed landing page with Tailwind CSS and an interactive live playground.

---

## Getting Started

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Configuration
Create a `.env` file in the root directory:
```bash
cp .env.example .env
```
Fill in the configuration details:
- `GROQ_API_KEY`: Your Groq API key for proposal analysis.
- `ASP_WALLET_ADDRESS`: Your EVM wallet address to receive x402 payments.
- `BYPASS_PAYMENT_VERIFICATION`: Set to `true` to test proposal analysis without executing real onchain payments.

### 3. Run Locally
Run the server in development mode:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the landing page and use the live API playground.

### 4. Integration Verification
You can run the integration tests to verify the x402 headers and health check endpoints:
```bash
npx tsx src/test-client.ts
```

---

## x402 Payment Protocol Flow
GovCoPilot monetizes API calls programmatically:

1. **Client Probe**: The client calls `/api/analyze` without headers.
2. **Payment Request**: The server responds with `402 Payment Required` and headers detailing the recipient and fee:
   - `X-Payment-Address`: ASP wallet address.
   - `X-Payment-Amount`: e.g. `0.05` OKB/USDC.
   - `X-Payment-Chain-Id`: e.g. `195` (X Layer Testnet).
3. **Execution**: The client signs and broadcasts the transfer transaction onchain.
4. **Final Request**: The client retries the API call, placing the transaction hash in the `X-Payment-Tx-Hash` header. The server verifies the transaction onchain, checks for double-spending, and fulfills the request.

---

## Deployment
This project is pre-configured for instant serverless deployment on **Vercel**:
```bash
vercel
```
Ensure your environment variables are configured in the Vercel dashboard.
