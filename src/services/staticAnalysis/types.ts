export interface Finding {
  source: 'pattern' | 'eslint' | 'llm' | 'merged';
  category: 'security' | 'performance' | 'logic' | 'style' | 'best-practice';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  lineStart: number;
  lineEnd: number;
  ruleId?: string;
  codeSnippet?: string;
  suggestedFix?: string;
  fixStatus?: string;
  confidence?: number;
  filename?: string;
}

export interface StaticAnalyzer {
  name: string;
  supports(language: string): boolean;
  analyze(filename: string, content: string, language: string): Promise<Finding[]>;
}
