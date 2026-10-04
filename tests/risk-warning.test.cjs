const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const panel = fs.readFileSync(path.join(root, 'src/UI/ClientPanel.js'), 'utf8');
const commands = fs.readFileSync(path.join(root, 'src/Chat/ClientCommands.js'), 'utf8');
const background = fs.readFileSync(path.join(root, 'src/Core/background.js'), 'utf8');

test('client language is detected once and unsupported locales fall back to English', () => {
  assert.match(panel, /navigator\.language \|\| navigator\.userLanguage/);
  assert.match(panel, /SUPPORTED_LANGUAGES\.includes\(primary\) \? primary : 'en'/);
  assert.match(panel, /hasStoredLanguage \? normalizeClientLanguage\(settings\.language\) : detectClientLanguage\(\)/);
  assert.doesNotMatch(background, /language:\s*existing\.settings\?\.language\s*\?\?\s*["']en["']/);
});

test('Idle Player risk warning covers every supported client language', () => {
  for (const language of ['en', 'es', 'ja', 'it', 'zh', 'fr', 'de', 'pt', 'ru', 'ko']) {
    assert.match(panel, new RegExp(`\\n    ${language}: \\{`), `${language} warning is missing`);
  }
  assert.match(panel, /data-risk-close/);
  assert.match(panel, /data-risk-once/);
  assert.match(panel, /data-risk-always/);
  assert.match(panel, /moduleRiskAcknowledgements/);
  assert.match(panel, /sessionRiskAcceptances\.delete\('idlePlayerBot'\)/);
});

test('all normal Idle Player activation routes pass through the risk gate', () => {
  assert.match(panel, /request\.action === 'toggle'[\s\S]*?requestModuleRiskAcceptance\(key\)/);
  assert.match(panel, /request\.action === 'idlebotConnect'[\s\S]*?requestModuleRiskAcceptance\('idlePlayerBot'\)/);
  assert.match(panel, /minifeather:nsb-toggle'[\s\S]*?requestModuleRiskAcceptance\(key\)/);
  assert.match(panel, /#mf-idle-player-connect'[\s\S]*?requestModuleRiskAcceptance\('idlePlayerBot'\)/);
  assert.match(panel, /input\.addEventListener\('change', async[\s\S]*?requestModuleRiskAcceptance\(key\)/);
  assert.match(commands, /dispatchRequest\('idlebotConnect', \[target\]\)/);
  assert.doesNotMatch(commands, /Promise\.resolve\(api\.connect\(target\)\)/);
});

test('the EULA documents stored risk consent and its limits', () => {
  const english = fs.readFileSync(path.join(root, 'EULA.md'), 'utf8');
  const spanish = fs.readFileSync(path.join(root, 'EULA.es.md'), 'utf8');
  assert.match(english, /4\.3\.[\s\S]*accept and do not show again/i);
  assert.match(spanish, /4\.3\.[\s\S]*aceptar y no volver a mostrar/i);
  assert.match(english, /locally accepted module-risk warnings/);
  assert.match(spanish, /avisos de riesgo de módulos aceptados localmente/);
});
