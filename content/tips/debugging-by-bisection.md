+++
title = "Debugging by bisection"
date = 2026-03-02
description = "When something breaks and you have no idea where, don't read every line. Cut the problem in half."
authors = ["Victor Santos"]
[taxonomies]
tags = ["debugging", "git"]
[extra]
filename = "debugging-by-bisection.md"
icon = "md"
+++

# Debugging by bisection

When something breaks and you have no idea where, don't read every line.
**Cut the problem in half.**

- Comment out half the code. Does the bug survive? Now you know which half.
- Repeat. Each step throws away 50% of the search space.
- A bug hiding in 1,000 lines is about 10 halvings away from caught.

Same trick, different name. It lives in `git bisect`, which binary-searches
your commit history for the one that broke things:

```sh
git bisect start
git bisect bad            # current commit is broken
git bisect good v1.4.0    # this old one worked
# git checks out the midpoint; you test and mark good/bad
```

Stop guessing. Start halving.
