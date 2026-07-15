## What is Declaration?
Declaration is a game a friend of ours learned in high school at summer camp, where he played wiht the original player. Soon, Declaration
caught on as a huge trend in our high school. Now, as college students we've re-create our same beloved game, but online! 
<br>
<br>
## The Rules of Declaration

Declaration is played with 6 players, split into two teams of 3. Typically, this is done by arranging players in alternating team order.

At the beginning of each match, every player is dealt 9 cards out of a full 54 card deck. Declaration is a game played by completing sets.

There are 9 sets in each deck:
- 2 - 7 (Hearts, Spades, Diamonds, Clubs)
- 9 - A (Hearts, Spades, Diamonds, Clubs)
- 8s, Black Joker, Red Joker

You complete a set by making a **Declaration**; this happens when you believe your team holds every card in a set, and you try to guess who in your team has each card of the set. If your guess is correct, then the set is played, and your team scores a point.

This is accomplished through **asks**. When it is your turn to ask, you are allowed to ask any opponent with cards for a card that contributes to the sets of any card you are holding. You are **NOT** allowed to ask for a card you do not have any of the other cards in the set for.

- If the ask **succeeds** (i.e., the opponent you asked actually has that card), they must give you that card, and it remains your turn to ask again.
- If the ask **fails**, then the person you asked now has the turn to ask a member of your team.

This cycle continues. As players run out of cards, they are effectively "out" of the game. If it was their turn to ask, the turn is transferred to the closest player to their left who still has cards.

The game ends when a team scores **5** out of the 9 possible sets.
<br>
<br>
## Strategy
WIP





---

## Branch Model

```
main       ← production
staging    ← QA gate
feature/*  ← all development work
```

---

## Developer Workflow

### 1. Create a feature branch (always from `main`)

```bash
git checkout main && git pull
git checkout -b feature/your-feature
```

### 2. Do your work and push

```bash
# ... make commits as you go ...
git push origin feature/your-feature
```

### 3. Open a PR into `staging`

```bash
gh pr create --base staging --title "Your feature title" --body ""
```

GitHub will populate the PR body with the PR template. Fill it out on GitHub — describe what changed, how you tested it, and any risks.

### 4. Run the AI reviewer (before merging)

In Claude Code, with your feature branch checked out:

```
/project:ai-reviewer
```

Claude diffs your branch against `staging`, flags any blocking or advisory issues with `file:line` references. Address blocking findings, then check the box in the PR description.

### 5. Merge into `staging`

```bash
gh pr merge --squash
```

### 6. Verify on staging

If the project has a staging environment, check your changes there. This is your QA window before production.

### 7. Promote to production

When `staging` is stable, open a PR from `staging` → `main`:

```bash
git checkout staging && git pull
gh pr create --base main --title "Release: description of changes" --body "Promoting staging to production."
```

Then merge:

```bash
gh pr merge --squash
```
