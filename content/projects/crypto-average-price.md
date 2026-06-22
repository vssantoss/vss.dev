+++
title = "Crypto Average Price"
date = 2026-06-06
weight = 2
description = "A local-first React and Electron tool for importing Crypto.com CSV exports, applying PTAX rates, and making average-price calculations easier to audit."
authors = ["Victor Santos"]
[taxonomies]
tags = ["crypto-average-price", "portfolio", "typescript", "react", "tools"]
[extra]
filename = "crypto-average-price.md"
icon = "md"
+++

# Crypto Average Price

A local-first tool for importing Crypto.com Exchange transaction reports, applying Banco Central do Brasil PTAX rates, and calculating average acquisition prices and profit/loss in BRL, with every row explainable.

The data is personal financial data, so it runs locally: files are parsed in the browser and the working session stays in local storage. There's also an Electron wrapper for desktop builds.

- **Repo:** [github.com/vssantoss/crypto-average-price](https://github.com/vssantoss/crypto-average-price)
- **Stack:** React, TypeScript, Vite, Zustand, TanStack Table, PapaParse, Tailwind CSS, Electron

## Posts about this project

Everything I've written while building this tool lives under the [#crypto-average-price](/tags/crypto-average-price/) tag.
