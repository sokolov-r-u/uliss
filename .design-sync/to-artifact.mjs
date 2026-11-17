#!/usr/bin/env node
// Lays the design-sync converter output (ds-bundle/) out as the files of a Design System artifact (project/...).
// /design-sync cannot publish to artifacts yet; see NOTES.md. Usage, from the repo root:
//   node .design-sync/to-artifact.mjs --bundle ./ds-bundle --tokens <tokens.json> --out .design-sync/.cache/artifact
// Writes <out>/project/{components/**,fonts/*,data/**} and, with --tokens, tokens.css; publish every one of them.
// README.md, tokens.json and design-system.json stay hand-merged in the artifact.
import fs from 'node:fs';
import path from 'node:path';

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
};
const BUNDLE = arg('bundle', './ds-bundle');
const TOKENS = arg('tokens');
const OUT = path.join(arg('out', '.design-sync/.cache/artifact'), 'project');
const CONFIG = JSON.parse(fs.readFileSync('.design-sync/config.json', 'utf8'));
// Providers and contexts ship in the bundle but get no card (Design System type rule).
const NO_CARD = new Set(['LocaleProvider']);
const SINGLE_HEIGHT = { Dialog: 420, ItemMenu: 320 };
// The artifact frame blocks fetches to jsDelivr; the picker previews read the app's own emoji data from the artifact.
const EMOJI_VERSION = '1.8.0';
const EMOJI_CDN = `https://cdn.jsdelivr.net/npm/emoji-picker-element-data@${EMOJI_VERSION}/en/emojibase/data.json`;
const EMOJI_FILE = 'data/emoji-picker-element-data/en/emojibase/data.json';
const EMOJI_PREVIEWS = new Set(['EmojiPicker', 'IconPicker']);

const read = (p) => fs.readFileSync(p, 'utf8');
const write = (rel, text) => {
  const p = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text);
};
const assertInlineSafe = (label, text) => {
  if (/<\/script|<!--/i.test(text)) throw new Error(`${label}: contains </script or <!-- and cannot be inlined`);
};
const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1);

for (const dir of ['components', 'fonts', 'data']) fs.rmSync(path.join(OUT, dir), { recursive: true, force: true });

// -- bundle.js: converter header -> format 4 header (catalogue without provider cards).
const bundle = read(path.join(BUNDLE, '_ds_bundle.js'));
const headerMatch = /^\/\* @ds-bundle: (\{.*?\}) \*\//.exec(bundle);
if (!headerMatch) throw new Error('_ds_bundle.js: no @ds-bundle header');
const header = JSON.parse(headerMatch[1]);
const cards = header.components.filter((c) => !NO_CARD.has(c.name));
const newHeader = { format: 4, namespace: header.namespace, components: cards.map((c) => ({ name: c.name })) };
const bundleOut = `/* @ds-bundle: ${JSON.stringify(newHeader)} */${bundle.slice(headerMatch[0].length)}`;
assertInlineSafe('bundle.js', bundleOut);
write('components/bundle.js', bundleOut);

// -- bundle.css: the package's own @font-face (urls repointed at project/fonts/) + token and component CSS.
const fontsCss = read(path.join(BUNDLE, 'fonts/fonts.css')).replace(/url\('\.\/([^']+)'\)/g, "url('../fonts/$1')");
const bundleCss = `${fontsCss}\n${read(path.join(BUNDLE, '_ds_bundle.css'))}`;
if (/<\/style/i.test(bundleCss)) throw new Error('bundle.css: contains </style');
write('components/bundle.css', bundleCss);

// -- Font files follow the package; their unicode-range per file feeds tokens.css below.
const unicodeRange = new Map();
for (const block of read(path.join(BUNDLE, 'fonts/fonts.css')).split('@font-face').slice(1)) {
  const file = /url\('\.\/([^']+)'\)/.exec(block)?.[1];
  const range = /unicode-range:\s*([^;]+);/.exec(block)?.[1];
  if (file && range) unicodeRange.set(file, range.trim());
}
for (const f of fs.readdirSync(path.join(BUNDLE, 'fonts')).filter((f) => /\.(woff2?|ttf|otf)$/.test(f))) {
  const p = path.join(OUT, 'fonts', f);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.copyFileSync(path.join(BUNDLE, 'fonts', f), p);
}

