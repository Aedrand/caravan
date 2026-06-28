/**
 * Side-effect imports: each feature module registers its mutation handlers
 * with the core pipeline. Import this once from the app entry (and tests)
 * before executing mutations.
 */
import "./decisions/mutations";
import "./expenses/mutations";
import "./ideas/lists";
import "./itinerary/days";
import "./itinerary/mutations";
import "./trips/membership";
import "./trips/mutations";
