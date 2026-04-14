/**
 * config/index.ts — Declarative configuration page builder for Pebble apps.
 *
 * Generates a self-contained HTML configuration page (suitable for use as a
 * data URI) from a declarative specification. The generated page matches
 * Pebble's native config page styling and handles serialization back to the
 * watch via the `webviewclosed` event.
 *
 * Usage:
 *   import { renderConfigPage, ConfigPage, ConfigSection, ConfigColor } from 'react-pebble/config';
 *
 *   const html = renderConfigPage({
 *     sections: [
 *       { title: 'Colors', items: [
 *         { type: 'color', key: 'bgColor', label: 'Background', default: '000000' },
 *       ]},
 *     ],
 *   });
 *
 * Or use the JSX-style builder:
 *   const page = ConfigPage([
 *     ConfigSection('Colors', [
 *       ConfigColor('bgColor', 'Background', '000000'),
 *     ]),
 *   ]);
 *   const html = renderConfigPage(page);
 */

// ---------------------------------------------------------------------------
// Config specification types
// ---------------------------------------------------------------------------

export interface ConfigColorItem {
  type: 'color';
  key: string;
  label: string;
  default: string; // hex without #, e.g. '000000'
}

export interface ConfigToggleItem {
  type: 'toggle';
  key: string;
  label: string;
  default: boolean;
}

export interface ConfigTextItem {
  type: 'text';
  key: string;
  label: string;
  default: string;
}

export interface ConfigSelectItem {
  type: 'select';
  key: string;
  label: string;
  default: string;
  options: Array<{ label: string; value: string }>;
}

export interface ConfigInputItem {
  type: 'input';
  key: string;
  label: string;
  default: string;
  /** HTML input type: 'text', 'email', 'tel', 'number', 'url', 'password'. */
  inputType?: 'text' | 'email' | 'tel' | 'number' | 'url' | 'password';
  placeholder?: string;
  /** RegExp source for HTML pattern validation. */
  pattern?: string;
  /** Min/max for numeric inputs. */
  min?: number;
  max?: number;
}

export interface ConfigRangeItem {
  type: 'range';
  key: string;
  label: string;
  default: number;
  min: number;
  max: number;
  step?: number;
  /** Show a live value readout next to the slider (default: true). */
  showValue?: boolean;
}

export interface ConfigHeadingItem {
  type: 'heading';
  /** Display-only; no key because headings have no value. */
  label: string;
  /** Heading level (1-3). Default: 2. */
  level?: 1 | 2 | 3;
}

export interface ConfigRadioGroupItem {
  type: 'radiogroup';
  key: string;
  label: string;
  default: string;
  options: Array<{ label: string; value: string }>;
}

export interface ConfigCheckboxGroupItem {
  type: 'checkboxgroup';
  key: string;
  label: string;
  /** Array of currently-checked option values. */
  default: string[];
  options: Array<{ label: string; value: string }>;
}

export interface ConfigSubmitItem {
  type: 'submit';
  label: string;
  /** Primary color (hex without #). Defaults to Pebble green. */
  color?: string;
}

export type ConfigItem =
  | ConfigColorItem
  | ConfigToggleItem
  | ConfigTextItem
  | ConfigSelectItem
  | ConfigInputItem
  | ConfigRangeItem
  | ConfigHeadingItem
  | ConfigRadioGroupItem
  | ConfigCheckboxGroupItem
  | ConfigSubmitItem;

export interface ConfigSectionSpec {
  title: string;
  items: ConfigItem[];
}

export interface ConfigPageSpec {
  sections: ConfigSectionSpec[];
  /** App name displayed at the top. */
  appName?: string;
  /** Submit button label (default: "Save Settings"). */
  submitLabel?: string;
}

// ---------------------------------------------------------------------------
// Builder functions (Clay-style declarative API)
// ---------------------------------------------------------------------------

export function ConfigColor(key: string, label: string, defaultValue: string = '000000'): ConfigColorItem {
  return { type: 'color', key, label, default: defaultValue };
}

export function ConfigToggle(key: string, label: string, defaultValue: boolean = false): ConfigToggleItem {
  return { type: 'toggle', key, label, default: defaultValue };
}

