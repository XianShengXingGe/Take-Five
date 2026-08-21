# Event Debouncing and Flood Suppression

When multiple lifecycle events fire in rapid succession for the same Agent and Project (such as rapid user confirmations or back-to-back tool calls), Take Five enforces a lightweight 2-second debounce window using a state timestamp cache in `~/.takefive/cache.json`. This prevents excessive notification vibrations on the user's mobile device while preserving critical alerts.
