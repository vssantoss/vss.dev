+++
title = "Building Crypto Average Price"
date = 2026-06-06
description = "A local-first React and Electron tool for importing Crypto.com CSV exports, applying PTAX rates, and making average-price calculations easier to audit."
authors = ["Victor Santos"]
[taxonomies]
tags = ["crypto-average-price", "portfolio", "typescript", "react", "tools"]
[extra]
filename = "building-crypto-average-price.md"
icon = "md"
+++

{% notice() %}This post is a work in progress and will be updated soon.{% end %}

# Building Crypto Average Price

I built [Crypto Average Price](https://github.com/vssantoss/crypto-average-price) because a spreadsheet was starting to become the wrong tool for the job.

The problem sounds simple: import crypto transactions, track the average purchase price, and understand profit or loss in BRL. The real version is messier. Exchange exports have their own vocabulary. Trades arrive as multiple rows. Stablecoins can behave like USD but still need careful handling. Transfers to external wallets should not look like sales. Manual corrections need to be possible without hiding what changed.

That is the kind of project I like: small enough to finish, real enough to have sharp edges.

## What it does

Crypto Average Price is a local React app for importing Crypto.com Exchange transaction reports and Banco Central do Brasil PTAX CSV files.

It calculates running balances, external balances, average acquisition prices, BRL cost basis, USD cost basis for non-stablecoins, and profit/loss rows where enough information exists. It also lets me add manual rows, override values, filter the table, and export the processed result back to CSV.

The app runs locally because the data is personal financial data. Imported files are parsed in the browser, and the working session is stored in local storage. There is also an Electron wrapper for desktop builds.

## The interesting part

The UI is the visible part, but the calculation pipeline is the real project.

The app has separate modules for parsing input files, matching trade legs, looking up PTAX rates, merging USD-like assets, tracking running balances, tracking external-wallet balances, calculating average price, and calculating profit/loss.

That separation matters because every row needs to be explainable. If a number looks wrong, I want to know whether the issue came from parsing, trade matching, a missing PTAX date, an external transfer, a manual override, or the actual average-price math.

I also built the export path as part of the workflow, not as an afterthought. The app can export raw rows or calculated rows, include app settings, and in browsers with file-system access, keep a selected CSV updated while the page is open.

## What I learned

This project made a few engineering choices feel less theoretical:

- Domain rules need names. "Withdrawal" is not specific enough when one withdrawal is a transfer and another one is a disposition.
- Local-first tools still need recovery paths. A CSV export can be a backup, not just a report.
- Tables are product surfaces. Filtering, column visibility, editable cells, and diagnostics decide whether the calculation engine is usable.
- The boring edge cases are the product. Fees, stablecoin swaps, manual seeds, partial returns from external wallets, and missing rates are where trust is won or lost.

## The stack

The app is built with React, TypeScript, Vite, Zustand, TanStack Table, PapaParse, Tailwind CSS, and Electron.

I chose that stack because it keeps the feedback loop fast while still letting the calculation code stay strongly typed and testable as plain TypeScript modules.

## Status

Crypto Average Price is still a work in progress. It is not tax, legal, accounting, or financial advice, and I do not treat it as an authoritative source without reviewing the output.

But as a portfolio project, it shows the kind of software I want to build for work: practical tools, clear data flow, careful handling of real-world input, and interfaces that make complicated information easier to audit.
