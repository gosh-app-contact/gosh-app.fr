module.exports = {
  expo: {
    name: 'Gosh',
    slug: 'Gosh',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'dietapp',
    userInterfaceStyle: 'automatic',
    ios: {
      icon: './assets/images/icon.png',
      bundleIdentifier: 'com.goshapp.app',
      supportsTablet: false,
      infoPlist: {
        NSMotionUsageDescription: 'Gosh utilise le podomètre pour compter vos pas quotidiens.',
        NSHealthShareUsageDescription: 'Gosh lit vos pas depuis Apple Santé pour afficher votre activité quotidienne.',
        NSCameraUsageDescription: 'Gosh utilise la caméra pour scanner les codes-barres des aliments.',
        NSPhotoLibraryUsageDescription: 'Gosh accède à ta galerie pour que tu puisses choisir une photo de profil ou partager une photo dans ton feed.',
        NSPhotoLibraryAddUsageDescription: 'Gosh peut enregistrer des photos dans ta galerie.',
        NSHealthUpdateUsageDescription: 'Gosh peut enregistrer tes données d\'activité dans Apple Santé.',
      },
    },
    android: {
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
      package: 'com.goshapp.app',
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#208AEF',
          image: './assets/images/splash-icon.png',
          imageWidth: 200,
          android: {
            image: './assets/images/splash-icon.png',
            imageWidth: 76,
          },
        },
      ],
      [
        'expo-notifications',
        {
          icon: './assets/images/icon.png',
          color: '#208AEF',
        },
      ],
      '@react-native-community/datetimepicker',
      'expo-video',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      giphyApiKey: process.env.GIPHY_API_KEY ?? 'fkzwSJJN5HXh8CckcVA2jxLi0y0Pyspo',
      eas: {
        projectId: process.env.EAS_PROJECT_ID ?? '',
      },
    },
  },
};