export function ConfigText(key: string, label: string, defaultValue: string = ''): ConfigTextItem {
  return { type: 'text', key, label, default: defaultValue };
}

export function ConfigSelect(
  key: string,
  label: string,
  options: Array<{ label: string; value: string }>,
  defaultValue?: string,
): ConfigSelectItem {
  return { type: 'select', key, label, options, default: defaultValue ?? options[0]?.value ?? '' };
}

export function ConfigInput(
  key: string,
  label: string,
  defaultValue: string = '',
  options?: Pick<ConfigInputItem, 'inputType' | 'placeholder' | 'pattern' | 'min' | 'max'>,
): ConfigInputItem {
  return { type: 'input', key, label, default: defaultValue, ...(options ?? {}) };
}

export function ConfigRange(
  key: string,
  label: string,
  min: number,
  max: number,
  defaultValue?: number,
  step?: number,
): ConfigRangeItem {
  return {
    type: 'range',
    key,
    label,
    min,
    max,
    step,
    default: defaultValue ?? min,
  };
}

export function ConfigHeading(label: string, level: 1 | 2 | 3 = 2): ConfigHeadingItem {
  return { type: 'heading', label, level };
}

export function ConfigRadioGroup(
  key: string,
  label: string,
  options: Array<{ label: string; value: string }>,
  defaultValue?: string,
): ConfigRadioGroupItem {
  return { type: 'radiogroup', key, label, options, default: defaultValue ?? options[0]?.value ?? '' };
}

export function ConfigCheckboxGroup(
  key: string,
  label: string,
  options: Array<{ label: string; value: string }>,
  defaultValue: string[] = [],
): ConfigCheckboxGroupItem {
  return { type: 'checkboxgroup', key, label, options, default: defaultValue };
}

export function ConfigSubmit(label: string = 'Save Settings', color?: string): ConfigSubmitItem {
  return { type: 'submit', label, ...(color ? { color } : {}) };
}

export function ConfigSection(title: string, items: ConfigItem[]): ConfigSectionSpec {
  return { title, items };
}

export function ConfigPage(
  sections: ConfigSectionSpec[],
  options?: { appName?: string; submitLabel?: string },
): ConfigPageSpec {
  return { sections, appName: options?.appName, submitLabel: options?.submitLabel };
}

// ---------------------------------------------------------------------------
// Pebble 64-color palette for the color picker
// ---------------------------------------------------------------------------

const PEBBLE_COLORS = [
  '000000', '000055', '0000AA', '0000FF',
  '005500', '005555', '0055AA', '0055FF',
  '00AA00', '00AA55', '00AAAA', '00AAFF',
  '00FF00', '00FF55', '00FFAA', '00FFFF',
  '550000', '550055', '5500AA', '5500FF',
  '555500', '555555', '5555AA', '5555FF',
  '55AA00', '55AA55', '55AAAA', '55AAFF',
  '55FF00', '55FF55', '55FFAA', '55FFFF',
  'AA0000', 'AA0055', 'AA00AA', 'AA00FF',
  'AA5500', 'AA5555', 'AA55AA', 'AA55FF',
  'AAAA00', 'AAAA55', 'AAAAAA', 'AAAAFF',
  'AAFF00', 'AAFF55', 'AAFFAA', 'AAFFFF',
  'FF0000', 'FF0055', 'FF00AA', 'FF00FF',
  'FF5500', 'FF5555', 'FF55AA', 'FF55FF',
  'FFAA00', 'FFAA55', 'FFAAAA', 'FFAAFF',
  'FFFF00', 'FFFF55', 'FFFFAA', 'FFFFFF',
];

