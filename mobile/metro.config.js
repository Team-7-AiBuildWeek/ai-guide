// Metro, told to look past what iCloud leaves in this folder (it is on the
// Desktop): a stray copy of the packages it restored, and its "… 2" / "… 3"
// duplicates. Without this the bundler indexes them all and crawls.
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.resolver.blockList = [
  /node_modules\.icloud-duplicate\.nosync\/.*/,
  /node_modules [0-9]+\/.*/,
  /.* [0-9]+\.(tsx?|jsx?|json)$/,
];

module.exports = config;
