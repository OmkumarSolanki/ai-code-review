import path from 'path';

// web-tree-sitter: the default export IS the Parser constructor
const TreeSitter = require('web-tree-sitter');

export interface FunctionInfo {
  name: string;
  params: string[];
  lineStart: number;
  lineEnd: number;
  complexity: number;
}

export interface ImportInfo {
  source: string;
  isRelative: boolean;
}

export interface ClassInfo {
  name: string;
  methods: string[];
  lineStart: number;
  lineEnd: number;
}

export interface ASTMetadata {
  functions: FunctionInfo[];
  imports: ImportInfo[];
  classes: ClassInfo[];
  exports: string[];
  complexity: number;
}

const WASM_DIR = path.join(
  path.dirname(require.resolve('tree-sitter-wasms/package.json')),
  'out'
);

const GRAMMAR_MAP: Record<string, string> = {
  javascript: 'tree-sitter-javascript.wasm',
  typescript: 'tree-sitter-typescript.wasm',
  tsx: 'tree-sitter-typescript.wasm',
  python: 'tree-sitter-python.wasm',
  java: 'tree-sitter-java.wasm',
  go: 'tree-sitter-go.wasm',
  rust: 'tree-sitter-rust.wasm',
  c: 'tree-sitter-c.wasm',
  cpp: 'tree-sitter-cpp.wasm',
  ruby: 'tree-sitter-ruby.wasm',
  php: 'tree-sitter-php.wasm',
};

const FUNCTION_TYPES: Record<string, string[]> = {
  javascript: ['function_declaration', 'arrow_function', 'method_definition', 'function_expression'],
  typescript: ['function_declaration', 'arrow_function', 'method_definition', 'function_expression'],
  tsx: ['function_declaration', 'arrow_function', 'method_definition', 'function_expression'],
  python: ['function_definition'],
  java: ['method_declaration', 'constructor_declaration'],
  go: ['function_declaration', 'method_declaration'],
  rust: ['function_item'],
  c: ['function_definition'],
  cpp: ['function_definition'],
  ruby: ['method', 'singleton_method'],
  php: ['function_definition', 'method_declaration'],
};

const BRANCHING_TYPES: Record<string, string[]> = {
  javascript: ['if_statement', 'else_clause', 'for_statement', 'for_in_statement', 'while_statement', 'switch_case', 'catch_clause', 'ternary_expression'],
  typescript: ['if_statement', 'else_clause', 'for_statement', 'for_in_statement', 'while_statement', 'switch_case', 'catch_clause', 'ternary_expression'],
  tsx: ['if_statement', 'else_clause', 'for_statement', 'for_in_statement', 'while_statement', 'switch_case', 'catch_clause', 'ternary_expression'],
  python: ['if_statement', 'elif_clause', 'for_statement', 'while_statement', 'except_clause', 'conditional_expression'],
  java: ['if_statement', 'else_clause', 'for_statement', 'enhanced_for_statement', 'while_statement', 'switch_expression', 'catch_clause', 'ternary_expression'],
  go: ['if_statement', 'for_statement', 'select_statement', 'expression_case', 'type_case'],
  rust: ['if_expression', 'else_clause', 'for_expression', 'while_expression', 'match_arm', 'loop_expression'],
  c: ['if_statement', 'else_clause', 'for_statement', 'while_statement', 'case_statement', 'do_statement'],
  cpp: ['if_statement', 'else_clause', 'for_statement', 'while_statement', 'case_statement', 'catch_clause'],
  ruby: ['if', 'elsif', 'unless', 'while', 'for', 'when', 'rescue'],
  php: ['if_statement', 'else_clause', 'for_statement', 'foreach_statement', 'while_statement', 'catch_clause', 'case_statement'],
};

let parserInitialized = false;

async function initParser(): Promise<void> {
  if (parserInitialized) return;
  await TreeSitter.init();
  parserInitialized = true;
}

// Using `any` here because web-tree-sitter types don't match runtime well in CJS
/* eslint-disable @typescript-eslint/no-explicit-any */
type SyntaxNode = any;
type Tree = any;

async function getParser(language: string): Promise<any | null> {
  const wasmFile = GRAMMAR_MAP[language];
  if (!wasmFile) return null;

  try {
    await initParser();
    const parser = new TreeSitter();
    const lang = await TreeSitter.Language.load(path.join(WASM_DIR, wasmFile));
    parser.setLanguage(lang);
    return parser;
  } catch {
    return null;
  }
}

