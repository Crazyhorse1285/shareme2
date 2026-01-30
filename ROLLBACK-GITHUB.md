# How to Roll Back / Undo Commits on GitHub

## Option A: Using GitHub Website (easiest, no terminal)

1. **Open your repo on GitHub**  
   Go to: `https://github.com/YOUR_USERNAME/YOUR_REPO` (e.g. `https://github.com/Crazyhorse1285/shareme2`).

2. **Open the commit history**  
   Click the **"X commits"** link (or the clock/history icon) so you see the list of commits.

3. **Find the commit you want to undo**  
   Click the **commit message** (e.g. the one that added password hashing or the change you want to remove).

4. **Revert that commit**  
   - On the commit page, click the **"..."** (three dots) button on the right.  
   - Click **"Revert this commit"**.  
   - GitHub will open a new page with a new commit that undoes that change.  
   - Click **"Create revert commit"** (or **"Commit changes"**).  
   - If it asks which branch, choose **main**.

5. **Done**  
   The revert is now on GitHub. Your main branch has a new commit that cancels out the one you reverted.

---

## Option B: Using Git in the terminal

Run these in the project folder (e.g. `c:\Users\crazy\ShareMe`) in order.

### Step 1: Get the latest from GitHub

```powershell
git pull origin main
```

### Step 2: See recent commits (copy the hash of the one to undo)

```powershell
git log --oneline -5
```

Example output:

```
abc1234 (HEAD -> main, origin/main) latest commit message
def5678 the commit I want to undo
...
```

Copy the hash of the **commit you want to undo** (e.g. `def5678`).

### Step 3: Revert that commit

```powershell
git revert DEF5678 --no-edit
```

(Use the hash you copied; use the full hash if needed.)

### Step 4: Push to GitHub

```powershell
git push origin main
```

---

## Option C: Undo the *last* commit only (rewrites history)

**Use only if no one else has pulled the commit.** This removes the commit from the branch.

```powershell
git pull origin main
git reset --hard HEAD~1
git push origin main --force
```

This deletes the last commit from `main` on GitHub. Anyone who already pulled may need to reset their local branch.

---

## If you get "revert failed" or conflicts

- **Merge conflicts**: GitHub or Git will list the conflicting files. Open them, remove conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`), keep the version you want, save, then:
  - Website: use the "Resolve conflicts" editor and mark as resolved, then commit.
  - Terminal: `git add .` then `git revert --continue` (or `git commit` if it created a revert and stopped).
- **Permission denied / 403**: You need write access to the repo. If it’s not yours, use a fork and open a PR that reverts the commit.
- **Branch protected**: If `main` is protected, you may need to revert in a new branch and open a Pull Request, then merge it.

If you tell me which option you used and the exact error message (or a screenshot), I can give step-by-step for that case.
