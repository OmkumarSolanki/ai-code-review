import { Finding, StaticAnalyzer } from './types';

interface PatternRule {
  name: string;
  pattern: RegExp;
  severity: Finding['severity'];
  category: Finding['category'];
  message: string;
}

const PATTERNS: PatternRule[] = [
  // === SECURITY: Hardcoded secrets ===
  {
    name: 'hardcoded-aws-key',
    pattern: /(?:AKIA|ASIA)[A-Z0-9]{16}/,
    severity: 'critical',
    category: 'security',
    message: 'AWS access key ID found in source code. Use environment variables or a secrets manager.',
  },
  {
    name: 'hardcoded-generic-secret',
    pattern: /(?:password|secret|api_key|apikey|api_secret|token|auth_token|access_token)\s*[:=]\s*['"][^'"]{8,}['"]/i,
    severity: 'critical',
    category: 'security',
    message: 'Potential hardcoded secret or credential. Move to environment variables.',
  },
  {
    name: 'hardcoded-private-key',
    pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/,
    severity: 'critical',
    category: 'security',
    message: 'Private key embedded in source code.',
  },
  {
    name: 'hardcoded-jwt-secret',
    pattern: /(?:jwt|JWT)(?:_|\.)(?:secret|SECRET|key|KEY)\s*[:=]\s*['"][^'"]+['"]/,
    severity: 'critical',
    category: 'security',
    message: 'JWT secret hardcoded in source. Use environment variables.',
  },

  // === SECURITY: Injection vulnerabilities ===
  {
    name: 'sql-string-concat',
    pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER)\s+.*(?:\+\s*(?:req\.|request\.|params\.|user|input)|(?:\$\{|%s|%d|\.format\(|f['"]))/i,
    severity: 'critical',
    category: 'security',
    message: 'Possible SQL injection via string concatenation/interpolation. Use parameterized queries.',
  },
  {
    name: 'dangerous-eval',
    pattern: /\b(?:eval|exec|execSync|child_process\.exec)\s*\(/,
    severity: 'critical',
    category: 'security',
    message: 'Dangerous code execution function. Avoid eval/exec or sanitize input rigorously.',
  },
  {
    name: 'dangerous-deserialize',
    pattern: /\b(?:pickle\.loads?|yaml\.load\s*\((?!.*Loader)|unserialize|Marshal\.load|ObjectInputStream)\b/,
    severity: 'critical',
    category: 'security',
    message: 'Unsafe deserialization of untrusted data. Use safe alternatives (e.g., yaml.safe_load, JSON).',
  },
  {
    name: 'innerHTML-xss',
    pattern: /(?:\.innerHTML\s*=|dangerouslySetInnerHTML|v-html\s*=)/,
    severity: 'warning',
    category: 'security',
    message: 'Direct HTML injection may enable XSS. Sanitize user input before rendering.',
  },
  {
    name: 'shell-injection',
    pattern: /(?:os\.system|subprocess\.call|subprocess\.Popen|Runtime\.getRuntime\(\)\.exec|exec\.Command)\s*\(.*(?:\+|%s|\$\{|\.format)/,
    severity: 'critical',
    category: 'security',
    message: 'Potential shell injection via string interpolation in command execution.',
  },

  // === CODE QUALITY ===
  {
    name: 'todo-fixme',
    pattern: /(?:\/\/|#|\/\*)\s*(?:TODO|FIXME|HACK|XXX|TEMP)\b/i,
    severity: 'info',
    category: 'best-practice',
    message: 'Unresolved TODO/FIXME comment found.',
  },
  {
    name: 'console-log',
    pattern: /\b(?:console\.log|System\.out\.println|fmt\.Println)\b/,
    severity: 'info',
    category: 'best-practice',
    message: 'Debug logging statement found. Remove or replace with a proper logging framework.',
  },
  {
    name: 'magic-number',
    pattern: /(?:if|while|for|return|===?|!==?|[<>]=?)\s*\b(?:[2-9]\d{2,}|\d{4,})\b/,
    severity: 'info',
    category: 'style',
    message: 'Magic number in condition or return. Extract to a named constant.',
  },
  {
    name: 'commented-out-code',
    pattern: /(?:\/\/|#)\s*(?:if|for|while|return|function|def|class|import|var |let |const )\s/,
    severity: 'info',
    category: 'style',
    message: 'Commented-out code. Remove dead code or use version control.',
  },
  {
    name: 'empty-catch',
    pattern: /catch\s*(?:\([^)]*\))?\s*\{\s*\}/,
    severity: 'warning',
    category: 'logic',
    message: 'Empty catch block silently swallows errors. Log or re-throw.',
  },
  {
    name: 'hardcoded-ip',
    pattern: /['"](?:\d{1,3}\.){3}\d{1,3}['"]/,
    severity: 'warning',
    category: 'best-practice',
    message: 'Hardcoded IP address. Use configuration or environment variables.',
  },
  {
    name: 'hardcoded-url',
    pattern: /['"]https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?/,
    severity: 'warning',
    category: 'best-practice',
    message: 'Hardcoded localhost URL. Use environment-based configuration.',
  },
];

class PatternScanner implements StaticAnalyzer {
  name = 'pattern-scanner';

  supports(_language: string): boolean {
    return true; // Works on ALL languages
  }

  async analyze(filename: string, content: string, _language: string): Promise<Finding[]> {
    const findings: Finding[] = [];

    if (!content) return findings;

    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const rule of PATTERNS) {
        if (rule.pattern.test(line)) {
          findings.push({
            source: 'pattern',
            category: rule.category,
            severity: rule.severity,
            message: rule.message,
            lineStart: i + 1,
            lineEnd: i + 1,
            ruleId: rule.name,
            filename,
          });
        }
      }
    }

    findings.sort((a, b) => a.lineStart - b.lineStart);
    return findings;
  }
}

export const patternScanner = new PatternScanner();
export { PATTERNS, PatternRule };
