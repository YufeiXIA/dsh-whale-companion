# Stardew helper provenance

Source: https://github.com/sei-studio/sei/tree/51774c7b9567a087aafdb33cc72a364a18da3bbf/native/stardew-mod

Pinned commit: `51774c7b9567a087aafdb33cc72a364a18da3bbf`.
Only the MIT-licensed SMAPI helper is vendored. The AGPL Sei desktop app and
its agent adapter are not incorporated. Preserve LICENSE and THIRD_PARTY_NOTICES.md
with distributed builds. The whale Node adapter is independently implemented
against PROTOCOL.md.

Local change: `Net/Session.cs` pauses the companion on socket disconnect,
before the reconnect grace period expires. Reconnection never resumes work.

This helper creates an NPC backed by an invisible farmer. It is not a second
network player. Fishing and combat have the limitations described upstream;
do not describe it as a full human-equivalent co-op client.
