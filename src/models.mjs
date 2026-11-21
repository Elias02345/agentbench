import { randomUUID } from 'node:crypto';
import { normalizeEndpoint, ProviderError } from './engine.mjs';

export function keyFor(input) {
  if (typeof input !== 'string' || input.length > 4000 || /[^\x21-\x7e]/.test(input)) throw new ProviderError('invalid_key');
  return input;
}

export function createModelRegistry(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS registered_models (
      id TEXT PRIMARY KEY, model TEXT NOT NULL, label TEXT NOT NULL, endpoint TEXT NOT NULL,
      api_key TEXT NOT NULL, created INTEGER NOT NULL, UNIQUE(endpoint, model)
    );
  `);
  const get = db.prepare('SELECT * FROM registered_models WHERE id=?');
  const memoryKeys = new Map();
  const key = row => memoryKeys.get(row.id) ?? row.api_key;
  const view = row => ({
    id: row.id, model: row.model, label: row.label, endpoint: row.endpoint,
    hasKey: !!key(row), rememberKey: !!row.api_key,
  });
  function find(id) {
    const row = typeof id === 'string' ? get.get(id) : null;
    if (!row) throw new ProviderError('model_not_found');
    return row;
  }
  function connection(input, requireModel = true) {
    const previous = input.id ? find(input.id) : null;
    const endpoint = normalizeEndpoint(input.endpoint ?? previous?.endpoint);
    const apiKey = keyFor(input.key ?? (previous?.endpoint === endpoint ? key(previous) : ''));
    if (apiKey.length >= 8 && endpoint.includes(apiKey)) throw new ProviderError('invalid_key');
    if (!requireModel) return {endpoint, key: apiKey};

    const model = input.model ?? previous?.model;
    const label = input.label ?? previous?.label ?? '';
    if (typeof model !== 'string' || !model.trim() || model.length > 180 || /[\u0000-\u001f]/.test(model)) {
      throw new ProviderError('invalid_model_id');
    }
    if (typeof label !== 'string' || label.length > 100 || /[\u0000-\u001f]/.test(label)) throw new ProviderError('invalid_model_label');
    if (apiKey.length >= 8 && (model.includes(apiKey) || label.includes(apiKey))) throw new ProviderError('invalid_key');
    return { previous, model: model.trim(), label: label.trim(), endpoint, key: apiKey };
  }
  return {
    list() {
      return db.prepare('SELECT * FROM registered_models ORDER BY created,rowid').all().map(view);
    },
    job(id) {
      const row = find(id);
      return {...view(row), key: key(row)};
    },
    connection,
    save(input) {
      const config = connection(input);
      const {previous, model, label, endpoint, key: apiKey} = config;
      const duplicate = db.prepare('SELECT id FROM registered_models WHERE endpoint=? AND model=?').get(endpoint, model);
      if (duplicate && duplicate.id !== previous?.id) throw new ProviderError('duplicate_model');
      const id = previous?.id ?? randomUUID();
      const remember = (input.rememberKey ?? !!previous?.api_key) === true;
      db.prepare(`INSERT INTO registered_models VALUES (?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET model=excluded.model, label=excluded.label,
          endpoint=excluded.endpoint, api_key=excluded.api_key`).run(
        id, model, label, endpoint, remember ? apiKey : '', previous?.created ?? Date.now(),
      );
      if (remember || !apiKey) memoryKeys.delete(id);
      else memoryKeys.set(id, apiKey);
      return view(get.get(id));
    },
    remove(id) {
      const row = find(id);
      db.prepare('DELETE FROM registered_models WHERE id=?').run(row.id);
      memoryKeys.delete(row.id);
    },
  };
}
