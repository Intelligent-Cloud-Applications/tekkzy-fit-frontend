const os = require('os');
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { FileStore } = require('metro-cache');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// EXPO_PUBLIC_* values are inlined into transformed files, so each gym build keeps its own cache.
const variant = process.env.EXPO_PUBLIC_INSTITUTION;
if (variant) {
  config.cacheStores = [new FileStore({ root: path.join(os.tmpdir(), `metro-cache-${variant}`) })];
}

module.exports = config;
