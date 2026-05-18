/**
 * scripts/analyzer/passes/list.ts — ListPass.
 *
 * Detects `arr.map(...)` and `arr.slice(start, start + visibleCount)` shapes
 * used by list components. Resolves the data array name, visible-count, scroll
 * setter, and labels-per-item by cross-referencing array literals, object
 * arrays, and numeric constants harvested from the entry source.
 *
 * Compound pass: collects all signals during `enter()` and produces the
 * `ListInfoRaw` in `finalize()`. Internally has two resolution sub-passes
 * (numeric-const forward-reference resolution) over the harvested data, not
 * over the AST — so the SourceScan walker still visits each node once.
 */

import ts from 'typescript';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export interface ListInfoRaw {
  dataArrayName: string;
  dataArrayValues: string[] | null;
  dataArrayObjects: Record<string, string>[] | null;
  propertyOrder: string[] | null;
  visibleCount: number;
  scrollSetterName: string | null;
  labelsPerItem: number;
}

interface SliceSite {
  varName: string | null;          // variable being assigned (= holder of scrollSetter context)
  sliceObjName: string | null;     // identifier on which .slice() is invoked
  startArgName: string | null;     // first arg identifier (for scrollSetter resolution)
  visibleCountLiteral: number | null;
  visibleCountIdentifier: string | null;
}

interface MapSite {
  objName: string | null;
  labelsPerItem: number;
}

