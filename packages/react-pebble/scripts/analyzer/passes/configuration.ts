/**
 * scripts/analyzer/passes/configuration.ts — ConfigPass.
 *
 * Detects `useConfiguration({ url, defaults })` plus the surrounding
 * `ConfigPage / ConfigSection / ConfigColor / ConfigToggle / ConfigText /
 * ConfigSelect / ConfigCheckboxGroup` call sites that contribute labels,
 * option lists, app name, and section titles.
 *
 * Matches the textual identifiers (legacy semantics — no symbol resolution).
 */

import ts from 'typescript';
import type { Pass, PassContext } from './types.js';
import { buildPassContext } from './types.js';
import { walk } from '../source-scan.js';

export interface ConfigInfoRaw {
  keys: Array<{
    key: string;
    label: string;
    type: 'color' | 'boolean' | 'string' | 'checkboxgroup';
    default: string | boolean | string[];
    options?: string[];
  }>;
  url: string | null;
  appName: string | null;
  sectionTitles: string[];
}

const CONFIG_ITEM_FNS = ['ConfigColor', 'ConfigToggle', 'ConfigText', 'ConfigSelect', 'ConfigCheckboxGroup'];

export function makeConfigPass(ctx: PassContext): Pass<ConfigInfoRaw | null> {
  const keys: ConfigInfoRaw['keys'] = [];
  const labelMap = new Map<string, string>();
  const optionsMap = new Map<string, string[]>();
  const sectionTitles: string[] = [];
  let urlValue: string | null = null;
  let appName: string | null = null;

  return {
    name: 'config',
    enter(node) {
      // useConfiguration({...}) — keys and url.
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        node.expression.text === 'useConfiguration' &&
        node.arguments.length > 0 &&
        ts.isObjectLiteralExpression(node.arguments[0]!)
      ) {
        const objLit = node.arguments[0] as ts.ObjectLiteralExpression;
        for (const prop of objLit.properties) {
          if (!ts.isPropertyAssignment(prop) || !ts.isIdentifier(prop.name)) continue;

          if (prop.name.text === 'url') {
            if (ts.isStringLiteral(prop.initializer)) urlValue = prop.initializer.text;
            else urlValue = prop.initializer.getText(ctx.sf);
          }

          if (prop.name.text === 'defaults' && ts.isObjectLiteralExpression(prop.initializer)) {
            const defaults = prop.initializer as ts.ObjectLiteralExpression;
            for (const dp of defaults.properties) {
              if (!ts.isPropertyAssignment(dp) || !ts.isIdentifier(dp.name)) continue;
              const key = dp.name.text;
              const init = dp.initializer;
              const defaultLabel = key.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());

              if (init.kind === ts.SyntaxKind.TrueKeyword || init.kind === ts.SyntaxKind.FalseKeyword) {
                keys.push({ key, label: defaultLabel, type: 'boolean', default: init.kind === ts.SyntaxKind.TrueKeyword });
              } else if (ts.isStringLiteral(init)) {
                const val = init.text;
                const isColor = /^[0-9a-fA-F]{6}$/.test(val);
                keys.push({ key, label: defaultLabel, type: isColor ? 'color' : 'string', default: val });
              } else if (ts.isNumericLiteral(init)) {
                keys.push({ key, label: defaultLabel, type: 'string', default: init.text });
              } else if (ts.isArrayLiteralExpression(init)) {
                const defaults: string[] = [];
                for (const el of init.elements) {
                  if (ts.isStringLiteral(el)) defaults.push(el.text);
                }
                keys.push({ key, label: defaultLabel, type: 'checkboxgroup', default: defaults });
              }
            }
          }
        }
        return;
      }

      // ConfigXxx() — labels, options, section titles, appName.
      if (!ts.isCallExpression(node) || !ts.isIdentifier(node.expression)) return;
      const fnName = node.expression.text;

      if (CONFIG_ITEM_FNS.includes(fnName) && node.arguments.length >= 2) {
        const keyArg = node.arguments[0];
        const labelArg = node.arguments[1];
        if (keyArg && ts.isStringLiteral(keyArg) && labelArg && ts.isStringLiteral(labelArg)) {
          labelMap.set(keyArg.text, labelArg.text);
        }
      }

      if (fnName === 'ConfigCheckboxGroup' && node.arguments.length >= 3) {
        const keyArg = node.arguments[0];
        const optsArg = node.arguments[2];
        if (keyArg && ts.isStringLiteral(keyArg) && optsArg && ts.isArrayLiteralExpression(optsArg)) {
          const optValues: string[] = [];
          for (const el of optsArg.elements) {
            if (ts.isObjectLiteralExpression(el)) {
              for (const prop of el.properties) {
                if (
                  ts.isPropertyAssignment(prop) &&
                  ts.isIdentifier(prop.name) &&
                  prop.name.text === 'value' &&
                  ts.isStringLiteral(prop.initializer)
                ) {
                  optValues.push(prop.initializer.text);
                }
              }
            }
          }
          if (optValues.length > 0) optionsMap.set(keyArg.text, optValues);
        }
      }

      if (fnName === 'ConfigSection' && node.arguments.length >= 1) {
        const titleArg = node.arguments[0];
        if (titleArg && ts.isStringLiteral(titleArg)) sectionTitles.push(titleArg.text);
      }

      if (fnName === 'ConfigPage' && node.arguments.length >= 2) {
        const optsArg = node.arguments[1];
        if (optsArg && ts.isObjectLiteralExpression(optsArg)) {
          for (const prop of optsArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              ts.isIdentifier(prop.name) &&
              prop.name.text === 'appName' &&
              ts.isStringLiteral(prop.initializer)
            ) {
              appName = prop.initializer.text;
            }
          }
        }
      }
    },
    finalize() {
      if (keys.length === 0) return null;
      for (const k of keys) {
        const label = labelMap.get(k.key);
        if (label) k.label = label;
        if (k.type === 'checkboxgroup') {
          const opts = optionsMap.get(k.key);
          if (opts) k.options = opts;
        }
      }
      return { keys, url: urlValue, appName, sectionTitles };
    },
  };
}

/** Back-compat wrapper matching the legacy `detectUseConfiguration` signature. */
export function detectUseConfiguration(sf: ts.SourceFile): ConfigInfoRaw | null {
  const ctx = buildPassContext(sf);
  const pass = makeConfigPass(ctx);
  walk(sf, (n) => pass.enter(n));
  return pass.finalize();
}
