# KAALASTRA

### The Weapon Against the Dark Age of Code

**October went dark. KAALASTRA awakened.**

An AI-powered, developer-first security extension for Visual Studio Code, envisioned to detect vulnerabilities, expose malicious dependencies, trace attack paths, and help developers secure applications before threats reach production.

The standalone [security run graph](FRONTEND/security-graph/README.md) generates a compact, directly readable `.graph` text flow from the last pushed GitHub commit to the workspace after fixes. It shows frontend/backend break, fix, and verification steps; the extension and model integration can supply findings later.

## 📸 Screenshot Capture with **Tavily**

| Feature | How it works | Usage |
|---------|--------------|-------|
| **One‑click screenshot** of the current editor, selected code region, or the whole VS Code window | The extension calls the **Tavily** API (client‑side, no token stored in the repo) to render a PNG that is saved to the workspace `/.kaalastra/screenshots/` folder. | 1. Open the command palette (`Ctrl+Shift+P`). \n2. Run **“KaalAstra: Capture Screenshot”**. \n3. Choose **Full Window**, **Active Editor**, or **Selection**. \n4. The image appears in the VS Code explorer and can be attached to a bug report or documentation. |
| **Configurable quality & size** | Settings `kaalastra.screenshotQuality` (0‑100) and `kaalastra.maxScreenshotSizeKB`. | Adjust in *Settings → Extensions → KaalAstra*. |
| **Privacy‑first** | Images are generated locally; the Tavily request only contains the rendered bitmap – no source code is transmitted. | No secret storage or network traffic beyond the image generation service. |

> **Note:** Tavily is an **optional** dependency. If no API key is defined, the command falls back to the built‑in VS Code `window.showSaveDialog` workflow.

## 📈 Graph Visualisation with **Graphify**

KaalAstra now ships a tiny **graph view** powered by the open‑source **Graphify** library.

| Component | Description |
|-----------|-------------|
| **Security‑run graph** (`*.graph` files) | Generated after a scan, it encodes the flow from *source discovery* → *vulnerability detection* → *remediation suggestion* → *verification*. |
| **Graphify web‑view** | A lightweight VS Code Webview renders the `.graph` file as an interactive directed graph. Nodes can be expanded/collapsed, and clicking a node opens the corresponding file/line in the editor. |
| **Live‑update** | After each audit run the extension writes a fresh `run.graph` and refreshes the Graphify panel automatically. |
| **Configuration** | `kaalastra.graphifyTheme` (light/dark), `kaalastra.graphifyLayout` (`dagre`, `elk`). |

> **Screenshot of the graph view** (generated with the new Tavily command) is automatically saved as `run_graph.png` in the screenshots folder.

---

## 🌑 The Dark Age of Code

Modern software development runs on trust.

Every dependency installed, every package imported, every AI-generated function accepted, and every line pushed into production becomes part of a growing software supply chain.

But what happens when that trust is compromised?

From malicious npm packages and vulnerable Node.js dependencies to PHP security flaws, compromised libraries, exposed credentials, and insecure AI-generated code, the modern development ecosystem faces an expanding attack surface.

Traditional security workflows often discover vulnerabilities too late, after code has already been committed, deployed, or exploited.

**Security should begin where software is written.**

That is the vision behind KAALASTRA.

## Security before every push

### Coding agent workflow in the VS Code extension

The Hybrid, FinSec AI, and Baseline controls select the security assessment mode. The separate **Coding agent** control chooses who proposes code changes: OpenAI, Anthropic, or Gemini. Select **Set API key** to save a key for the chosen provider in VS Code SecretStorage, or **Clear** to remove it. Keys are not stored in the workspace or sent to the sidebar webview. If needed, change the model through `kaalastra.codingModels.openai`, `kaalastra.codingModels.anthropic`, or `kaalastra.codingModels.gemini` in VS Code settings.

After a scan, select **Propose Fix** on a finding or **Propose All**. The extension asks before sending the affected file and finding to the selected provider, shows the returned edit in a VS Code diff, and applies it only after you choose **Apply Edit**. Run tests and scan again before treating the change as verified. Hybrid and Baseline assessment still use the backend's `GEMINI_API_KEY`; the coding provider key is configured separately.