export function makeListPass(ctx: PassContext): Pass<ListInfoRaw | null> {
  const arrayLiterals = new Map<string, string[]>();
  const objectArrayLiterals = new Map<string, Record<string, string>[]>();
  const sliceSites: SliceSite[] = [];
  const mapSites: MapSite[] = [];
  // Raw variable initializers, harvested during enter() and resolved in finalize().
  const varInits: Array<{ name: string; init: ts.Expression }> = [];
  const arrayBindingPatterns: Array<{ first: string; second: string }> = [];

  return {
    name: 'list',
    enter(node) {
      // Harvest array literal declarations (string[] and object[]).
      if (
        ts.isVariableDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.initializer &&
        ts.isArrayLiteralExpression(node.initializer)
      ) {
        const strValues: string[] = [];
        let allStrings = true;
        for (const el of node.initializer.elements) {
          if (ts.isStringLiteral(el)) strValues.push(el.text);
          else { allStrings = false; break; }
        }
        if (allStrings && strValues.length > 0) {
          arrayLiterals.set(node.name.text, strValues);
        } else {
          const objValues: Record<string, string>[] = [];
          let allObjects = true;
          for (const el of node.initializer.elements) {
            if (ts.isObjectLiteralExpression(el)) {
              const obj: Record<string, string> = {};
              for (const prop of el.properties) {
                if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name) && ts.isStringLiteral(prop.initializer)) {
                  obj[prop.name.text] = prop.initializer.text;
                }
              }
              if (Object.keys(obj).length > 0) objValues.push(obj);
              else { allObjects = false; break; }
            } else {
              allObjects = false;
              break;
            }
          }
          if (allObjects && objValues.length > 0) {
            objectArrayLiterals.set(node.name.text, objValues);
          }
        }
      }

      // Harvest every variable initializer for numeric-const resolution later.
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
        varInits.push({ name: node.name.text, init: node.initializer });
      }

      // Harvest [index, setter] = useState(...) for scroll-setter resolution.
      if (
        ts.isVariableDeclaration(node) &&
        ts.isArrayBindingPattern(node.name) &&
        node.name.elements.length >= 2
      ) {
        const first = node.name.elements[0]!;
        const second = node.name.elements[1]!;
        if (
          !ts.isOmittedExpression(first) && ts.isIdentifier(first.name) &&
          !ts.isOmittedExpression(second) && ts.isIdentifier(second.name)
        ) {
          arrayBindingPatterns.push({ first: first.name.text, second: second.name.text });
        }
      }

      // Harvest `arr.map(item => …)` sites.
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'map'
      ) {
        const obj = node.expression.expression;
        let labelsPerItem = 0;
        if (node.arguments.length > 0) {
          walk(node.arguments[0]!, (n) => {
            if (ts.isJsxSelfClosingElement(n) && ts.isIdentifier(n.tagName) && n.tagName.text === 'Text') labelsPerItem++;
            if (ts.isJsxElement(n) && ts.isIdentifier(n.openingElement.tagName) && n.openingElement.tagName.text === 'Text') labelsPerItem++;
          });
        }
        mapSites.push({
          objName: ts.isIdentifier(obj) ? obj.text : null,
          labelsPerItem,
        });
      }

      // Harvest `const x = arr.slice(start, start + count)` sites.
      if (
        ts.isVariableDeclaration(node) &&
        node.initializer &&
        ts.isCallExpression(node.initializer) &&
        ts.isPropertyAccessExpression(node.initializer.expression) &&
        node.initializer.expression.name.text === 'slice'
      ) {
        const sliceArgs = node.initializer.arguments;
        const site: SliceSite = {
          varName: ts.isIdentifier(node.name) ? node.name.text : null,
          sliceObjName: null,
          startArgName: null,
          visibleCountLiteral: null,
          visibleCountIdentifier: null,
        };
        const sliceObj = node.initializer.expression.expression;
        if (ts.isIdentifier(sliceObj)) site.sliceObjName = sliceObj.text;
        if (sliceArgs.length >= 2) {
          const secondArg = sliceArgs[1]!;
          if (ts.isBinaryExpression(secondArg) && secondArg.operatorToken.kind === ts.SyntaxKind.PlusToken) {
            if (ts.isNumericLiteral(secondArg.right)) site.visibleCountLiteral = Number(secondArg.right.text);
            else if (ts.isIdentifier(secondArg.right)) site.visibleCountIdentifier = secondArg.right.text;
          }
          const firstArg = sliceArgs[0]!;
          if (ts.isIdentifier(firstArg)) site.startArgName = firstArg.text;
        }
        sliceSites.push(site);
      }
    },
    finalize() {
      // ----- Resolve numeric constants from harvested varInits (two passes). -----
      const numericConsts = new Map<string, number>();
      function tryEvalNumeric(expr: ts.Expression): number | undefined {
        if (ts.isNumericLiteral(expr)) return Number(expr.text);
        if (ts.isIdentifier(expr)) return numericConsts.get(expr.text);
        if (ts.isParenthesizedExpression(expr)) return tryEvalNumeric(expr.expression);
        if (ts.isBinaryExpression(expr)) {
          const l = tryEvalNumeric(expr.left);
          const r = tryEvalNumeric(expr.right);
          if (l !== undefined && r !== undefined) {
            switch (expr.operatorToken.kind) {
              case ts.SyntaxKind.PlusToken: return l + r;
              case ts.SyntaxKind.MinusToken: return l - r;
              case ts.SyntaxKind.AsteriskToken: return l * r;
              case ts.SyntaxKind.SlashToken: return r !== 0 ? l / r : undefined;
              case ts.SyntaxKind.PercentToken: return r !== 0 ? l % r : undefined;
            }
          }
        }
        if (ts.isCallExpression(expr) && ts.isPropertyAccessExpression(expr.expression)) {
          const obj = expr.expression.expression;
          const method = expr.expression.name.text;
          if (ts.isIdentifier(obj) && obj.text === 'Math' && expr.arguments.length >= 1) {
            const args = expr.arguments.map(a => tryEvalNumeric(a));
            if (args.every(a => a !== undefined)) {
              const nums = args as number[];
              switch (method) {
                case 'floor': return Math.floor(nums[0]!);
                case 'ceil': return Math.ceil(nums[0]!);
                case 'round': return Math.round(nums[0]!);
                case 'min': return Math.min(...nums);
                case 'max': return Math.max(...nums);
                case 'abs': return Math.abs(nums[0]!);
              }
            }
          }
        }
        if (ts.isPropertyAccessExpression(expr) && expr.name.text === 'length' && ts.isIdentifier(expr.expression)) {
          const arr = arrayLiterals.get(expr.expression.text);
          if (arr) return arr.length;
          const objArr = objectArrayLiterals.get(expr.expression.text);
          if (objArr) return objArr.length;
        }
        return undefined;
      }
      for (const { name, init } of varInits) {
        const v = tryEvalNumeric(init);
        if (v !== undefined) numericConsts.set(name, v);
      }
      // Forward-reference resolution sub-pass.
      for (const { name, init } of varInits) {
        if (!numericConsts.has(name)) {
          const v = tryEvalNumeric(init);
          if (v !== undefined) numericConsts.set(name, v);
        }
      }

      // ----- First map (with identifier) establishes the data array; every
      //       map with positive labelsPerItem overwrites the count. Matches
      //       the legacy walk order. -----
      const firstMap = mapSites.find((m) => m.objName !== null);
      const mapFound = mapSites.length > 0;
      let dataArrayName: string | null = firstMap?.objName ?? null;
      let dataArrayValues: string[] | null = null;
      let dataArrayObjects: Record<string, string>[] | null = null;
      if (dataArrayName) {
        dataArrayValues = arrayLiterals.get(dataArrayName) ?? null;
        dataArrayObjects = objectArrayLiterals.get(dataArrayName) ?? null;
      }
      let labelsPerItem = 1;
      for (const m of mapSites) {
        if (m.labelsPerItem > 0) labelsPerItem = m.labelsPerItem;
      }

      // ----- Apply slice-site information (visibleCount, scrollSetter). -----
      let visibleCount = 3;
      let scrollSetterName: string | null = null;
      for (const site of sliceSites) {
        if (site.visibleCountLiteral !== null) visibleCount = site.visibleCountLiteral;
        else if (site.visibleCountIdentifier !== null) {
          const v = numericConsts.get(site.visibleCountIdentifier);
          if (v !== undefined) visibleCount = v;
        }
        if (site.startArgName !== null) {
          for (const pat of arrayBindingPatterns) {
            if (pat.first === site.startArgName) {
              scrollSetterName = pat.second;
              break;
            }
          }
        }
        if (site.sliceObjName !== null) {
          dataArrayName = site.sliceObjName;
          dataArrayValues = arrayLiterals.get(site.sliceObjName) ?? null;
          dataArrayObjects = objectArrayLiterals.get(site.sliceObjName) ?? null;
        }
      }

      if (!mapFound || !dataArrayName) return null;

      let propertyOrder: string[] | null = null;
      if (dataArrayObjects && dataArrayObjects.length > 0 && labelsPerItem > 1) {
        propertyOrder = Object.keys(dataArrayObjects[0]!).slice(0, labelsPerItem);
      }

      return { dataArrayName, dataArrayValues, dataArrayObjects, propertyOrder, visibleCount, scrollSetterName, labelsPerItem };
    },
  };
}

/** Back-compat wrapper matching the legacy `detectListPatterns` signature. */
export function detectListPatterns(sf: ts.SourceFile): ListInfoRaw | null {
  const ctx = buildPassContext(sf);
  const pass = makeListPass(ctx);
  walk(sf, (n) => pass.enter(n));
  return pass.finalize();
}
