# Work on @endo/genie — web search tool testing

Use the genie dev-repl to verify that the web search tool works:

```bash
OPENAI_API_KEY=ollama yarn workspace @endo/genie run repl -m qwen3.5:9b -c "Search the web for news"
```

- [x] Tested successfully — no errors encountered. The web search tool works correctly, returning structured results (title, url, snippet) from DuckDuckGo.