// ---------------------------------------------------------------------------
// HTML renderer
// ---------------------------------------------------------------------------

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderItemHtml(item: ConfigItem): string {
  switch (item.type) {
    case 'color': {
      const swatches = PEBBLE_COLORS.map(
        (c) =>
          `<div class="swatch${c === item.default ? ' selected' : ''}" ` +
          `style="background:#${c}" data-color="${c}" ` +
          `onclick="selectColor(this,'${item.key}')"></div>`,
      ).join('');
      return `
        <div class="config-item">
          <label>${escapeHtml(item.label)}</label>
          <input type="hidden" id="cfg-${item.key}" name="${item.key}" value="${item.default}">
          <div class="color-grid">${swatches}</div>
        </div>`;
    }
    case 'toggle':
      return `
        <div class="config-item toggle-item">
          <label>${escapeHtml(item.label)}</label>
          <label class="switch">
            <input type="checkbox" id="cfg-${item.key}" name="${item.key}" ${item.default ? 'checked' : ''}>
            <span class="slider"></span>
          </label>
        </div>`;
    case 'text':
      return `
        <div class="config-item">
          <label>${escapeHtml(item.label)}</label>
          <input type="text" id="cfg-${item.key}" name="${item.key}" value="${escapeHtml(item.default)}">
        </div>`;
    case 'select': {
      const opts = item.options.map(
        (o) => `<option value="${escapeHtml(o.value)}"${o.value === item.default ? ' selected' : ''}>${escapeHtml(o.label)}</option>`,
      ).join('');
      return `
        <div class="config-item">
          <label>${escapeHtml(item.label)}</label>
          <select id="cfg-${item.key}" name="${item.key}">${opts}</select>
        </div>`;
    }
    case 'input': {
      const attrs = [
        `type="${item.inputType ?? 'text'}"`,
        `id="cfg-${item.key}"`,
        `name="${item.key}"`,
        `value="${escapeHtml(item.default)}"`,
        item.placeholder ? `placeholder="${escapeHtml(item.placeholder)}"` : '',
        item.pattern ? `pattern="${escapeHtml(item.pattern)}"` : '',
        item.min !== undefined ? `min="${item.min}"` : '',
        item.max !== undefined ? `max="${item.max}"` : '',
      ].filter(Boolean).join(' ');
      return `
        <div class="config-item">
          <label>${escapeHtml(item.label)}</label>
          <input ${attrs}>
        </div>`;
    }
    case 'range': {
      const step = item.step ?? 1;
      const showValue = item.showValue !== false;
      return `
        <div class="config-item">
          <label>${escapeHtml(item.label)}${showValue ? ` <span class="range-value" id="cfg-${item.key}-val">${item.default}</span>` : ''}</label>
          <input type="range" id="cfg-${item.key}" name="${item.key}" min="${item.min}" max="${item.max}" step="${step}" value="${item.default}"${showValue ? ` oninput="document.getElementById('cfg-${item.key}-val').textContent = this.value"` : ''}>
        </div>`;
    }
    case 'heading': {
      const lvl = item.level ?? 2;
      return `<div class="config-heading heading-${lvl}"><h${lvl}>${escapeHtml(item.label)}</h${lvl}></div>`;
    }
    case 'radiogroup': {
      const opts = item.options.map(
        (o, i) => `
          <label class="radio-item">
            <input type="radio" id="cfg-${item.key}-${i}" name="${item.key}" value="${escapeHtml(o.value)}"${o.value === item.default ? ' checked' : ''}>
            <span>${escapeHtml(o.label)}</span>
          </label>`,
      ).join('');
      return `
        <div class="config-item radio-group" data-key="${item.key}">
          <label class="group-label">${escapeHtml(item.label)}</label>
          ${opts}
        </div>`;
    }
    case 'checkboxgroup': {
      const defaults = new Set(item.default);
      const opts = item.options.map(
        (o, i) => `
          <label class="checkbox-item">
            <input type="checkbox" id="cfg-${item.key}-${i}" data-group="${item.key}" value="${escapeHtml(o.value)}"${defaults.has(o.value) ? ' checked' : ''}>
            <span>${escapeHtml(o.label)}</span>
          </label>`,
      ).join('');
      return `
        <div class="config-item checkbox-group" data-key="${item.key}">
          <label class="group-label">${escapeHtml(item.label)}</label>
          ${opts}
        </div>`;
    }
    case 'submit': {
      const color = item.color ? `#${item.color}` : '';
      const style = color ? ` style="background:${color}"` : '';
      return `<button class="submit-btn inline-submit"${style} onclick="submitSettings()">${escapeHtml(item.label)}</button>`;
    }
  }
}

