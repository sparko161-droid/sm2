# KP integration fixes walkthrough

## What changed
- Moved KP catalogs and form IDs to dedicated `kp.catalogs`, `kp.equipment`, and `kp.crm` sections in `config.json`.
- Added typed KP getters in `js/config.js` to read catalog IDs, mappings, and form configs without hardcoding.
- Reworked KP catalogs loading to use the shared catalogs service and the correct `requestCache.cached` signature.
- Ensured form registry requests use `/v4/forms/...` and query-string parameters for the n8n proxy.

## Where to look
- KP config and mappings: `config.json`, `js/config.js`
- Catalog loading: `js/services/kpCatalogService.js`, `js/services/catalogsService.js`
- CRM register usage: `js/services/crmService.js`
