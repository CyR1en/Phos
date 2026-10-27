# Plugins

Plugins are Astro components that render at named insertion points on the site. They are
discovered at build time by `scripts/discover-plugins.mjs`, which `npm run dev`, `npm run build`
and `npm run generate` run first.

## Structure

Create a folder under `plugins/<name>/`. The folder name is the plugin name.

```
plugins/my-plugin/
  plugin.json       # plugin manifest
  MyPlugin.astro    # your Astro component (receives config as props)
  config.json       # default config values (optional)
```

## plugin.json

```json
{
  "entry": "./MyPlugin.astro",
  "slot": "about.after-gear",
  "config": "./config.json",
  "admin": true
}
```

| Field | Description |
| --- | --- |
| `entry` | Required. Path to the Astro component, inside the plugin folder. |
| `slot` | Insertion point. The site currently offers `about.after-gear`. |
| `config` | Optional path to a JSON file of default props, inside the plugin folder. |
| `admin` | If `true`, the config is editable from the admin dashboard. |

Plugins with a missing or invalid manifest, a missing entry, or a path that escapes the plugin
folder are skipped with a warning.

## Admin-configurable plugins

Set `"admin": true` to edit the plugin's config in the admin under **Extensions → Plugins**. The
entry appears only when at least one admin-enabled plugin is installed. Edits are stored in SQLite
and merged on top of the JSON defaults at build time.

## Security

The generated `src/generated/plugins.mjs` contains build-time configuration and must not be
imported into browser code. Phos renders plugin entries without hydration directives and strips
`client:*` and `server:*` keys from the config before spreading it as props. If a plugin creates a
`client:*` island, pass only explicitly selected public values: Astro serializes island props into
public HTML, so forwarding the complete configuration can expose credentials. Anything a plugin
renders or ships to the browser is public: island props, `define:vars`, attributes, or a client
script importing its own config. Discovery warns about secret-looking config keys.
