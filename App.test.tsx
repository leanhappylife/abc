You are working in an existing Java project that generates `relationship_detail.tsv` for DB2 SQL analysis.

A NEW version of `relationship_detail.md` has already been added to the workspace.  
Your task is to update the Java code to match the NEW MD contract.

Do not rely on older assumptions.  
Treat the NEW `relationship_detail.md` in the workspace as the source of truth.

====================================
GOAL
====================================

Update the Java implementation so that TSV generation, field filling, validation, and any post-processing logic are aligned with the NEW MD.

Focus on:
- TSV header / field naming
- filling rules for `persistent_target_objects`
- filling rules for `intermediate_target_objects`
- any validation logic that still reflects old semantics

Do not implement unrelated redesigns.
Prefer minimal incremental changes.

====================================
IMPORTANT NEW MD CHANGES TO APPLY
====================================

The new MD changes are mainly about these columns:

1. FIELD RENAME
Old names:
- `persistent_impact_objects`
- `intermediate_objects`

New names:
- `persistent_target_objects`
- `intermediate_target_objects`

You must update:
- TSV header output
- any Java model / DTO / record / builder fields
- any writer/export code
- any parser/post-processor/validator logic
- any comparison / diff logic
- any tests that assert old column names

2. NEW SEMANTIC MEANING OF THESE TWO COLUMNS
These two columns are now defined as:

- auxiliary target-side classification / landing columns
- for the CURRENT DIRECT ROW ONLY

They are NOT:
- full downstream impact
- propagated lineage result
- full intermediate path
- end-to-end lineage path

So do not populate them using multi-hop reasoning.

3. FILLING RULE SPLIT: MAP / WRITE / TARGET ROWS vs USAGE ROWS

The new MD says these columns are mainly for target-landing style rows.

They are PREFERRED / SHOULD BE FILLED for:

A. mapping rows:
- `CREATE_VIEW_MAP`
- `INSERT_SELECT_MAP`
- `UPDATE_SET_MAP`
- `MERGE_SET_MAP`
- `MERGE_INSERT_MAP`
- `VARIABLE_SET_MAP`
- `CURSOR_FETCH_MAP`
- `FUNCTION_PARAM_MAP`
- `CALL_PARAM_MAP`
- `SPECIAL_REGISTER_MAP`
- `DIAGNOSTICS_FETCH_MAP`
- `FUNCTION_EXPR_MAP`
- `TABLE_FUNCTION_RETURN_MAP`

B. target-column declaration rows:
- `INSERT_TARGET_COL`
- `UPDATE_TARGET_COL`
- `MERGE_TARGET_COL`

C. write / create / object target rows:
- `CREATE_TABLE`
- `CREATE_VIEW`
- `CREATE_FUNCTION`
- `CREATE_PROCEDURE`
- `INSERT_TABLE`
- `UPDATE_TABLE`
- `MERGE_INTO`
- `DELETE_TABLE`
- `DELETE_VIEW`
- `TRUNCATE_TABLE`
- `RETURN_VALUE` (only when target-side landing is meaningful under the new MD rules)

D. structural intermediate rows:
- `CTE_DEFINE`
- `CTE_READ`
- `CURSOR_DEFINE`
- `CURSOR_READ`

4. USAGE ROWS SHOULD USUALLY LEAVE THESE COLUMNS EMPTY

The new MD says these columns should usually be empty for pure usage rows such as:
- `SELECT_FIELD`
- `SELECT_EXPR`
- `WHERE`
- `JOIN_ON`
- `GROUP_BY`
- `HAVING`
- `ORDER_BY`
- `MERGE_MATCH`
- `UPDATE_SET`
- `CONTROL_FLOW_CONDITION`

So if existing Java code currently auto-fills persistent/intermediate columns for those rows just because the target object type is TABLE / VIEW / CTE / VARIABLE / etc., remove that behavior.

Do not fill these columns mechanically for every row.
Apply the relationship-aware rules from the new MD.

5. TARGET-SIDE ONLY
When these columns are filled, they must reflect the CURRENT ROW’S TARGET SIDE only.

Examples:
- for a row targeting a persistent table column:
  - `persistent_target_objects = <target_object>.<target_field>`
- for a row targeting an intermediate variable / cte / cursor / session table:
  - `intermediate_target_objects = <target_object>.<target_field>` or object-only if no field

Do not combine source and target.
Do not place full path strings here.
Do not backfill propagated endpoints.

6. FORMAT RULE
When filled:
- if `target_field` exists: use `target_object.target_field`
- otherwise use `target_object`

7. RELATIONSHIP-AWARE FILLING, NOT JUST OBJECT-TYPE-AWARE
Old code may currently do something like:
- if target_object_type is TABLE/VIEW => fill persistent column
- else if target_object_type is CTE/VARIABLE/etc => fill intermediate column

That is no longer enough.

Now logic must also consider the relationship type:
- fill for map/target/write/structural rows
- usually leave empty for usage rows

8. VALIDATOR / TEST EXPECTATIONS
Update any validator/test code so that:
- it expects the renamed headers
- it no longer flags usage rows as missing persistent/intermediate values
- it validates the new relationship-aware fill rules

====================================
WHAT TO INSPECT FIRST
====================================

Please inspect before changing code:

1. The NEW `relationship_detail.md`
2. Current TSV model / row class
3. TSV header writer
4. Any logic that computes:
   - persistent_impact_objects
   - intermediate_objects
5. Any post-processing or enrichment logic
6. Any validation / diff / test logic

Then summarize:
- where old field names still exist
- where old auto-fill behavior still exists
- what minimal code changes are needed

====================================
IMPLEMENTATION REQUIREMENTS
====================================

Make minimal incremental changes only.

Likely update areas:
- row model / DTO / builder
- enum/constants for header names
- TSV writer
- enrichment/filling helper for target-side auxiliary columns
- validator/comparison code
- tests

Avoid broad refactors unless necessary.

====================================
EXPECTED CODE BEHAVIOR AFTER CHANGE
====================================

After the change:

1. TSV header must use:
- `persistent_target_objects`
- `intermediate_target_objects`

2. For rows like `INSERT_SELECT_MAP`, `UPDATE_SET_MAP`, `VARIABLE_SET_MAP`, etc.:
- fill the correct target-side column according to target type

3. For rows like `SELECT_FIELD`, `SELECT_EXPR`, `WHERE`, `JOIN_ON`, etc.:
- these two columns should normally be empty

4. For structural intermediate rows like `CTE_DEFINE`, `CTE_READ`, `CURSOR_DEFINE`, `CURSOR_READ`:
- fill `intermediate_target_objects`

5. For write/create rows targeting persistent objects:
- fill `persistent_target_objects`

6. No multi-hop / propagated filling

====================================
DELIVERABLES
====================================

Please provide:

1. the code changes
2. a short summary of what old logic was removed
3. a short summary of what new logic was added
4. any updated tests
5. a note on any rows that may now differ from older TSV outputs because of the new MD rules
