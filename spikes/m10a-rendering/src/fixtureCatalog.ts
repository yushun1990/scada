import basic from './fixtures.generated.json'
import boundary from './boundary-fixtures.generated.json'

// The experiment admits only checked-in identities. Generated large fixtures
// are optional local files; their presence never authorizes another identity.
export const fixtures = { ...basic, ...boundary }
export type FixtureName = keyof typeof fixtures
