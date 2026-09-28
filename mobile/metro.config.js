// Metro also watches the web app's pure tracker logic (../src/tracker/model.js, ../src/ui/format.js),
// so the phone computes balances with exactly the same code as the web. Nothing in those files touches the DOM.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [path.resolve(__dirname, '../src/tracker'), path.resolve(__dirname, '../src/ui')];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];
module.exports = config;
