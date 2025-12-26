/**
 * Model Resolution with Thinking Tier Support
 * 
 * Resolves model names with tier suffixes (e.g., gemini-3-pro-high, claude-sonnet-4-5-thinking-low)
 * to their actual API model names and corresponding thinking configurations.
 */

import type { ResolvedModel, ThinkingTier } from "./types";

/**
 * Thinking tier budgets by model family.
 * Claude and Gemini 2.5 Pro use numeric budgets.
 */
export const THINKING_TIER_BUDGETS = {
  claude: { low: 8192, medium: 16384, high: 32768 },
  "gemini-2.5-pro": { low: 8192, medium: 16384, high: 32768 },
  "gemini-2.5-flash": { low: 6144, medium: 12288, high: 24576 },
  default: { low: 4096, medium: 8192, high: 16384 },
} as const;

/**
 * Gemini 3 uses thinkingLevel strings instead of numeric budgets.
 */
export const GEMINI_3_THINKING_LEVELS = ["low", "medium", "high"] as const;

/**
 * Model aliases - maps user-friendly names to API model names.
 * 
 * Format:
 * - Gemini 3 Pro variants: gemini-3-pro-{low,medium,high}
 * - Claude thinking variants: claude-{model}-thinking-{low,medium,high}
 * - Claude non-thinking: claude-{model} (no -thinking suffix)
 */
export const MODEL_ALIASES: Record<string, string> = {
  // Gemini 3 Pro variants (tier suffix stripped, thinkingLevel set)
  "gemini-3-pro-low": "gemini-3-pro",
  "gemini-3-pro-medium": "gemini-3-pro",
  "gemini-3-pro-high": "gemini-3-pro",
  "gemini-3-pro-preview": "gemini-3-pro",

  // Claude proxy names (gemini- prefix for compatibility)
  "gemini-claude-sonnet-4-5": "claude-sonnet-4-5",
  "gemini-claude-sonnet-4-5-thinking-low": "claude-sonnet-4-5-thinking",
  "gemini-claude-sonnet-4-5-thinking-medium": "claude-sonnet-4-5-thinking",
  "gemini-claude-sonnet-4-5-thinking-high": "claude-sonnet-4-5-thinking",
  "gemini-claude-opus-4-5-thinking-low": "claude-opus-4-5-thinking",
  "gemini-claude-opus-4-5-thinking-medium": "claude-opus-4-5-thinking",
  "gemini-claude-opus-4-5-thinking-high": "claude-opus-4-5-thinking",

  // Image variants
  "gemini-3-pro-image-preview": "gemini-3-pro-image",
};

/**
 * Model fallbacks when primary model is unavailable.
 */
export const MODEL_FALLBACKS: Record<string, string> = {
  "gemini-2.5-flash-image": "gemini-2.5-flash",
};

const TIER_REGEX = /-(low|medium|high)$/;

/**
 * Extracts thinking tier from model name suffix.
 */
function extractThinkingTierFromModel(model: string): ThinkingTier | undefined {
  const tierMatch = model.match(TIER_REGEX);
  return tierMatch?.[1] as ThinkingTier | undefined;
}

/**
 * Determines the budget family for a model.
 */
function getBudgetFamily(model: string): keyof typeof THINKING_TIER_BUDGETS {
  if (model.includes("claude")) {
    return "claude";
  }
  if (model.includes("gemini-2.5-pro")) {
    return "gemini-2.5-pro";
  }
  if (model.includes("gemini-2.5-flash")) {
    return "gemini-2.5-flash";
  }
  return "default";
}

/**
 * Checks if a model is a thinking-capable model.
 */
function isThinkingCapableModel(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.includes("thinking") ||
    lower.includes("gemini-3") ||
    lower.includes("gemini-2.5")
  );
}

/**
 * Resolves a model name with optional tier suffix to its actual API model name
 * and corresponding thinking configuration.
 * 
 * Examples:
 * - "gemini-3-pro-high" → { actualModel: "gemini-3-pro", thinkingLevel: "high" }
 * - "claude-sonnet-4-5-thinking-low" → { actualModel: "claude-sonnet-4-5-thinking", thinkingBudget: 8192 }
 * - "claude-sonnet-4-5" → { actualModel: "claude-sonnet-4-5" } (no thinking)
 * 
 * @param requestedModel - The model name from the request
 * @returns Resolved model with thinking configuration
 */
export function resolveModelWithTier(requestedModel: string): ResolvedModel {
  // Check for tier suffix
  const tier = extractThinkingTierFromModel(requestedModel);

  // Strip tier suffix for lookup
  const baseName = tier ? requestedModel.replace(TIER_REGEX, "") : requestedModel;

  // Resolve alias - check both full name (with tier) and base name
  const actualModel = MODEL_ALIASES[requestedModel] || MODEL_ALIASES[baseName] || baseName;

  // Check for model fallback
  const resolvedModel = MODEL_FALLBACKS[actualModel] || actualModel;

  const isThinking = isThinkingCapableModel(resolvedModel);

  if (!tier) {
    return { actualModel: resolvedModel, isThinkingModel: isThinking };
  }

  // Gemini 3 uses thinkingLevel string
  if (resolvedModel.includes("gemini-3")) {
    return {
      actualModel: resolvedModel,
      thinkingLevel: tier,
      tier,
      isThinkingModel: true,
    };
  }

  // Claude and Gemini 2.5 use numeric budgets
  const budgetFamily = getBudgetFamily(resolvedModel);
  const budgets = THINKING_TIER_BUDGETS[budgetFamily];
  const thinkingBudget = budgets[tier];

  return {
    actualModel: resolvedModel,
    thinkingBudget,
    tier,
    isThinkingModel: isThinking,
  };
}

/**
 * Gets the model family for routing decisions.
 */
export function getModelFamily(model: string): "claude" | "gemini-flash" | "gemini-pro" {
  const lower = model.toLowerCase();
  if (lower.includes("claude")) {
    return "claude";
  }
  if (lower.includes("flash")) {
    return "gemini-flash";
  }
  return "gemini-pro";
}
