# Plugins

Plugins are Astro components that render at named insertion points on the site.

## Structure

Create a folder under `plugins/<name>/`:

```
plugins/my-plugin/
  plugin.json       # plugin metadata
  MyPlugin.astro    # your Astro component (receives config as props)
  my-plugin.json    # default config values (optional)
```

## plugin.json

```json
{
  "name": "my-plugin",
  "entry": "./MyPlugin.astro",
  "slot": "about.after-gear",
  "admin": true
}
```

| Field | Description |
|---|---|
| `name` | Plugin identifier (matches folder name) |
| `entry` | Path to your Astro component |
| `slot` | Insertion point (e.g. `about.after-gear`, `home.after-hero`) |
| `admin` | If `true`, plugin config is editable from the admin dashboard |

## Admin-configurable plugins

Set `"admin": true` to make plugin config editable in the admin dashboard under the Plugins tab. Edits are stored in SQLite and merged on top of the JSON defaults at build time.
