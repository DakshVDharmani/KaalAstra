# âš”ï¸ KAALASTRA

### à¤•à¤¾à¤²à¤¾à¤¸à¥à¤¤à¥à¤° â€” The Weapon Against the Dark Age of Code

**October went dark. KAALASTRA awakened.**

An AI-powered, developer-first security extension for Visual Studio Code, envisioned to detect vulnerabilities, expose malicious dependencies, trace attack paths, and help developers secure applications before threats reach production.

The standalone [security run graph](FRONTEND/security-graph/README.md) generates a compact, directly readable `.graph` text flow from the last pushed GitHub commit to the workspace after fixes. It shows frontend/backend break, fix, and verification steps; the extension and model integration can supply findings later.

---

## ðŸŒ‘ The Dark Age of Code

Modern software development runs on trust.

Every dependency installed, every package imported, every AI-generated function accepted, and every line pushed into production becomes part of a growing software supply chain.

But what happens when that trust is compromised?

From malicious npm packages and vulnerable Node.js dependencies to PHP security flaws, compromised libraries, exposed credentials, and insecure AI-generated code, the modern development ecosystem faces an expanding attack surface.

Traditional security workflows often discover vulnerabilities too late, after code has already been committed, deployed, or exploited.

**Security should begin where software is written.**

That is the vision behind KAALASTRA.

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

## ðŸ› ï¸ Proposed Technology Stack

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

KAALASTRA is currently in its early development stage.

Once the initial extension scaffold is available, the expected development workflow will be:

```bash
git clone https://github.com/<your-username>/<repository-name>.git
cd <repository-name>
npm install
```

Open the project in Visual Studio Code:

```bash
code .
```

Run the build command defined in `package.json`, then launch the extension development host using the project's VS Code debug configuration.

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

## ðŸ” Security and Privacy Principles

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

### âš”ï¸ KAALASTRA

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
