# Org-roam fixture notebooks

`technical/` is a valid explicitly manifested notebook. It covers excluded
entities with imported descendants, Xenops-compatible math, local images, all
three quest kinds, hierarchy/link evidence, and a nested `research/` notebook
boundary. A parent scan must not import `research/nested-note.org`.

`technical-invalid/` is independently manifested and intentionally malformed.
It proves a parse error contains the file and line and cannot retire the last
accepted `technical/` snapshot.

The fixtures use stable readable IDs so golden snapshots and diagnostics remain
easy to review. Real Org IDs are opaque strings; UUID format is not required.