// -- React 19 runtime (the type defaults to React 18 from jsDelivr). react.js also defines window.ReactDOM.
for (const f of ['react.js', 'react-dom.js']) {
  const text = read(path.join(BUNDLE, '_vendor', f));
  assertInlineSafe(f, text);
  write(`components/lib/${f}`, text);
}

// -- Per component: preview.html and README.md; the .d.ts files go concatenated into index.d.ts (the page reads props
// there; a .ts file publishes only with contentType text/plain).
const dtsParts = [];
for (const { name, sourcePath } of header.components) {
  const dir = path.join(BUNDLE, path.dirname(sourcePath));
  const group = path.basename(path.dirname(dir));
  const dts = read(path.join(dir, `${name}.d.ts`));
  dtsParts.push(dts.replace(/^import \* as React from 'react';\n/m, '').trim());
  if (NO_CARD.has(name)) continue;

  write(`components/${name}/README.md`, read(path.join(dir, `${name}.prompt.md`)));

  const rawPreviewJs = read(path.join(BUNDLE, '_preview', `${name}.js`));
  if (EMOJI_PREVIEWS.has(name) && !rawPreviewJs.includes(EMOJI_CDN)) {
    throw new Error(`_preview/${name}.js: no ${EMOJI_CDN}; keep EMOJI_VERSION in step with the previews`);
  }
  const previewJs = rawPreviewJs.replaceAll(EMOJI_CDN, `../../${EMOJI_FILE}`);
  assertInlineSafe(`_preview/${name}.js`, previewJs);
  let html = read(path.join(dir, `${name}.html`));
  html = html.replace(/^<!-- @dsCard[^\n]*\n/, '');
  html = html.replace(/\s*<link rel="stylesheet" href="\.\.\/\.\.\/\.\.\/[^"]+">/g, '');
  html = html.replace(/\s*<script src="\.\.\/\.\.\/\.\.\/(_vendor\/[^"]+|_ds_bundle\.js)"><\/script>/g, '');
  html = html.replace('background:#fff', 'background:transparent');
  const previewTag = `<script src="../../../_preview/${name}.js"></script>`;
  if (!html.includes(previewTag)) throw new Error(`${name}.html: preview script tag not found`);
  const mount = /<script>\n([\s\S]*?)<\/script>/.exec(html);
  if (!mount) throw new Error(`${name}.html: mount script not found`);
  // A function replacement: `$&`, `$$` and the like in the scripts must stay literal.
  html = html.replace(mount[0], () => '').replace(previewTag, () => `<script>\n${previewJs}\n${mount[1]}</script>`);
  if (/\.\.\/\.\.\/\.\.\//.test(html)) throw new Error(`${name}.html: unresolved converter path`);
  const cardMode = CONFIG.overrides?.[name]?.cardMode;
  const height = SINGLE_HEIGHT[name] ?? (cardMode === 'single' ? 400 : 160);
  const card = `<!-- @dsCard group="${titleCase(group)}" height=${height} -->\n${html}`;
  if (Buffer.byteLength(card) > 256 * 1024) throw new Error(`${name}: preview.html over 256 KB`);
  write(`components/${name}/preview.html`, card);
}
const emojiPkg = JSON.parse(read('node_modules/emoji-picker-element-data/package.json'));
if (emojiPkg.version !== EMOJI_VERSION) {
  throw new Error(`emoji-picker-element-data ${emojiPkg.version} installed, previews pin ${EMOJI_VERSION}`);
}
write(EMOJI_FILE, read('node_modules/emoji-picker-element-data/en/emojibase/data.json'));
write('components/index.d.ts', `import * as React from 'react';\n\n${dtsParts.join('\n\n')}\n`);

