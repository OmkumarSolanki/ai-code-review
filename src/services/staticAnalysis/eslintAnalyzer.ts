import { ESLint } from 'eslint';
import { Finding, StaticAnalyzer } from './types';

const JS_TS_LANGUAGES = new Set(['javascript', 'typescript', 'tsx']);

const SEVERITY_MAP: Record<number, Finding['severity']> = {
  1: 'warning',
  2: 'critical',
};

const CATEGORY_MAP: Record<string, Finding['category']> = {
  'no-eval': 'security',
  'no-implied-eval': 'security',
  'no-unused-vars': 'style',
  '@typescript-eslint/no-unused-vars': 'style',
  'no-console': 'best-practice',
  'complexity': 'logic',
  'max-depth': 'logic',
  'max-lines-per-function': 'logic',
  'no-duplicate-imports': 'style',
  'eqeqeq': 'logic',
  'no-var': 'best-practice',
  'prefer-const': 'best-practice',
  'no-throw-literal': 'logic',
  '@typescript-eslint/no-explicit-any': 'style',
  '@typescript-eslint/explicit-function-return-type': 'style',
};

function getCategoryForRule(ruleId: string): Finding['category'] {
  return CATEGORY_MAP[ruleId] ?? 'best-practice';
}

const tsPlugin = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');

const ESLINT_CONFIG = [
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-unused-vars': 'warn',
      '@typescript-eslint/no-unused-vars': 'warn',
      'no-console': 'warn',
      'complexity': ['warn', 10],
      'max-depth': ['warn', 4],
      'max-lines-per-function': ['warn', 50],
      'no-duplicate-imports': 'error',
      'eqeqeq': 'error',
      'no-var': 'error',
      'prefer-const': 'warn',
      'no-throw-literal': 'error',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
];

class EslintAnalyzer implements StaticAnalyzer {
  name = 'eslint';

  supports(language: string): boolean {
    return JS_TS_LANGUAGES.has(language);
  }

  async analyze(filename: string, content: string, language: string): Promise<Finding[]> {
    if (!this.supports(language)) return [];

    try {
      const eslint = new ESLint({
        overrideConfigFile: true,
        overrideConfig: ESLINT_CONFIG as unknown as ESLint.Options['overrideConfig'],
      });

      const ext = language === 'typescript' ? '.ts' : language === 'tsx' ? '.tsx' : '.js';
      const virtualPath = filename.endsWith(ext) ? filename : `${filename}${ext}`;

      const results = await eslint.lintText(content, {
        filePath: virtualPath,
      });

      const findings: Finding[] = [];

      for (const result of results) {
        for (const msg of result.messages) {
          if (!msg.ruleId) continue; // Skip parser errors for findings
          findings.push({
            source: 'eslint',
            category: getCategoryForRule(msg.ruleId),
            severity: SEVERITY_MAP[msg.severity] ?? 'warning',
            message: `${msg.ruleId}: ${msg.message}`,
            lineStart: msg.line,
            lineEnd: msg.endLine ?? msg.line,
            ruleId: msg.ruleId,
            filename,
          });
        }
      }

      return findings;
    } catch {
      return [];
    }
  }
}

export const eslintAnalyzer = new EslintAnalyzer();
