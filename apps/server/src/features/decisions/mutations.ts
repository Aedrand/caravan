/**
 * Track A — group decisions. Side-effect import that registers every
 * votes/comments/polls handler with the core pipeline. Pulled in once from
 * features/index.ts alongside the itinerary handlers.
 */
import "./votes";
import "./comments";
import "./polls";
