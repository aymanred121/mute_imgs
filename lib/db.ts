import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import {
  EXTENSION_DB_NAME,
  EXTENSION_DB_VERSION,
} from '@/lib/constants';
import type {
  EmbeddingCacheEntry,
  MutedImageRecord,
  UrlHashLookupEntry,
} from '@/lib/types';

interface ExtensionDbSchema extends DBSchema {
  muted_images: {
    key: string;
    value: MutedImageRecord;
    indexes: {
      'by-sha256': string;
      'by-createdAt': string;
    };
  };
  embedding_cache: {
    key: string;
    value: EmbeddingCacheEntry;
    indexes: {
      'by-mediaUrl': string;
      'by-lastSeenAt': string;
    };
  };
  url_hash_lookup: {
    key: string;
    value: UrlHashLookupEntry;
    indexes: {
      'by-sha256': string;
    };
  };
}

let dbPromise: Promise<IDBPDatabase<ExtensionDbSchema>> | undefined;

function getDb() {
  dbPromise ??= openDB<ExtensionDbSchema>(
    EXTENSION_DB_NAME,
    EXTENSION_DB_VERSION,
    {
      upgrade(db) {
        const mutedStore = db.createObjectStore('muted_images', {
          keyPath: 'id',
        });
        mutedStore.createIndex('by-sha256', 'sha256', { unique: true });
        mutedStore.createIndex('by-createdAt', 'createdAt');

        const cacheStore = db.createObjectStore('embedding_cache', {
          keyPath: 'sha256',
        });
        cacheStore.createIndex('by-mediaUrl', 'mediaUrl');
        cacheStore.createIndex('by-lastSeenAt', 'lastSeenAt');

        const lookupStore = db.createObjectStore('url_hash_lookup', {
          keyPath: 'mediaUrl',
        });
        lookupStore.createIndex('by-sha256', 'sha256');
      },
    },
  );

  return dbPromise;
}

export async function listMutedImages(): Promise<MutedImageRecord[]> {
  return (await getDb()).getAll('muted_images');
}

export async function getMutedImageById(id: string) {
  return (await getDb()).get('muted_images', id);
}

export async function getMutedImageBySha256(sha256: string) {
  return (await getDb()).getFromIndex('muted_images', 'by-sha256', sha256);
}

export async function putMutedImage(record: MutedImageRecord) {
  await (await getDb()).put('muted_images', record);
}

export async function deleteMutedImage(id: string) {
  await (await getDb()).delete('muted_images', id);
}

export async function clearMutedImages() {
  await (await getDb()).clear('muted_images');
}

export async function countMutedImages() {
  return (await getDb()).count('muted_images');
}

export async function getEmbeddingCacheBySha256(sha256: string) {
  return (await getDb()).get('embedding_cache', sha256);
}

export async function putEmbeddingCache(entry: EmbeddingCacheEntry) {
  await (await getDb()).put('embedding_cache', entry);
}

export async function countEmbeddingCache() {
  return (await getDb()).count('embedding_cache');
}

export async function clearEmbeddingCache() {
  await (await getDb()).clear('embedding_cache');
}

export async function getUrlHashLookup(mediaUrl: string) {
  return (await getDb()).get('url_hash_lookup', mediaUrl);
}

export async function putUrlHashLookup(entry: UrlHashLookupEntry) {
  await (await getDb()).put('url_hash_lookup', entry);
}

export async function clearUrlHashLookup() {
  await (await getDb()).clear('url_hash_lookup');
}
