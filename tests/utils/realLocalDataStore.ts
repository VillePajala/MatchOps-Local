/**
 * The REAL local data store for flow tests (review 9.4): the app's factory and
 * LocalDataStore on fake IndexedDB - not a hand-built mock, whose shape and
 * semantics (validation, migrations on read, how methods are wired) can drift from
 * the real store unnoticed.
 *
 * Usage (at the top of a test file, before importing app modules that touch storage):
 *
 *   import { withRealLocalDataStore } from '../../tests/utils/realLocalDataStore';
 *   withRealLocalDataStore();   // fresh empty store before each test
 *
 * Then call app code normally; `getDataStore()` returns the real local store.
 */
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { resetFactory } from '@/datastore/factory';

// fake-indexeddb needs structuredClone, which jsdom lacks.
if (typeof structuredClone === 'undefined') {
  (globalThis as unknown as { structuredClone: (v: unknown) => unknown }).structuredClone =
    (value: unknown) => JSON.parse(JSON.stringify(value));
}

/** A fresh, empty IndexedDB and a reset data-store factory - as on a new device. */
export async function freshLocalStore(): Promise<void> {
  (globalThis as unknown as { indexedDB: IDBFactory }).indexedDB = new IDBFactory();
  await resetFactory();
}

/** Registers a beforeEach that gives every test a fresh, empty real store. */
export function withRealLocalDataStore(): void {
  beforeEach(async () => {
    await freshLocalStore();
  });
}
