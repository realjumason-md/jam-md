---
name: WhatsApp session persistence
description: Baileys links depend on the complete multi-file auth state, not only creds.json.
---

The complete Baileys multi-file auth state must survive process replacement; restoring only `creds.json` is not enough because encryption and app-state key files are also required.

**Why:** Cloud redeploys commonly replace the local filesystem, and treating transient crypto errors as a corrupted session forces unnecessary WhatsApp re-pairing.

**How to apply:** Preserve the auth directory during in-place updates, mirror all auth files to durable storage when available, and clear that storage only after WhatsApp explicitly reports a logged-out/401 session.