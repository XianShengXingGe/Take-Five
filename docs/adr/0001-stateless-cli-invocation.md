# Stateless CLI Invocation for Adapter-to-Core Communication

Adapters communicate with Notification Core by directly invoking the `takefive notify` CLI subcommand per event, rather than maintaining a long-running background daemon or local HTTP server. This keeps Take Five completely stateless, removes daemon lifecycle management and port conflicts, and maximizes reliability across macOS and Windows restarts.
