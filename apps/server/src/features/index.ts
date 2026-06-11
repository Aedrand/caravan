/**
 * Side-effect imports: each feature module registers its mutation handlers
 * with the core pipeline. Import this once from the app entry (and tests)
 * before executing mutations.
 */
import "./itinerary/mutations";
import "./trips/mutations";