**A security check belongs in the path to production, not on a backlog after release.** A single unsafe change can expose credentials, customer data, money, or a trusted communication channel. Review code, dependencies, and behavior before merging or deploying. Recheck after fixes and upgrades.

This mission is personal to us. Members of our community at **Vishwakarma Institute of Technology (VIT), Pune** report that the Training and Placement Office email account was compromised and misused. We have not found a public incident report confirming the scope, method, or root cause. In particular, **there is no evidence here that a PHP vulnerability caused that incident**. One compromised identity can make harmful messages appear credible.

The wider threat is documented:

- **PHP:** [CERT-In's April 2025 advisory](https://www.cert-in.org.in/s2cMainServlet?VLCODE=CIVN-2025-0063&pageid=PUBVLNOTES01) describes PHP vulnerabilities with possible security bypass, remote code execution, data manipulation, and denial of service.
- **Node.js:** The [Node.js July 2025 security release](https://nodejs.org/en/blog/vulnerability/july-2025-security-releases) documents vulnerabilities in active release lines. Keep runtimes and dependencies current, and test upgrades before deployment.
- **CBI cyber fraud case:** In [a July 2025 CBI case reported by India's Press Information Bureau](https://www.pib.gov.in/PressReleaseIframePage.aspx?PRID=2149124&lang=2&reg=48), investigators alleged that cyber victims' funds flowed into a mule account. This illustrates the cost of account abuse; it is **not** a claim that CBI systems or data were breached.
- **Railway ticketing:** [Indian Railways reported](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2227511&lang=1&reg=6) deactivating 3.03 crore suspicious user IDs in 2025 and described controls against unauthorized accounts and automated abuse. This is **not** evidence of a railway database breach.

### Expectations for contributors and AI coding agents

When changing this project or code analyzed with it:

1. **Before pushing:** inspect changed files and dependencies for secrets, injection, unsafe deserialization, broken authentication or authorization, exposed endpoints, and insecure configuration. Check applicable security advisories.
2. **Verify fixes:** run relevant tests and scans, review their output, and confirm the behavior behind each finding is addressed. Treat AI-generated patches as proposals until verified.
3. **Report honestly:** distinguish confirmed findings from hypotheses, record affected files and evidence, and state what was not tested. Never turn an alleged incident into a proven breach or assign a cause without evidence.
4. **Escalate serious findings:** call attention to credential exposure, exploitable vulnerabilities, and data access risks before a merge or release. Avoid publishing sensitive details or live credentials in reports.

**Find the risk, fix it, verify it, then push.**

## ðŸ”± Why KAALASTRA?

Inspired by Indian mythology and Sanskrit, KAALASTRA combines two powerful ideas:

- **Kaal (à¤•à¤¾à¤²):** Time, mortality, and the inevitable passage of eras.
- **Astra (à¤…à¤¸à¥à¤¤à¥à¤°):** A weapon, traditionally associated with extraordinary power.

Together, KAALASTRA represents a weapon forged to confront the darkest threats of modern software development.

Just as ancient warriors relied on powerful astras to defend against formidable enemies, modern developers need intelligent tools to defend against increasingly sophisticated cyber threats.

**Our philosophy: Detect early. Understand deeply. Defend continuously.**

## ðŸ›¡ï¸ What Is KAALASTRA?

KAALASTRA is a proposed intelligent cybersecurity companion integrated directly into Visual Studio Code.

Rather than functioning solely as a conventional vulnerability scanner, KAALASTRA aims to combine static code analysis, dependency intelligence, contextual security reasoning, and AI-assisted remediation into a unified developer experience.

Its goal is to help developers understand not only **what is vulnerable**, but also **why it matters, how it could be exploited, and how to fix it safely**.

## âš¡ Planned Capabilities

### 1. Intelligent Vulnerability Detection

Analyze source code for common security weaknesses, including:

- SQL injection
- Cross-site scripting (XSS)
- Command injection
- Path traversal
- Insecure authentication and authorization
- Hardcoded secrets
- Unsafe deserialization
- Security misconfigurations

### 2. Software Supply Chain Protection

Examine project dependencies and package manifests to identify known vulnerabilities and suspicious packages.

Planned ecosystem support includes:

- npm and Node.js
- PHP and Composer
- Python and pip
- Additional package ecosystems in future releases

Potential capabilities include dependency risk assessment, vulnerable-version identification, and safer upgrade recommendations.

### 3. AI-Assisted Security Analysis

Use AI-assisted reasoning to interpret security findings in their surrounding code context.

The intended workflow includes identifying vulnerable patterns, explaining potential consequences, and recommending focused remediations.

AI-generated suggestions will require verification through deterministic checks, testing, and developer review.

### 4. Attack Path Intelligence

Go beyond isolated warnings by examining relationships between vulnerable components.

KAALASTRA aims to help developers understand how an exposed entry point, insecure function, or vulnerable dependency could contribute to a larger attack path.

### 5. Secure Coding Assistance

Provide actionable guidance directly inside the editor, including:

- Clear vulnerability explanations
- Relevant source locations
- Suggested remediations
- Secure coding alternatives
- Links to applicable security standards
- Guidance for validating fixes

### 6. Developer-First Security Experience

KAALASTRA is designed around a simple principle:

**Security tools should empower developers, not overwhelm them.**

The envisioned experience prioritizes meaningful findings, contextual explanations, manageable alerts, and minimal disruption to existing development workflows.

## ðŸ§  Proposed Architecture

```text
                 KAALASTRA
                     |
             VS Code Extension
                     |
            Security Orchestrator
                     |
        +------------+------------+
        |            |            |
    Code Scanner  Dependency   Secret Scanner
        |          Analyzer         |
        +------------+------------+
                     |
             Finding Correlation
                     |
              AI Analysis Layer
                     |
            Risk Prioritization
                     |
          Remediation Suggestions
                     |
              VS Code UI
```

The architecture is conceptual and may evolve during implementation.

## 🛠️ Proposed Technology Stack

| Component | Technology |
|---|---|
| Extension platform | VS Code Extension API |
| Primary language | TypeScript |
| Runtime | Node.js |
| Code analysis | Static analysis and language-aware parsing |
| Dependency analysis | Package manifests and vulnerability advisories |
| Security standards | OWASP, CWE, CVE |
| AI assistance | Configurable AI analysis layer |
| Interface | VS Code diagnostics, commands, and webviews |
| Testing | Automated tests and security-focused test cases |

## ðŸš€ Getting Started

The repository includes the Python analysis backend, the VS Code extension, and a payment gateway demo workspace. The backend and demo are stored directly in this repository so a clone is self-contained.

Set up the Python environment and optional API keys:

```bash
python -m venv .venv
# Windows PowerShell
.venv\Scripts\Activate.ps1
# macOS/Linux: source .venv/bin/activate
python -m pip install -r backend/requirements.txt
cp .env.example .env
```

Add your Gemini API key to `.env` to enable AI review. Tavily and Hugging Face tokens are optional. The scanner can run without those optional integrations, though AI review requires Gemini.

Build and launch the VS Code extension:

```bash
npm --prefix vscode-extension install
npm --prefix vscode-extension run compile
code .
```

In VS Code, choose **Launch KaalAstra Extension** from Run and Debug (F5). It opens the bundled `demo-target` workspace. The extension locates `backend/cli.py` relative to the repository and runs scans against the open workspace, so no sibling folders or hard-coded machine paths are needed.

To start the optional HTTP API from the repository root:

```bash
python backend/server.py
```

The API listens on `127.0.0.1` using `KAALASTRA_PORT` (default `8000`) and exposes `/health`, `/api/scan`, and `/api/scan/stream`.

Installation instructions will be updated as the implementation progresses.

## ðŸ—ºï¸ Development Roadmap

### Phase 1 â€” Foundation
- [ ] Initialize VS Code extension architecture
- [ ] Implement workspace and file discovery
- [ ] Build the security diagnostics interface
- [ ] Establish a modular scanning pipeline

### Phase 2 â€” Core Security
- [ ] Implement initial static analysis rules
- [ ] Add dependency vulnerability detection
- [ ] Introduce secret detection
- [ ] Integrate vulnerability advisory sources

### Phase 3 â€” Intelligent Analysis
- [ ] Introduce contextual AI explanations
- [ ] Implement security finding correlation
- [ ] Develop attack-path analysis
- [ ] Add risk prioritization

### Phase 4 â€” Remediation
- [ ] Generate suggested security fixes
- [ ] Validate fixes against tests and rules
- [ ] Introduce developer-controlled remediation
- [ ] Improve false-positive handling

### Phase 5 â€” Release
- [ ] Conduct security and performance testing
- [ ] Prepare documentation
- [ ] Package the VS Code extension
- [ ] Publish the initial release

## 🔐 Security and Privacy Principles

As a security-focused developer tool, KAALASTRA aims to follow security-first engineering practices.

- **Local-first analysis:** Prefer local processing wherever practical.
- **Explicit data handling:** Clearly disclose when source code or metadata may be sent to external services.
- **Least privilege:** Request only permissions necessary for extension functionality.
- **Developer control:** Never silently modify source code or dependencies.
- **Secure defaults:** Protect credentials, tokens, scan reports, and sensitive project information.
- **Transparent findings:** Distinguish verified vulnerabilities from AI-generated hypotheses.

These are project design goals and will require implementation and testing before release.

## ðŸ¤ Contributing

Contributions, suggestions, and security research are welcome as the project develops.

Potential contribution areas include static analysis, package ecosystem support, vulnerability research, AI-assisted remediation, performance optimization, and extension UI development.

Contribution guidelines will be published as the repository matures.

## âš ï¸ Disclaimer

KAALASTRA is intended to assist developers in identifying and understanding software security risks.

No automated security tool can guarantee that an application is free from vulnerabilities. Findings and AI-generated recommendations should be reviewed and validated before use in production.

KAALASTRA is not a substitute for comprehensive security testing, code review, or professional security assessments.

## ðŸ“œ License

License to be determined.

---

### KAALASTRA

**Forged in Bharat. Built for the world.**

*When code enters its darkest age, a weapon awakens.*

**October went dark. KAALASTRA awakened.**

## Security data foundation

KAALASTRA's dataset work is built on published vulnerability research and real security fixes, with provenance, deduplication, and separate evaluation data recorded from the start. The following sources are downloaded locally; dataset artifacts are excluded from Git.

| Dataset | Role in this project | Local status |
| --- | --- | --- |
| [DeltaSecommits](https://huggingface.co/datasets/rufimelo/DeltaSecommits) | Real vulnerable/fixed code pairs across languages; 2,290 filtered candidates | Downloaded and preprocessed |
| [PrimeVul](https://github.com/DLVulDet/PrimeVul) | Research-grade C/C++ vulnerable/fixed pairs and benign examples; 3,737 filtered training pairs plus 54,430 strictly isolated full-split candidates | Downloaded and preprocessed |
| [Patchwork CVE](https://github.com/TayR-D/patchwork-cve) | CVE, CWE, repository, and fix metadata; 15,904 non-refused records indexed | Downloaded; metadata only |
| [SVEN](https://github.com/eth-sri/sven) | Security evaluation fixtures, kept outside training | Downloaded and isolated |

The [dataset manifest](datasets/manifests/downloads.json) records exact files, sizes, hashes, and source links. The [dataset preparation notes](datasets/README.md) explain filtering and usage limits. Dataset acquisition is a foundation for model development; performance claims will be made only after reproducible held-out evaluation.

### Bounded Kaggle training and comparison

The v2 package contains **3,998 training**, **504 validation**, and **971 test** function-level examples before token filtering. Training is class balanced and prioritizes paired fixed-code negatives. Projects, whitespace-normalized code hashes and vulnerability IDs are isolated across splits; near-clone leakage and upstream label errors remain limitations.

The [notebook](notebooks/kaalastra_nemotron_kaggle.ipynb) runs one bounded QLoRA classification job, validation threshold selection, paired base-versus-adapter evaluation and persistent export. Follow the [Kaggle guide](docs/KAGGLE_TRAINING.md) with the matching dataset ZIP. The configured total budget is 3h30 including setup, with a two-hour training cap; actual epoch coverage depends on GPU throughput and downloads.

The previous pilot missed 29 of 30 vulnerable examples and did not establish useful performance. V2 corrects training and evaluation defects documented in the [training audit](docs/TRAINING_AUDIT.md); v2 accuracy has not yet been measured. It targets improvement in F1 and balanced accuracy against the same base model, with explicit recall and false-positive constraints. No SOTA, commercial-product superiority, whole-project detection or patch-correctness claim is established.