function extractFunctionName(node: SyntaxNode, _language: string): string {
  const nameNode =
    node.childForFieldName('name') ??
    node.childForFieldName('declarator')?.childForFieldName('name') ??
    null;

  if (nameNode) return nameNode.text;

  if (node.type === 'arrow_function' || node.type === 'function_expression') {
    const parent = node.parent;
    if (parent?.type === 'variable_declarator') {
      const varName = parent.childForFieldName('name');
      if (varName) return varName.text;
    }
    if (parent?.type === 'pair') {
      const key = parent.childForFieldName('key');
      if (key) return key.text;
    }
  }

  return '<anonymous>';
}

function extractParams(node: SyntaxNode): string[] {
  const params: string[] = [];
  const paramNode = node.childForFieldName('parameters');
  if (!paramNode) return params;

  for (let i = 0; i < paramNode.namedChildCount; i++) {
    const child = paramNode.namedChild(i);
    if (child) {
      const name = child.childForFieldName('name') ?? child;
      params.push(name.text);
    }
  }
  return params;
}

function countComplexity(node: SyntaxNode, branchingTypes: string[]): number {
  let count = 0;
  const cursor = node.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    if (branchingTypes.includes(cursor.nodeType)) {
      count++;
    }
    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return count;
}

function extractFunctions(tree: Tree, language: string): FunctionInfo[] {
  const functions: FunctionInfo[] = [];
  const funcTypes = FUNCTION_TYPES[language] ?? [];
  const branchTypes = BRANCHING_TYPES[language] ?? [];

  const cursor = tree.rootNode.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    const node = cursor.currentNode;
    if (funcTypes.includes(node.type)) {
      const name = extractFunctionName(node, language);
      functions.push({
        name,
        params: extractParams(node),
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
        complexity: 1 + countComplexity(node, branchTypes),
      });
    }

    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return functions;
}