/**
 * Render a ConfigPageSpec to a complete, self-contained HTML string.
 *
 * The HTML includes all CSS and JS inline so it can be used as a data URI.
 * When the user taps "Save Settings", the page serializes all form values
 * as JSON, URI-encodes it, and closes — triggering the `webviewclosed`
 * event in PebbleKit JS with the encoded response.
 */
export function renderConfigPage(spec: ConfigPageSpec): string {
  const title = escapeHtml(spec.appName ?? 'App Settings');
  const submitLabel = escapeHtml(spec.submitLabel ?? 'Save Settings');

  const sectionsHtml = spec.sections.map((section) => {
    const itemsHtml = section.items.map(renderItemHtml).join('');
    return `
      <div class="section">
        <h2>${escapeHtml(section.title)}</h2>
        ${itemsHtml}
      </div>`;
  }).join('');

  // Collect all keys for the submit handler
  const allItems = spec.sections.flatMap((s) => s.items);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  background: #f5f5f5; color: #333; padding: 16px;
}
h1 { font-size: 20px; text-align: center; margin: 12px 0 20px; color: #222; }
h2 { font-size: 14px; text-transform: uppercase; color: #888; margin: 16px 0 8px; letter-spacing: 0.5px; }
.section { margin-bottom: 8px; }
.config-item {
  background: #fff; padding: 12px 16px; margin-bottom: 1px;
  border-bottom: 1px solid #eee;
}
.config-item label { display: block; font-size: 15px; margin-bottom: 6px; }
.toggle-item { display: flex; align-items: center; justify-content: space-between; }
.toggle-item label { margin-bottom: 0; }
input[type="text"], select {
  width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 6px;
  font-size: 15px; background: #fafafa;
}
.color-grid {
  display: grid; grid-template-columns: repeat(8, 1fr); gap: 3px;
  max-width: 280px;
}
.swatch {
  width: 32px; height: 32px; border-radius: 4px; cursor: pointer;
  border: 2px solid transparent; transition: border-color 0.15s;
}
.swatch:hover { border-color: #666; }
.swatch.selected { border-color: #fff; box-shadow: 0 0 0 2px #333; }
.switch { position: relative; width: 50px; height: 28px; flex-shrink: 0; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider {
  position: absolute; inset: 0; background: #ccc; border-radius: 28px;
  transition: 0.3s; cursor: pointer;
}
.slider:before {
  content: ""; position: absolute; height: 22px; width: 22px;
  left: 3px; bottom: 3px; background: #fff; border-radius: 50%;
  transition: 0.3s;
}
input:checked + .slider { background: #4CAF50; }
input:checked + .slider:before { transform: translateX(22px); }
.submit-btn {
  display: block; width: 100%; padding: 14px; margin: 24px 0;
  background: #4CAF50; color: #fff; border: none; border-radius: 8px;
  font-size: 16px; font-weight: 600; cursor: pointer;
  transition: background 0.2s;
}
.submit-btn:hover { filter: brightness(1.08); }
.submit-btn:active { filter: brightness(0.9); }
.inline-submit { margin-top: 8px; margin-bottom: 8px; }
input[type="range"] { width: 100%; }
.range-value {
  float: right; font-weight: 600; color: #4CAF50;
  font-variant-numeric: tabular-nums;
}
.config-heading { margin: 20px 0 8px; }
.config-heading h1 { font-size: 18px; color: #222; }
.config-heading h2 { font-size: 14px; text-transform: uppercase; color: #888; letter-spacing: 0.5px; }
.config-heading h3 { font-size: 13px; color: #666; }
.radio-item, .checkbox-item {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 0; cursor: pointer;
}
.radio-item input, .checkbox-item input { margin: 0; }
.group-label { font-weight: 500; margin-bottom: 6px !important; }
</style>
</head>
<body>
<h1>${title}</h1>
${sectionsHtml}
<button class="submit-btn" onclick="submitSettings()">${submitLabel}</button>
<script>
function selectColor(el, key) {
  var grid = el.parentNode;
  var prev = grid.querySelector('.selected');
  if (prev) prev.classList.remove('selected');
  el.classList.add('selected');
  document.getElementById('cfg-' + key).value = el.dataset.color;
}

// Load saved settings from URL hash (passed by PebbleKit JS)
function loadSavedSettings() {
  var hash = window.location.hash;
  if (!hash || hash.length < 2) return;
  try {
    var saved = JSON.parse(decodeURIComponent(hash.substring(1)));
    if (!saved || typeof saved !== 'object') return;
    for (var key in saved) {
      var val = saved[key];
      // Radio group: pick the matching radio input by name
      var radios = document.querySelectorAll('input[type="radio"][name="' + key + '"]');
      if (radios.length > 0) {
        for (var ri = 0; ri < radios.length; ri++) {
          radios[ri].checked = (radios[ri].value === String(val));
        }
        continue;
      }
      // Checkbox group: array of values
      var boxes = document.querySelectorAll('input[data-group="' + key + '"]');
      if (boxes.length > 0 && Array.isArray(val)) {
        for (var bi = 0; bi < boxes.length; bi++) {
          boxes[bi].checked = val.indexOf(boxes[bi].value) >= 0;
        }
        continue;
      }
      var el = document.getElementById('cfg-' + key);
      if (!el) continue;
      if (el.type === 'checkbox') {
        el.checked = val === true || val === 'true' || val === 1;
      } else if (el.type === 'range') {
        el.value = val;
        var readout = document.getElementById('cfg-' + key + '-val');
        if (readout) readout.textContent = val;
      } else if (el.type === 'hidden') {
        // Color picker — select the matching swatch
        el.value = val;
        var grid = el.nextElementSibling;
        if (grid && grid.classList.contains('color-grid')) {
          var prev = grid.querySelector('.selected');
          if (prev) prev.classList.remove('selected');
          var match = grid.querySelector('[data-color="' + val + '"]');
          if (match) match.classList.add('selected');
        }
      } else if (el.tagName === 'SELECT') {
        el.value = val;
      } else {
        el.value = val;
      }
    }
  } catch (e) {
    // ignore parse errors
  }
}

function submitSettings() {
  var settings = {};
  ${allItems.map((item) => {
    if (item.type === 'heading' || item.type === 'submit') return '';
    if (item.type === 'toggle') {
      return `settings["${item.key}"] = document.getElementById("cfg-${item.key}").checked;`;
    }
    if (item.type === 'range') {
      return `settings["${item.key}"] = Number(document.getElementById("cfg-${item.key}").value);`;
    }
    if (item.type === 'input' && item.inputType === 'number') {
      return `settings["${item.key}"] = Number(document.getElementById("cfg-${item.key}").value);`;
    }
    if (item.type === 'radiogroup') {
      return `(function() { var sel = document.querySelector('input[name="${item.key}"]:checked'); settings["${item.key}"] = sel ? sel.value : ""; })();`;
    }
    if (item.type === 'checkboxgroup') {
      return `(function() { var boxes = document.querySelectorAll('input[data-group="${item.key}"]:checked'); settings["${item.key}"] = Array.prototype.map.call(boxes, function(b) { return b.value; }); })();`;
    }
    return `settings["${item.key}"] = document.getElementById("cfg-${item.key}").value;`;
  }).filter(Boolean).join('\n  ')}
  var encoded = encodeURIComponent(JSON.stringify(settings));
  if (window.location.href.indexOf('pebblejs://') === 0 || navigator.userAgent.indexOf('Pebble') >= 0) {
    window.location.href = 'pebblejs://close#' + encoded;
  } else {
    document.location = 'pebblejs://close#' + encoded;
  }
}

// Apply saved settings on page load
loadSavedSettings();
</script>
</body>
</html>`;
}

/**
 * Convert a ConfigPageSpec to a data URI suitable for Pebble.openURL().
 * This is the form used in useConfiguration's `url` prop.
 */
export function configPageToDataUri(spec: ConfigPageSpec): string {
  const html = renderConfigPage(spec);
  return 'data:text/html,' + encodeURIComponent(html);
}
