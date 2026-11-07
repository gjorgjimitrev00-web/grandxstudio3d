import { test } from 'node:test';
import assert from 'node:assert/strict';
import { keychainApprovalSchema } from '../src/lib/validation';
import { keychainOptions, keychainSelection, sameKeychain } from '../src/lib/keychain-preview';

test('printed names support Macedonian and enforce the same preview bounds in checkout', () => {
  const choice = { color: 'Маслинеста', hex: '#a2b35c' };
  const parsed = keychainApprovalSchema.parse({ ...choice, name: '  Ѓорѓи-Јане  ' });
  assert.deepEqual(parsed, { name: 'Ѓорѓи-Јане', color: 'Маслинеста', hex: '#A2B35C' });
  assert.equal(keychainApprovalSchema.safeParse({ ...choice, name: 'Ќ'.repeat(16) }).success, true);
  for (const name of ['', 'А'.repeat(17), 'A\u202eB', 'А🐰', '<img>', 'А\nБ'])
    assert.equal(keychainApprovalSchema.safeParse({ ...choice, name }).success, false, name);
});

test('the preview uses only explicitly mapped fields and the actual variant swatch', () => {
  const text = {
    id: 't',
    name: 'Име',
    kind: 'TEXT',
    required: true,
    keychainRole: 'NAME',
    values: [],
  };
  const color = {
    id: 'c',
    name: 'Боја',
    kind: 'SELECT',
    required: true,
    keychainRole: 'COLOR',
    values: [
      { value: 'Rose', swatch: '#eeaa99' },
      { value: 'Green', swatch: '#447733' },
    ],
  };
  assert.equal(keychainOptions([{ ...text, keychainRole: null }, color]), null);
  assert.equal(
    keychainOptions([text, { ...color, values: [{ value: 'Rose', swatch: null }] }]),
    null,
  );
  const configured = keychainOptions([text, color])!;
  const approved = keychainSelection(configured, { t: 'Ана', c: 'Rose' }, [
    { value: { optionId: 'c', value: 'Green' } },
  ]);
  assert.deepEqual(approved, { name: 'Ана', color: 'Green', hex: '#447733' });
  assert.equal(sameKeychain({ ...approved, hex: '#000000' }, approved), false);
});
