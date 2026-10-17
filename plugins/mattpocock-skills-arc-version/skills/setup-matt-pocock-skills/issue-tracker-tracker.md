# Issue tracker: Yandex Tracker

Issues and specs live in the project's Tracker queue. Source code lives in Arc; pull requests live in Arcanum. Record the actual queue, issue URL format, configured Tracker MCP/CLI, and triage role mapping during setup.

## Operations

Use the installed Tracker skill and configured tools. Discover their schemas/help before recording concrete commands; Arc itself does not manage Tracker issues.

- **Read / list**: fetch an issue by its full key, or search within the configured queue, including description, comments, tags, status, assignee, and links.
- **Create**: create tickets only on an explicit user request. Approval of a plan or setup alone is not a request to create tickets.
- **Comment / tag / assign / close**: use the configured Tracker operations and the project's role/status mapping. Keep ticket creation separate from changes to existing tickets.
- **Parent / blocking links**: use the tracker's native relationships, checking the available link types and direction first. If unavailable, record explicit keys in the body as `Part of: PROJECT-123` and `Blocked by: PROJECT-124`.

## Arcanum PRs as a request surface

**Enabled:** no

When enabled, record which authors count as external and how triage roles are stored for PRs. Use the configured Arcanum MCP or installed `arcanum-go` skill for PR descriptions, comments, labels, checks, and remote diffs. Use Arc for local checkout, history, and diffs. If a required operation is unavailable, report the limitation.

Tracker keys and Arcanum PR IDs are separate identifiers. Use a full Tracker key or an Arcanum URL to resolve an ambiguous reference. Keep new PRs unpublished unless publication or review was explicitly requested.

## When a skill says "publish to the issue tracker"

Create the approved content in Tracker only when ticket creation was explicitly requested. Otherwise, prepare the draft and ask before creating it.

## When a skill says "fetch the relevant ticket"

Read the full Tracker issue and comments by key. Follow links to the originating spec and Arcanum PR as needed.

## Wayfinding operations

- **Map**: one issue tagged `wayfinder:map`, with Notes / Decisions-so-far / Fog.
- **Child**: one linked issue per question, tagged `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`. Create only when explicitly requested.
- **Blocking**: native blocking relationships, or explicit `Blocked by:` keys when unavailable. A child is unblocked when all blockers are resolved.
- **Frontier**: the map's open, unblocked, unassigned children, in map order.
- **Claim**: assign the selected child to the driving developer before work.
- **Resolve**: post the answer, transition the child to the configured resolved status, then append a context pointer to the map's Decisions-so-far.
