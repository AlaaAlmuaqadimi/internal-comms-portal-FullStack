# Org Units API and tree architecture

## 1. Data model

`org_units` is a self-referencing **adjacency list**:

```sql
org_units (
  id          CHAR(36) PRIMARY KEY,
  parent_id   CHAR(36) NULL REFERENCES org_units(id),
  code        VARCHAR(64) UNIQUE,
  name_ar     VARCHAR(255) NOT NULL,
  name_en     VARCHAR(255) NULL,
  kind        ENUM('root','deputy','office','directorate','section','group'),
  sort_order  INT,
  is_active   TINYINT(1),
  metadata    JSON,
  created_at  DATETIME(3),
  updated_at  DATETIME(3),
  deleted_at  DATETIME(3) NULL
)
```

Adjacency list was kept instead of nested sets/materialized paths because moving a
branch must be a single-row write and the tree is small (hundreds/thousands of
units). MySQL 8 / MariaDB 10.4 recursive CTEs provide subtree and ancestor
queries without denormalized path maintenance.

### Business mapping

| Business term | Arabic | `kind` | Parent |
| --- | --- | --- | --- |
| Head of the Authority | رئيس المصلحة | `root` | `NULL` |
| Deputy Head (optional) | نائب رئيس المصلحة | `deputy` | root |
| General Administration | إدارة عامة / إدارة | `directorate` | root (or legacy group/deputy) |
| Branch / Regional Office / staff office | مكتب / فرع | `office` | root (or directorate/office/group/deputy) |
| Department | قسم | `section` | directorate or office |
| Legacy grouping node | تجميع إداري | `group` | root/deputy/office/directorate |

A branch that "reports directly to the top" is an `office` whose `parent_id` is
the root id. It is **not** parentless: only the Head has `parent_id = NULL`.

## 2. Database guardrails (V011)

`database/migrations/V011__org_unit_tree_guardrails.sql` adds:

1. **One active root**
   - stored generated column `active_root_key` = `1` only when
     `parent_id IS NULL AND deleted_at IS NULL`
   - unique index `uq_org_units_active_root`
   - permits historical soft-deleted roots, rejects two live Heads.
2. **Root/parent consistency**
   - `CHECK ((kind='root' AND parent_id IS NULL) OR (kind<>'root' AND parent_id IS NOT NULL))`
3. **Ordered child lookups**
   - `(parent_id, is_active, sort_order, name_ar)`

Application rules that cannot be expressed as a row-level constraint:

- parent must exist, be active and not deleted;
- a unit cannot be moved below itself or a descendant (cycle check);
- kind/parent matrix (for example a department cannot contain another department);
- structural writes serialized by locking the root row (`SELECT ... FOR UPDATE`)
  so two concurrent moves cannot each pass the cycle check and form a cycle.

## 3. Endpoints

All routes are mounted under `/api/org-units` and require a Bearer access token.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET | `/` | `org.read` | Flat, scope-filtered list. Query: `parentId`, `q`, `includeInactive` |
| GET | `/tree` | `org.read` | Nested forest. Query: `rootId`, `includeInactive` |
| GET | `/:id` | `org.read` | Unit + ancestors + direct children |
| GET | `/:id/subtree` | `org.read` | Nested subtree rooted at the unit |
| GET | `/:id/ancestors` | `org.read` | Root → parent path |
| GET | `/:id/children` | `org.read` | Direct children |
| POST | `/` | `org.manage` | Create a unit |
| PATCH | `/:id` | `org.manage` | Update fields, optionally reparent with `parentId` |
| PATCH | `/:id/move` | `org.manage` | Reparent only |
| DELETE | `/:id` | `org.manage` | Soft delete a leaf with no employees |
| POST | `/:id/restore` | `org.manage` | Restore a soft-deleted unit |

### Create examples

