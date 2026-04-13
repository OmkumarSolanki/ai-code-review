import { patternScanner } from '../../src/services/staticAnalysis/patternScanner';

describe('PatternScanner', () => {
  it('supports all languages', () => {
    expect(patternScanner.supports('typescript')).toBe(true);
    expect(patternScanner.supports('python')).toBe(true);
    expect(patternScanner.supports('java')).toBe(true);
    expect(patternScanner.supports('unknown')).toBe(true);
  });

  it('detects hardcoded AWS key in JS file', async () => {
    const code = `const key = "AKIAIOSFODNN7EXAMPLE1";`;
    const findings = await patternScanner.analyze('test.js', code, 'javascript');
    expect(findings.some(f => f.ruleId === 'hardcoded-aws-key')).toBe(true);
  });

  it('detects hardcoded AWS key in Python file', async () => {
    const code = `aws_key = "AKIAIOSFODNN7EXAMPLE1"`;
    const findings = await patternScanner.analyze('test.py', code, 'python');
    expect(findings.some(f => f.ruleId === 'hardcoded-aws-key')).toBe(true);
  });

  it('detects SQL string concatenation in Java file', async () => {
    const code = `String query = "SELECT * FROM users WHERE id = " + request.getParameter("id");`;
    const findings = await patternScanner.analyze('Test.java', code, 'java');
    expect(findings.some(f => f.ruleId === 'sql-string-concat')).toBe(true);
  });

  it('detects pickle.loads in Python file', async () => {
    const code = `data = pickle.loads(request.data)`;
    const findings = await patternScanner.analyze('test.py', code, 'python');
    expect(findings.some(f => f.ruleId === 'dangerous-deserialize')).toBe(true);
  });

  it('detects eval() in JavaScript file', async () => {
    const code = `const result = eval(userInput);`;
    const findings = await patternScanner.analyze('test.js', code, 'javascript');
    expect(findings.some(f => f.ruleId === 'dangerous-eval')).toBe(true);
  });

  it('detects innerHTML assignment', async () => {
    const code = `document.getElementById("output").innerHTML = userContent;`;
    const findings = await patternScanner.analyze('test.js', code, 'javascript');
    expect(findings.some(f => f.ruleId === 'innerHTML-xss')).toBe(true);
  });

  it('detects TODO comments across multiple languages', async () => {
    const jsCode = `// TODO: fix this later`;
    const pyCode = `# TODO: refactor this`;
    const javaCode = `/* FIXME: broken */`;

    const jsFindings = await patternScanner.analyze('test.js', jsCode, 'javascript');
    const pyFindings = await patternScanner.analyze('test.py', pyCode, 'python');
    const javaFindings = await patternScanner.analyze('Test.java', javaCode, 'java');

    expect(jsFindings.some(f => f.ruleId === 'todo-fixme')).toBe(true);
    expect(pyFindings.some(f => f.ruleId === 'todo-fixme')).toBe(true);
    expect(javaFindings.some(f => f.ruleId === 'todo-fixme')).toBe(true);
  });

  it('returns empty array for clean code', async () => {
    const code = `function add(a: number, b: number): number {\n  return a + b;\n}`;
    const findings = await patternScanner.analyze('test.ts', code, 'typescript');
    expect(findings).toHaveLength(0);
  });

  it('reports correct line numbers', async () => {
    const code = `const x = 1;\nconst y = 2;\nconst result = eval(input);`;
    const findings = await patternScanner.analyze('test.js', code, 'javascript');
    const evalFinding = findings.find(f => f.ruleId === 'dangerous-eval');
    expect(evalFinding?.lineStart).toBe(3);
  });

  it('handles empty files without crashing', async () => {
    const findings = await patternScanner.analyze('empty.ts', '', 'typescript');
    expect(findings).toHaveLength(0);
  });

  it('handles binary-like content without crashing', async () => {
    const content = '\x00\x01\x02\x03\x04\x05';
    const findings = await patternScanner.analyze('binary.bin', content, 'unknown');
    expect(Array.isArray(findings)).toBe(true);
  });

  it('detects empty catch blocks', async () => {
    const code = `try { doSomething(); } catch (e) {}`;
    const findings = await patternScanner.analyze('test.ts', code, 'typescript');
    expect(findings.some(f => f.ruleId === 'empty-catch')).toBe(true);
  });

  it('detects hardcoded generic secrets', async () => {
    const code = `const password = "super_secret_password123";`;
    const findings = await patternScanner.analyze('test.ts', code, 'typescript');
    expect(findings.some(f => f.ruleId === 'hardcoded-generic-secret')).toBe(true);
  });

  it('detects console.log in Go', async () => {
    const code = `fmt.Println("debug value:", x)`;
    const findings = await patternScanner.analyze('main.go', code, 'go');
    expect(findings.some(f => f.ruleId === 'console-log')).toBe(true);
  });

  it('all findings have source "pattern"', async () => {
    const code = `const password = "mysecretpass123";\neval(x);`;
    const findings = await patternScanner.analyze('test.js', code, 'javascript');
    expect(findings.every(f => f.source === 'pattern')).toBe(true);
  });
});
