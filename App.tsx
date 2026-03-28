- When a PR URL is provided, extract `repo` and `pull` from the URL before running the command.
- Use shell redirection to save the generated PR JSON into `output/<repo>-pr-<pull>.json`.
- Always read the generated JSON file and continue automatically to the review.


  ### PR Review Workflow

When the user asks to review a pull request:

1. Extract the PR URL from the user input.

2. Parse the PR URL path:
   - repo = the segment before `pull`
   - pull number = the segment after `pull`

   Example:
   https://github.company.com/my-org/my-repo/pull/510
   -> repo = my-repo
   -> pull = 510

3. Execute:
   `node tools/github-get-pr.js --pr "<PR_URL>" > "output/<repo>-pr-<pull>.json"`

4. Read:
   `output/<repo>-pr-<pull>.json`

5. Immediately continue to review without asking the user.

6. Output:

# Summary

# High-risk findings

# Medium/low-risk findings

# Test gaps

# Final verdict

- Do NOT stop after generating the JSON file.
- Do NOT ask the user what to do next.
- Always continue automatically.
