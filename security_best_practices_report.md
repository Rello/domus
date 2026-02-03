# Security Best Practices Report

## Executive Summary
This review focused on the frontend JavaScript in this Nextcloud app. I found two URL-handling issues where untrusted URLs from API data are opened or rendered without scheme/origin validation, which can enable XSS via `javascript:`/`data:` URLs or facilitate phishing. I did not audit PHP backend code because the requested skill scope is JavaScript-only; if you want a backend review, tell me and I will do a separate pass.

## High Severity Findings

### SBP-001: Unvalidated task action URLs can open `javascript:`/`data:` URLs
- Severity: High
- Location: `js/domusTasks.js` lines 213-220 and 477-490
- Evidence:
  - `window.open(actionUrl, '_blank', 'noopener');` (`js/domusTasks.js:213-220`)
  - `<a href="...">` built from `actionUrl` (`js/domusTasks.js:485-489`)
- Impact: If a task’s `actionUrl` is attacker-controlled (or stored unsafely in backend data), a user click can execute script via `javascript:` URLs or open a malicious site, enabling XSS or phishing.
- Fix: Validate and normalize `actionUrl` before use. Allowlist schemes (`https:` and `http:` if required) and optionally restrict to same-origin or a known set of domains. Reject or ignore `javascript:`, `data:`, and other non-http(s) schemes.
- Mitigation: If full validation is difficult, at least block `javascript:`/`data:` and strip whitespace/control characters before use.
- False positive notes: If the backend guarantees `actionUrl` is strictly http(s) and validated, document that contract and enforce it in the frontend as defense in depth.

## Medium Severity Findings

### SBP-002: Document links use unvalidated `fileUrl` in href
- Severity: Medium
- Location: `js/domusDocuments.js` lines 31-35 and 74-83
- Evidence:
  - `<a class="domus-link" href="${doc.fileUrl}">` (`js/domusDocuments.js:31-33`)
  - `<a class="domus-link" target="_blank" ... href="${doc.fileUrl}">` (`js/domusDocuments.js:74-80`)
- Impact: If a document entry contains a malicious URL (e.g., `javascript:` or `data:`), clicking the link can execute script or send users to a phishing page.
- Fix: Validate `doc.fileUrl` before rendering. Allowlist schemes and optionally restrict to same-origin or trusted hostnames. If invalid, render a safe placeholder or disable the link.
- Mitigation: Provide a safe URL helper (e.g., `Domus.Utils.safeUrl`) and use it everywhere URLs are rendered.
- False positive notes: If `fileUrl` is always generated server-side from trusted storage and guaranteed to be http(s), document and enforce that invariant in both backend and frontend.

## Notes / Out of Scope
- This report focuses on frontend JavaScript security. The backend (PHP/Nextcloud controllers, routes, and models) was not audited here due to the requested skill scope.

