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

export type ConfigItem = ConfigColorItem | ConfigToggleItem | ConfigTextItem | ConfigSelectItem;

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
.submit-btn:hover { background: #45a049; }
.submit-btn:active { background: #3d8b40; }
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
      var el = document.getElementById('cfg-' + key);
      if (!el) continue;
      var val = saved[key];
      if (el.type === 'checkbox') {
        el.checked = val === true || val === 'true' || val === 1;
        // Update slider visual
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
    if (item.type === 'toggle') {
      return `settings["${item.key}"] = document.getElementById("cfg-${item.key}").checked;`;
    }
    return `settings["${item.key}"] = document.getElementById("cfg-${item.key}").value;`;
  }).join('\n  ')}
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
