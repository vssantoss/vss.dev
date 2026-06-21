+++
title = "Commands worth keeping around"
date = 2026-06-03
description = "A running list of small commands that solve annoying development workflow problems."
authors = ["Victor Santos"]
[taxonomies]
tags = ["tools", "windows", "node"]
[extra]
filename = "commands-worth-keeping-around.md"
icon = "md"
+++

# Commands worth keeping around

This is a running list of small commands that solve annoying development
workflow problems.

## Stop Windows from content-indexing noisy folders

Some folders are useful to keep on disk but not useful to search through
with Windows indexing. A good example is `node_modules`: thousands of
dependency files that can make indexing noisier than it needs to be.

To tell Windows not to content-index a folder:

```powershell
attrib +I "C:\folder\not\to\index" /S /D
```

What each part does:

- `+I` sets the "not content indexed" attribute
- `/S` applies it to files inside subfolders
- `/D` applies it to folders too

This is especially useful for generated or dependency-heavy folders:

```powershell
attrib +I "C:\path\to\project\node_modules" /S /D
```

This does not exclude the folder from OneDrive sync. It only tells
Windows Search not to content-index those files.
