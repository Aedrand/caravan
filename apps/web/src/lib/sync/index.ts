/** Public surface of the client sync lib (M1.4, plan §3.4). */
export { applyEvent, applyMutationOptimistic } from "./apply";
export {
  TripSyncProvider,
  useConnectionStatus,
  useMyMember,
  usePresence,
  useTripMutation,
  useTripSnapshot,
} from "./context";
export { type FeedPage, useFeed, useMarkSeen, useSeen, useUnreadCount } from "./feed";
export { tripKeys } from "./keys";
export { type ConnectionStatus, TripSocket, type TripSocketOptions } from "./socket";
