# PR: Stability & Resilience Improvements for Claude via Antigravity

## Summary

This PR ports battle-tested stability features from CLIProxyAPI and LLM-API-Key-Proxy to make Claude via Antigravity more resilient. The main focus is preventing the "tool_use ids without tool_result blocks" error that permanently corrupts sessions.

## Changes Overview

| Component | Type | Description |
|-----------|------|-------------|
| **Tool Pairing Fix** | NEW | Prevent orphaned tool_use blocks |
| **Transform Module** | NEW | Claude/Gemini model transforms & thinking config |
| **Refresh Queue** | NEW | Proactive token refresh (non-blocking) |
| **Logger** | NEW | TUI-integrated structured logging |
| **Errors** | NEW | Custom error types for better handling |
| **Thinking Recovery** | ENHANCED | Improved corrupted state detection |
| **Config Schema** | ENHANCED | Zod-based validation |

---

## Feature 1: Tool Pairing Fix (Main Feature)

### The Problem

Claude's API enforces strict pairing between `tool_use` and `tool_result` blocks. When this pairing breaks, the API returns:

```
tool_use ids were found without tool_result blocks immediately after: tool-call-45
```

This error permanently corrupts the session - no recovery possible without manual intervention.

### How Pairing Breaks

| Cause | Scenario |
|-------|----------|
| **ESC pressed** | User cancels mid-tool-call, tool_result never sent |
| **Context compaction** | OpenCode trims messages, orphaning tool_use blocks |
| **Parallel tool calls** | Race conditions leave some calls unresolved |
| **Plugin conflicts** | DCP or other plugins inject malformed messages |

### The Solution: Defense in Depth

**Layer 1: `fixToolResponseGrouping()`** (Existing)
- Groups function calls with responses
- Handles ID mismatches via 3-pass matching (exact ID → function name → unknown_function)

**Layer 2: `fixClaudeToolPairing()`** (NEW)
- Scans all messages for orphaned `tool_use` blocks
- Injects placeholder `tool_result` responses

**Layer 2.5: `validateAndFixClaudeToolPairing()`** (NEW - Nuclear Option)
- If Layer 2 fails validation, removes the broken `tool_use` block entirely

**Layer 3: `recovery.ts`** (Existing)
- Catches any remaining errors via session.error event
- Auto-recovers and resumes

### New Functions

| Function | Purpose |
|----------|---------|
| `findOrphanedToolUseIds()` | Scans messages, returns Set of orphaned tool_use IDs |
| `fixClaudeToolPairing()` | Injects placeholder tool_result for orphaned blocks |
| `removeOrphanedToolUse()` | Nuclear: removes tool_use block from assistant message |
| `validateAndFixClaudeToolPairing()` | Orchestrates fix + validation + nuclear fallback |

---

## Feature 2: Transform Module

New `src/plugin/transform/` module ported from CLIProxyAPI for model-specific transforms.

### Exports

```typescript
// Model resolution
resolveModelWithTier(modelId: string): { model: string, tier: string }
getModelFamily(modelId: string): 'claude' | 'gemini' | 'unknown'
MODEL_ALIASES: Record<string, string>

// Claude transforms
isClaudeModel(model: string): boolean
configureClaudeToolConfig(tools: Tool[]): Tool[]
buildClaudeThinkingConfig(tier: string): ThinkingConfig
applyClaudeTransforms(request: Request): Request

// Gemini transforms  
isGeminiModel(model: string): boolean
buildGemini3ThinkingConfig(tier: string): ThinkingConfig

// Thinking budgets
THINKING_TIER_BUDGETS: { low: 1024, medium: 8192, high: 16384, xhigh: 32768 }
```

### Model Family Detection

```typescript
getModelFamily('claude-sonnet-4')  // → 'claude'
getModelFamily('gemini-2.5-pro')   // → 'gemini'
getModelFamily('gpt-4')            // → 'unknown'
```

---

## Feature 3: Refresh Queue

Proactive token refresh ported from LLM-API-Key-Proxy.

### Features

- **Non-blocking**: Background refresh doesn't block requests
- **Proactive**: Refreshes 30 minutes before expiry
- **Serialized**: Only one refresh at a time (prevents race conditions)
- **5-minute check interval**: Balances freshness vs overhead

### Usage

```typescript
const refreshQueue = new RefreshQueue(tokenManager)
refreshQueue.start()  // Start background refresh loop
refreshQueue.stop()   // Stop on shutdown
```

---

## Feature 4: Logger

TUI-integrated structured logging for better debugging.

### Features

- **Silent by default**: No console spam during normal operation
- **TUI integration**: Logs visible in OpenCode TUI client
- **Environment override**: `OPENCODE_ANTIGRAVITY_CONSOLE_LOG=1` for console output
- **Log levels**: debug, info, warn, error

### Usage

```typescript
import { logger } from './logger'

logger.debug('Detailed info', { context: 'value' })
logger.info('Normal operation')
logger.warn('Potential issue')
logger.error('Error occurred', { error })
```

---

## Feature 5: Custom Errors

New error types for better error handling and recovery.

### EmptyResponseError

Thrown when API returns empty response after all retries exhausted.

```typescript
throw new EmptyResponseError('No response after 3 retries')
```

### ToolIdMismatchError

Thrown when tool ID matching fails in all 3 passes.

```typescript
throw new ToolIdMismatchError('tool-call-45', ['tool-call-46', 'tool-call-47'])
```

---

## Feature 6: Enhanced Thinking Recovery

Improved detection of corrupted thinking state.

### Philosophy

> "Let it crash and start again" - Don't fight corruption, detect and recover.

### Detection Capabilities

- Tool loop detection (same tool called repeatedly)
- Thinking block presence analysis
- Conversation state assessment
- Recovery recommendation

---

## Feature 7: Enhanced Config Schema

Zod-based configuration with validation.

### Config Locations

1. Project: `.opencode/antigravity.json`
2. User: `~/.config/opencode/antigravity.json`

### Schema

```typescript
{
  quiet_mode: boolean,      // Suppress non-error logs
  debug: boolean,           // Enable debug logging
  log_dir: string,          // Log file directory
  keep_thinking: boolean,   // Preserve thinking blocks
  session_recovery: boolean, // Enable crash recovery
  auto_resume: boolean      // Auto-resume after recovery
}
```

---

## Test Coverage

```
✓ findOrphanedToolUseIds (3 tests)
✓ fixClaudeToolPairing (6 tests)
✓ validateAndFixClaudeToolPairing (3 tests)
✓ fixToolResponseGrouping (existing tests)
✓ thinking recovery (existing tests)

Total: 164 tests passing
```

---

## Related Issues

| Project | Issue | Relation |
|---------|-------|----------|
| CLIProxyAPI#714 | thinking.cache_control error | Same root cause |
| oh-my-opencode#187 | Claude Opus thinking failures | Related |
| opencode#6064 | Thinking block validation | Related |

---

## Breaking Changes

None. All changes are additive and backward compatible.

---

## Before/After

**Before**: 
- Session permanently broken when tool pairing fails
- Token expires mid-session, blocking requests
- No structured logging for debugging
- Config validation at runtime (crashes)

**After**: 
- Automatic recovery from tool pairing errors
- Proactive token refresh (never expires)
- TUI-integrated logging
- Zod validation at load time (early errors)
