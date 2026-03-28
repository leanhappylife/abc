- When reviewing pull requests, always use scripts under `tools/`.
- Always use `node tools/github-get-pr.js` to fetch PR data.
- Always use the generated JSON file as the source of truth.
- Never stop after running a script.
- Never ask the user what to do next.
- Always continue automatically to complete the review.

  在 ## Instructions 下面加这段


在 ## Tasks 下面加这整段（核心）
### PR Review Workflow

When the user asks to review a pull request:

1. Extract PR URL from the user input.

2. Execute:
   node tools/github-get-pr.js --pr "<PR_URL>"

3. After execution:
   - Find the generated JSON file under `output/` or `out/`
   - Look for a line in output like:
     Wrote output/<repo>-pr-<num>.json
   - Use that file as input

4. Read the JSON file.

5. Immediately continue to review WITHOUT asking user.

6. Output:

# Summary

# High-risk findings

# Medium/low-risk findings

# Test gaps

# Final verdict

⚠️ Do NOT stop after generating JSON  
⚠️ Do NOT ask the user for confirmation  
⚠️ Continue automatically to review
