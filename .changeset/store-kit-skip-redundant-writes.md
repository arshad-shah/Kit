---
"@arshad-shah/store-kit": patch
---

Performance: persisted stores no longer rewrite storage when the persisted slice is unchanged. A store with both persisted and transient fields previously re-serialized and wrote to storage on *every* update — including transient changes the persisted slice didn't care about. Each write is now skipped when the serialized payload matches the last one, eliminating needless serialization and synchronous `localStorage` writes for high-frequency stores. The baseline is reseeded after `reset()` so a post-reset write is never wrongly skipped.