```http
POST /api/org-units
{
  "code": "GA-IT",
  "nameAr": "الإدارة العامة للمعلوماتية",
  "nameEn": "IT General Administration",
  "kind": "directorate",
  "parentId": "<head-unit-id>",
  "sortOrder": 10
}
```

```http
POST /api/org-units
{
  "code": "TRIPOLI-OFFICE",
  "nameAr": "مكتب طرابلس",
  "kind": "office",
  "parentId": "<head-unit-id>"
}
```

```http
POST /api/org-units
{
  "nameAr": "قسم الشبكات",
  "kind": "section",
  "parentId": "<tripoli-office-id-or-general-administration-id>"
}
```

`code` is optional for creation; if omitted the service generates `OU-XXXXXXXX`.

### Response shapes

```json
{ "success": true, "orgUnits": [ ... ] }
{ "success": true, "tree": [ { "id": "...", "children": [ ... ], "depth": 0 } ] }
{ "success": true, "orgUnit": { ... }, "ancestors": [ ... ], "children": [ ... ] }
{ "success": true, "subtree": { ... } }
{ "success": true, "deleted": { "id": "..." } }
```

Unit JSON uses camelCase: `parentId`, `nameAr`, `nameEn`, `sortOrder`,
`isActive`, `employeeCount`, `createdAt`, `updatedAt`.

## 4. Tree assembly

`backend/src/lib/orgTree.js` builds the nested tree in **O(n)**:

1. index every row by `id`;
2. attach each row to `parentId` (or to the roots array when the parent is not in
   the result set);
3. recursively sort by `sort_order`, then Arabic name, and assign `depth`.

Rows whose parent falls outside a scoped SQL result become roots of the returned
forest rather than disappearing. This is what makes the same builder work for a
global admin and for a manager scoped to one sub-tree.

Inactive units are loaded first and then pruned together with their descendants,
so an active child under an inactive administration never floats to the top.

## 5. Authorization and scoping

Existing RBAC already provides `org.read` and `org.manage` with optional scopes
in `user_roles.scope_org_unit_id`. The module uses the scopes from the access
token:

- **list/tree**: SQL recursive CTE starts at each granted scope and returns the
  union of those subtrees;
- **read by id / children / subtree**: target must be inside a granted subtree
  (`isOrgUnitWithinScope`);
- **create**: parent must be inside a granted subtree; creating the root is
  global-only;
- **update/move**: target and, when changed, the new parent must be in scope;
- **delete/restore**: target/subtree is checked before the write.

Global admins (`{ global: true }`) bypass the scope filter.

## 6. Delete and restore semantics

- Delete is **soft** (`deleted_at`, `is_active = 0`).
- Rejected with `409 ORG_UNIT_HAS_CHILDREN` while active children remain.
- Rejected with `409 ORG_UNIT_HAS_EMPLOYEES` while employees are attached.
- The root cannot be deleted, moved, re-kinded or deactivated
  (`409 ORG_UNIT_ROOT_IMMUTABLE`).
- Restore requires a live parent and cannot create a second active root.
- Codes remain globally unique, including soft-deleted rows.

## 7. Error codes

| Code | HTTP | Meaning |
| --- | --- | --- |
| `ORG_UNIT_NOT_FOUND` | 404 | Unknown/deleted unit |
| `ORG_UNIT_CODE_TAKEN` | 409 | Duplicate `code` |
| `ORG_UNIT_ROOT_EXISTS` | 409 | Second active Head |
| `ORG_UNIT_ROOT_IMMUTABLE` | 409 | Root move/delete/deactivate/re-kind |
| `ORG_UNIT_PARENT_INVALID` | 422 | Missing/inactive parent or kind matrix violation |
| `ORG_UNIT_CYCLE` | 422 | Move below self/descendant |
| `ORG_UNIT_HAS_CHILDREN` | 409 | Delete blocked by children |
| `ORG_UNIT_HAS_EMPLOYEES` | 409 | Delete blocked by employees |
| `FORBIDDEN` | 403 | Target outside the caller's scopes |
| `VALIDATION_ERROR` | 422 | Zod body/query validation |