function extractImports(tree: Tree, language: string): ImportInfo[] {
  const imports: ImportInfo[] = [];
  const cursor = tree.rootNode.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    const node = cursor.currentNode;

    if (language === 'javascript' || language === 'typescript' || language === 'tsx') {
      if (node.type === 'import_statement') {
        const source = node.childForFieldName('source');
        if (source) {
          const value = source.text.replace(/['"]/g, '');
          imports.push({ source: value, isRelative: value.startsWith('.') });
        }
      }
    } else if (language === 'python') {
      if (node.type === 'import_from_statement') {
        const module = node.childForFieldName('module_name');
        if (module) {
          const value = module.text;
          imports.push({ source: value, isRelative: value.startsWith('.') });
        }
      } else if (node.type === 'import_statement') {
        for (let i = 0; i < node.namedChildCount; i++) {
          const child = node.namedChild(i);
          if (child && child.type === 'dotted_name') {
            imports.push({ source: child.text, isRelative: false });
          }
        }
      }
    } else if (language === 'java') {
      if (node.type === 'import_declaration') {
        const pathNode = node.namedChild(0);
        if (pathNode) {
          imports.push({ source: pathNode.text, isRelative: false });
        }
      }
    } else if (language === 'go') {
      if (node.type === 'import_spec') {
        const pathNode = node.childForFieldName('path');
        if (pathNode) {
          const value = pathNode.text.replace(/"/g, '');
          imports.push({ source: value, isRelative: value.startsWith('.') || value.startsWith('/') });
        }
      }
    } else if (language === 'rust') {
      if (node.type === 'use_declaration') {
        const arg = node.namedChild(0);
        if (arg) {
          imports.push({ source: arg.text, isRelative: arg.text.startsWith('self::') || arg.text.startsWith('super::') });
        }
      }
    }

    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return imports;
}

function extractClasses(tree: Tree, language: string): ClassInfo[] {
  const classes: ClassInfo[] = [];
  const classTypes: Record<string, string[]> = {
    javascript: ['class_declaration'],
    typescript: ['class_declaration'],
    tsx: ['class_declaration'],
    python: ['class_definition'],
    java: ['class_declaration', 'interface_declaration'],
    go: ['type_declaration'],
    rust: ['struct_item', 'impl_item'],
  };

  const types = classTypes[language] ?? [];
  const cursor = tree.rootNode.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    const node = cursor.currentNode;
    if (types.includes(node.type)) {
      const nameNode = node.childForFieldName('name');
      const name = nameNode?.text ?? '<anonymous>';
      const methods: string[] = [];

      const body = node.childForFieldName('body');
      if (body) {
        for (let i = 0; i < body.namedChildCount; i++) {
          const child = body.namedChild(i);
          if (child) {
            const funcTypes = FUNCTION_TYPES[language] ?? [];
            if (funcTypes.includes(child.type)) {
              const methodName = extractFunctionName(child, language);
              methods.push(methodName);
            }
          }
        }
      }

      classes.push({
        name,
        methods,
        lineStart: node.startPosition.row + 1,
        lineEnd: node.endPosition.row + 1,
      });
    }

    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return classes;
}

function extractExports(tree: Tree, language: string): string[] {
  const exports: string[] = [];
  const cursor = tree.rootNode.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    const node = cursor.currentNode;

    if (language === 'javascript' || language === 'typescript' || language === 'tsx') {
      if (node.type === 'export_statement') {
        const declaration = node.childForFieldName('declaration');
        if (declaration) {
          const nameNode = declaration.childForFieldName('name');
          if (nameNode) exports.push(nameNode.text);
        }
      }
    } else if (language === 'python') {
      if (node.parent === tree.rootNode) {
        if (node.type === 'function_definition' || node.type === 'class_definition') {
          const nameNode = node.childForFieldName('name');
          if (nameNode && !nameNode.text.startsWith('_')) {
            exports.push(nameNode.text);
          }
        }
      }
    } else if (language === 'java') {
      if (node.type === 'class_declaration' || node.type === 'method_declaration') {
        const modifiers = node.childForFieldName('modifiers');
        if (modifiers?.text.includes('public')) {
          const nameNode = node.childForFieldName('name');
          if (nameNode) exports.push(nameNode.text);
        }
      }
    } else if (language === 'go') {
      if (node.type === 'function_declaration') {
        const nameNode = node.childForFieldName('name');
        if (nameNode && /^[A-Z]/.test(nameNode.text)) {
          exports.push(nameNode.text);
        }
      }
    }

    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return exports;
}

export async function parseFile(content: string, language: string): Promise<ASTMetadata | null> {
  try {
    const parser = await getParser(language);
    if (!parser) return null;

    const tree = parser.parse(content);
    if (!tree) return null;

    const functions = extractFunctions(tree, language);
    const importsResult = extractImports(tree, language);
    const classes = extractClasses(tree, language);
    const exportsResult = extractExports(tree, language);

    const totalComplexity = functions.reduce((sum, f) => sum + f.complexity, 0);

    tree.delete();
    parser.delete();

    return {
      functions,
      imports: importsResult,
      classes,
      exports: exportsResult,
      complexity: totalComplexity || 1,
    };
  } catch {
    return null;
  }
}

export async function parseFileTree(content: string, language: string): Promise<Tree | null> {
  try {
    const parser = await getParser(language);
    if (!parser) return null;
    return parser.parse(content);
  } catch {
    return null;
  }
}

export function countErrorNodes(tree: Tree): number {
  let count = 0;
  const cursor = tree.rootNode.walk();
  let reachedEnd = false;

  while (!reachedEnd) {
    if (cursor.nodeType === 'ERROR') count++;
    if (cursor.gotoFirstChild()) continue;
    if (cursor.gotoNextSibling()) continue;

    while (true) {
      if (!cursor.gotoParent()) {
        reachedEnd = true;
        break;
      }
      if (cursor.gotoNextSibling()) break;
    }
  }

  return count;
}

export interface DependencyGraph {
  components: string[][];
}

export function buildDependencyGraph(
  files: Array<{ filename: string; imports: ImportInfo[] }>,
  allFilenames: string[]
): DependencyGraph {
  const adjacency: Map<string, Set<string>> = new Map();
  const filenameSet = new Set(allFilenames);

  for (const f of allFilenames) {
    adjacency.set(f, new Set());
  }

  for (const file of files) {
    for (const imp of file.imports) {
      if (!imp.isRelative) continue;
      const resolved = resolveImport(imp.source, file.filename, filenameSet);
      if (resolved) {
        adjacency.get(file.filename)?.add(resolved);
        adjacency.get(resolved)?.add(file.filename);
      }
    }
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const filename of allFilenames) {
    if (visited.has(filename)) continue;
    const component: string[] = [];
    const queue = [filename];
    visited.add(filename);

    while (queue.length > 0) {
      const current = queue.shift()!;
      component.push(current);
      const neighbors = adjacency.get(current) ?? new Set();
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component);
  }

  return { components };
}

function resolveImport(importSource: string, _fromFile: string, allFilenames: Set<string>): string | null {
  const baseName = importSource.replace(/^\.\//, '').replace(/^\.\.\//, '');
  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.go', '.rs'];
  for (const ext of extensions) {
    const candidate = baseName + ext;
    if (allFilenames.has(candidate)) return candidate;
  }

  // Java: import com.example.UserService → match UserService.java
  if (importSource.includes('.')) {
    const lastPart = importSource.split('.').pop();
    if (lastPart) {
      for (const ext of ['.java', '.kt', '.scala']) {
        if (allFilenames.has(lastPart + ext)) return lastPart + ext;
      }
    }
  }

  // Python: from .models import User → match models.py
  if (importSource.startsWith('.')) {
    const moduleName = importSource.replace(/^\.+/, '');
    if (allFilenames.has(moduleName + '.py')) return moduleName + '.py';
  }

  return null;
}
/* eslint-enable @typescript-eslint/no-explicit-any */
