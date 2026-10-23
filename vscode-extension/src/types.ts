export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

export type Category = 'Auth Bypass' | 'Injection' | 'IDOR' | 'Cryptography' | 'Access Control' | 'General';

export interface CodeRange {
  startLine: number;
  startChar: number;
  endLine: number;
  endChar: number;
}

export interface KaalAstraFixItem {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  category: Category;
  filePath: string;
  fileName: string;
  line: number;
  range?: CodeRange;
  originalCode: string;
  fixedCode: string;
  explanation: string;
  blindspot: string;
  cwe: string;
  verified: boolean;
  patchDiff: string;
}

export interface GitCommitItem {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
}

export interface ScanResult {
  commitHash: string;
  shortHash: string;
  author: string;
  message: string;
  totalIssues: number;
  graphSummary: string;
  asciiTree: string;
  lifecycleGraph?: string;
  gitCommits?: GitCommitItem[];
  fixes: KaalAstraFixItem[];
  verificationStatus: string;
}

