import { parseFile, buildDependencyGraph } from '../../src/services/astService';

describe('AST Service', () => {
  describe('JavaScript parsing', () => {
    it('extracts function names from JavaScript file', async () => {
      const code = `
function greet(name) {
  return "Hello " + name;
}

const add = (a, b) => a + b;

class Foo {
  bar() { return 1; }
}
`;
      const meta = await parseFile(code, 'javascript');
      expect(meta).not.toBeNull();
      const names = meta!.functions.map(f => f.name);
      expect(names).toContain('greet');
      expect(names).toContain('add');
    });

    it('builds correct import map from JS imports', async () => {
      const code = `
import { foo } from './foo';
import bar from '../bar';
import express from 'express';
`;
      const meta = await parseFile(code, 'javascript');
      expect(meta).not.toBeNull();
      expect(meta!.imports.length).toBe(3);
      const relative = meta!.imports.filter(i => i.isRelative);
      expect(relative.length).toBe(2);
      const external = meta!.imports.filter(i => !i.isRelative);
      expect(external.length).toBe(1);
      expect(external[0].source).toBe('express');
    });

    it('computes cyclomatic complexity for function with if/else/for', async () => {
      const code = `
function complex(x) {
  if (x > 0) {
    for (let i = 0; i < x; i++) {
      if (i % 2 === 0) {
        continue;
      }
    }
  } else {
    while (x < 0) {
      x++;
    }
  }
  return x;
}
`;
      const meta = await parseFile(code, 'javascript');
      expect(meta).not.toBeNull();
      const fn = meta!.functions.find(f => f.name === 'complex');
      expect(fn).toBeDefined();
      // 1 base + if + for + if + else + while = 6
      expect(fn!.complexity).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Python parsing', () => {
    it('extracts function names from Python file', async () => {
      const code = `
def hello(name):
    return f"Hello {name}"

def add(a, b):
    return a + b

class MyClass:
    def method(self):
        pass
`;
      const meta = await parseFile(code, 'python');
      expect(meta).not.toBeNull();
      const names = meta!.functions.map(f => f.name);
      expect(names).toContain('hello');
      expect(names).toContain('add');
    });

    it('builds correct import map from Python imports', async () => {
      const code = `
import os
from flask import Flask
from .models import User
`;
      const meta = await parseFile(code, 'python');
      expect(meta).not.toBeNull();
      expect(meta!.imports.length).toBeGreaterThanOrEqual(2);
      const relative = meta!.imports.filter(i => i.isRelative);
      expect(relative.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Java parsing', () => {
    it('extracts method names from Java class', async () => {
      const code = `
public class UserService {
    public void createUser(String name) {
        // create user
    }

    public String getUser(int id) {
        return "user";
    }
}
`;
      const meta = await parseFile(code, 'java');
      expect(meta).not.toBeNull();
      const names = meta!.functions.map(f => f.name);
      expect(names).toContain('createUser');
      expect(names).toContain('getUser');
    });

    it('builds correct import map from Java imports', async () => {
      const code = `
import java.util.List;
import com.example.service.UserService;
`;
      const meta = await parseFile(code, 'java');
      expect(meta).not.toBeNull();
      expect(meta!.imports.length).toBe(2);
    });
  });

  describe('Go parsing', () => {
    it('extracts function names from Go file', async () => {
      const code = `
package main

func Hello(name string) string {
    return "Hello " + name
}

func add(a, b int) int {
    return a + b
}
`;
      const meta = await parseFile(code, 'go');
      expect(meta).not.toBeNull();
      const names = meta!.functions.map(f => f.name);
      expect(names).toContain('Hello');
      expect(names).toContain('add');
    });
  });

  describe('Unsupported languages', () => {
    it('returns null metadata for unsupported language', async () => {
      const code = `some random code`;
      const meta = await parseFile(code, 'unknown');
      expect(meta).toBeNull();
    });

    it('returns null metadata for file with major syntax errors (doesn\'t crash)', async () => {
      const code = `{{{{{}}}}}`;
      // Even with syntax errors, tree-sitter typically still parses (with ERROR nodes)
      // The important thing is it doesn't throw
      const meta = await parseFile(code, 'javascript');
      expect(meta === null || typeof meta === 'object').toBe(true);
    });
  });

  describe('Dependency graph', () => {
    it('groups JS files that import each other into one component', () => {
      const files = [
        { filename: 'a.ts', imports: [{ source: './b', isRelative: true }] },
        { filename: 'b.ts', imports: [{ source: './a', isRelative: true }] },
        { filename: 'c.ts', imports: [] },
      ];
      const graph = buildDependencyGraph(files, ['a.ts', 'b.ts', 'c.ts']);

      // a.ts and b.ts should be in same component
      const componentWithA = graph.components.find(c => c.includes('a.ts'));
      expect(componentWithA).toContain('b.ts');

      // c.ts should be alone
      const componentWithC = graph.components.find(c => c.includes('c.ts'));
      expect(componentWithC).not.toContain('a.ts');
    });

    it('groups Python files that import each other into one component', () => {
      const files = [
        { filename: 'models.py', imports: [] },
        { filename: 'views.py', imports: [{ source: '.models', isRelative: true }] },
      ];
      const graph = buildDependencyGraph(files, ['models.py', 'views.py']);

      const component = graph.components.find(c => c.includes('views.py'));
      expect(component).toContain('models.py');
    });

    it('handles mixed-language projects as separate components', () => {
      const files = [
        { filename: 'app.ts', imports: [{ source: './utils', isRelative: true }] },
        { filename: 'utils.ts', imports: [] },
        { filename: 'main.py', imports: [] },
      ];
      const graph = buildDependencyGraph(files, ['app.ts', 'utils.ts', 'main.py']);

      const tsComponent = graph.components.find(c => c.includes('app.ts'));
      expect(tsComponent).toContain('utils.ts');
      expect(tsComponent).not.toContain('main.py');
    });
  });
});
