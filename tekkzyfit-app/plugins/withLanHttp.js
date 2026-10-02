const { AndroidConfig, withAndroidManifest, withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

const NETWORK_XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="true">
    <trust-anchors>
      <certificates src="system" />
    </trust-anchors>
  </base-config>
</network-security-config>
`;

function withLanHttp(config) {
  config = withDangerousMod(config, [
    'android',
    async (mod) => {
      const dir = path.join(mod.modRequest.platformProjectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'network_security_config.xml'), NETWORK_XML);
      fs.writeFileSync(
        path.join(dir, 'file_paths.xml'),
        `<?xml version="1.0" encoding="utf-8"?>
<paths>
  <cache-path name="updates" path="updates/" />
</paths>
`,
      );
      return mod;
    },
  ]);
  return withAndroidManifest(config, (mod) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(mod.modResults);
    app.$['android:usesCleartextTraffic'] = 'true';
    app.$['android:networkSecurityConfig'] = '@xml/network_security_config';
    const extra = [
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_SPECIAL_USE',
      'android.permission.POST_NOTIFICATIONS',
      'android.permission.REQUEST_INSTALL_PACKAGES',
    ];
    AndroidConfig.Permissions.ensurePermissions(mod.modResults, extra);
    const services = app.service || [];
    if (!services.some((row) => row.$?.['android:name'] === '.DeskKeepAliveService')) {
      services.push({
        $: {
          'android:name': '.DeskKeepAliveService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'specialUse',
          'android:stopWithTask': 'false',
        },
        'property': [
          {
            $: {
              'android:name': 'android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE',
              'android:value': 'Keep the gym face terminal linked on Wi-Fi to pull punches and push queued members.',
            },
          },
        ],
      });
      app.service = services;
    }
    const providers = app.provider || [];
    if (!providers.some((row) => String(row.$?.['android:authorities'] || '').includes('.fileprovider'))) {
      providers.push({
        $: {
          'android:name': 'androidx.core.content.FileProvider',
          'android:authorities': '${applicationId}.fileprovider',
          'android:exported': 'false',
          'android:grantUriPermissions': 'true',
        },
        'meta-data': [
          {
            $: {
              'android:name': 'android.support.FILE_PROVIDER_PATHS',
              'android:resource': '@xml/file_paths',
            },
          },
        ],
      });
      app.provider = providers;
    }
    const manifest = mod.modResults.manifest;
    const queries = manifest.queries || [];
    const hasInstallQuery = queries.some((row) =>
      (row.intent || []).some((intent) =>
        (intent.action || []).some((action) => action.$?.['android:name'] === 'android.intent.action.INSTALL_PACKAGE'),
      ),
    );
    if (!hasInstallQuery) {
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
            data: [{ $: { 'android:mimeType': 'application/vnd.android.package-archive' } }],
          },
        ],
      });
      queries.push({
        intent: [
          {
            action: [{ $: { 'android:name': 'android.intent.action.INSTALL_PACKAGE' } }],
            data: [{ $: { 'android:mimeType': 'application/vnd.android.package-archive' } }],
          },
        ],
      });
      manifest.queries = queries;
    }
    const activities = app.activity || [];
    if (!activities.some((row) => row.$?.['android:name'] === '.UpdateInstallActivity')) {
      activities.push({
        $: {
          'android:name': '.UpdateInstallActivity',
          'android:exported': 'false',
          'android:excludeFromRecents': 'true',
          'android:launchMode': 'singleTop',
          'android:theme': '@style/AppTheme',
        },
      });
      app.activity = activities;
    }
    return mod;
  });
}

module.exports = withLanHttp;