// -- tokens.css compiled from tokens.json (format.md "tokens.css as compiled"); the page never writes it for a
// system synced from code.
if (TOKENS) {
  const t = JSON.parse(read(TOKENS));
  const themes = t.color.themes.map((x) => x.id);
  const ident = (name) => name.replaceAll('.', '\\.');
  const css = (v) => (typeof v === 'string' ? v.replace(/^\{(.+)\}$/, (_, n) => `var(--${ident(n)})`) : String(v));
  // A bare number means px for lengths (format.md grammar).
  const len = (v) => (typeof v === 'number' && v !== 0 ? `${v}px` : String(v));
  const valueFor = (tok, theme) => (typeof tok.value === 'object' ? tok.value[theme] : theme === themes[0] ? tok.value : undefined);
  // The first theme inherits from nothing: a token defined only in a later theme lends that value to it.
  const firstValue = (tok) => valueFor(tok, themes[0]) ?? themes.map((th) => valueFor(tok, th)).find((v) => v !== undefined);
  const isAlias = (tok) => typeof firstValue(tok) === 'string' && /^\{.+\}$/.test(firstValue(tok));
  const colorish = [...t.color.tokens, ...(t.shadow?.tokens ?? [])];
  const out = [`/* ${t.name} — generated from tokens.json */`];
  const decl = (tok, theme) => `  --${ident(tok.name)}: ${css(valueFor(tok, theme) ?? firstValue(tok))};`;
  out.push(`:root, [data-theme="${themes[0]}"] {`, ...colorish.map((tok) => decl(tok, themes[0])), '}');
  for (const theme of themes.slice(1)) {
    const own = colorish.filter((tok) => valueFor(tok, theme) !== undefined || isAlias(tok));
    out.push(`[data-theme="${theme}"] {`, ...own.map((tok) => decl(tok, theme)), '}');
  }
  const scalar = Object.entries(t).filter(([k, v]) => !['color', 'type', 'shadow'].includes(k) && Array.isArray(v?.tokens));
  out.push(':root {');
  const lengthFamilies = new Set(['spacing', 'radius', 'size']);
  for (const [k, fam] of scalar) {
    for (const tok of fam.tokens) out.push(`  --${ident(tok.name)}: ${lengthFamilies.has(k) ? len(tok.value) : tok.value};`);
  }
  for (const [k, stack] of Object.entries(t.type.families)) out.push(`  --font-${k}: ${stack};`);
  out.push('}');
  for (const g of t.type.groups) {
    for (const s of g.styles) {
      const props = [`font-family: var(--font-${s.family ?? g.family})`, `font-size: ${len(s.fontSize)}`];
      if (s.lineHeight !== undefined) props.push(`line-height: ${s.lineHeight}`);
      if (s.fontWeight !== undefined) props.push(`font-weight: ${s.fontWeight}`);
      if (s.letterSpacing !== undefined) props.push(`letter-spacing: ${len(s.letterSpacing)}`);
      if (s.fontStyle !== undefined) props.push(`font-style: ${s.fontStyle}`);
      if (s.opticalSize !== undefined) props.push(`font-variation-settings: 'opsz' ${s.opticalSize}`);
      out.push(`.${ident(s.name)} { ${props.join('; ')}; }`);
    }
  }
  const FORMAT = { woff2: 'woff2', woff: 'woff', ttf: 'truetype', otf: 'opentype' };
  for (const f of t.type.fonts) {
    const file = f.file.includes('/') ? f.file : `fonts/${f.file}`;
    const range = unicodeRange.get(path.basename(file));
    out.push(`@font-face { font-family: "${f.family}"; src: url("${file}") format("${FORMAT[path.extname(file).slice(1)] ?? 'woff2'}"); `
      + `font-weight: ${f.weight}; font-style: ${f.style ?? 'normal'}; font-display: swap;${range ? ` unicode-range: ${range};` : ''} }`);
  }
  write('tokens.css', `${out.join('\n')}\n`);
}

console.log(`wrote ${OUT}: ${cards.length} cards, ${header.components.length} components in the bundle`);
