const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Support for 3D model formats
config.resolver.assetExts.push('glb', 'gltf', 'bin', 'mov', 'MOV', 'mp4');

module.exports = config;
