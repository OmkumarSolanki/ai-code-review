import { StaticAnalyzer } from './types';
import { patternScanner } from './patternScanner';
import { eslintAnalyzer } from './eslintAnalyzer';

export function getAnalyzers(language: string): StaticAnalyzer[] {
  const analyzers: StaticAnalyzer[] = [patternScanner];
  if (language === 'typescript' || language === 'javascript' || language === 'tsx') {
    analyzers.push(eslintAnalyzer);
  }
  return analyzers;
}

export { patternScanner, eslintAnalyzer };