## 8. Integration notes

- `GET /api/users/org-units` remains available for the mobile Add User screen.
  New clients should use `GET /api/org-units` / `/tree`.
- Notifications already reference `org_units.target_org_unit_id`; a future
  audience resolver can reuse `getSubtree` or a recursive CTE.
- The audit trail records `org_unit.create|update|move|delete|restore` in
  `audit_log`, including before/after parent ids for moves.
- `npm run test:org --prefix backend` runs a disposable database smoke test for
  V009 Head reporting lines, V012 legacy normalization, nesting, moves, cycle
  detection, scope filtering, delete guards and restore.

## 9. Legacy tree normalization (V012)

`V009__seed_org_tree.sql` is the legacy 77-unit tree. Its regional
administrations originally lived under two `group` containers:

- `u35` — head-office branch: `u24..u34` (11 units)
- `u75` — deputy branch: `u59..u74` (16 units)

`V012__normalize_legacy_org_tree.sql` re-parents all 27 regional directorates
directly to the single active `root`. It changes only `parent_id` and
`sort_order`:

- `u35` children: `1000 + position in u24..u34`
- `u75` children: `2000 + position in u59..u74`

This keeps the seeded Head-level units first in the root list (see section 10),
then the regions in their original order. The update is idempotent: after the
first run the children no longer match `parent_id IN (u35, u75)`, so a second
run is a no-op. The empty legacy group rows remain in place for reference and
are not deleted or deactivated.

Manual moves are still possible through the API:

```http
PATCH /api/org-units/<unit-id>/move
{ "parentId": "<head-unit-id>" }
```

The kind matrix allows a `directorate` or `office` to sit directly under the
root, so regional units can be reparented without changing their `kind`.

## 10. Head reporting lines (V009)

The general administrations do **not** report to the Office of the Head of
Authority (`u36`). They report directly to the Head (`u77`), as do the Head
office and the five sub-offices.

| Code | Kind | Name | Parent |
| --- | --- | --- | --- |
| `u77` | root | Head of the Tax Authority | — |
| `u36` | office | Office of the Head of Authority | `u77` |
| `u76` | deputy | Deputy Head of Authority | `u77` |
| `u1` | office | Monitoring Office | `u77` |
| `u2` | office | Internal Audit Office | `u77` |
| `u3` | office | Sports Activity Office | `u77` |
| `u4` | office | Tax Awareness & Education Office | `u77` |
| `u5` | office | Social Welfare Fund | `u77` |
| `u8` | directorate | Technical Affairs | `u77` |
| `u15` | directorate | Administrative & Financial Affairs | `u77` |
| `u19` | directorate | Inspection | `u77` |
| `u23` | directorate | Revenue Accounting | `u77` |

Head-level `sort_order` is deterministic: `u36=0`, `u76=1`, `u1..u5=2..6`,
`u8=7`, `u15=8`, `u19=9`, `u23=10`. `V012` gives the flattened regional
directorates sort bases `1000+`/`2000+`, so every seeded Head-level unit stays
ahead of the regions.

The four administrations keep their own sections; only the top-level parent
changes from `u36` to `u77`:

- `u8` → `u6`, `u7`
- `u15` → `u9..u14`
- `u19` → `u16..u18`
- `u23` → `u20..u22`

`u35` (regional group container) stays under `u36`; `V012` still flattens its
children to the root and leaves `u35`/`u75` empty. `V009` is idempotent: the
`ON DUPLICATE KEY UPDATE` clauses reset the parent and sort order on every run,
so re-applying migrations produces the same tree.

Verification is available in `database/queries/org_tree.sql` (queries 10 and
11) and in `backend/scripts/org-smoke-test.js`, which asserts the Head-level
direct children, their prefix order, and the administration sections.
