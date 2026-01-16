# DEV CHECKLIST (Architecture Compliance)

## 1. Config-Driven Integrations
All Pyrus IDs must be in `config.json`. Hardcoding is forbidden.

**Verification Commands:**
```bash
# Must return empty (except config files)
grep -r "form_id" js/services | grep -v "config.js"
grep -r "id: 1382379" js/

# Must not find raw field IDs (e.g. 27, 14, 15)
grep -r "id: 27" js/services/meetingsService.js
grep -r "id: 14" js/services/meetingsService.js
```

## 2. Cookie Safety
Cookies must be light. No base64.

**Review Items:**
- [ ] Check `userProfileService.js`: `setCookie` must strip `avatarUrl`.
- [ ] Check `authService.js`: Session cookies must be minimal (token/id only).
- [ ] Verify `header.js` pulls avatar from runtime cache or triggers async load.

## 3. Performance & Lifecycle
Protect the DOM and Memory.

**Review Items:**
- [ ] **Partial Render**: `meetView.js` and list views must use update patterns (reusing containers) instead of `innerHTML = ""` on every refresh.
- [ ] **Cleanup**: Every component with global listeners (`window`, `document`, `body`) MUST have a `destroy()` method.
- [ ] **Unmount**: Ensure `unmount()` calls `destroy()` on all child controllers.

## 4. Layer Separation
- **Views** (`js/views/`) handle DOM and user events. No direct API calls (use services).
- **Services** (`js/services/`) handle data and API. No DOM manipulation.
- **Config** (`js/config.js`) handles all constants.
- **Config** (`js/config.js`) handles all constants.

## 5. KP Module Checks
- [ ] **Config**: No hardcoded IDs in `kpService.js` or `kpView.js`.
- [ ] **HTML Size**: Ensure embedded images are resized/optimized before Base64 encoding.
- [ ] **Restoration**: Verify that opening a generated HTML file restores the editor state correctly.
- [ ] **Cookie Safety**: Ensure big Base64 payloads (KP model) are NEVER stored in cookies.

## 6. Manual Smoke Test
1. **Login**: Check DevTools -> Application -> Cookies. `sm_graph_profile_v1` should be small JSON (<1KB).
2. **Avatar**: Header displays avatar (if set) or initials.
3. **Meetings**: Switch modes (Day/Week) 10 times. Memory usage should be stable.
4. **Refresh**: While in "Week" mode, click Refresh. Grid structure should remain (check via DOM breakpoints "Subtree Modified" on grid parent).
