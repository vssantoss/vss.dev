+++
title = "Things to pay attention to when building web applications"
date = 2026-06-02
description = "A running list of small web application details that are easy to miss but worth getting right."
authors = ["Victor Santos"]
[taxonomies]
tags = ["frontend", "forms"]
[extra]
filename = "things-to-pay-attention-to-when-building-web-applications.md"
icon = "md"
+++

# Things to pay attention to when building web applications

This is a running list of small details I do not want to forget when
building web applications.

Some will be about forms. Some will be about accessibility,
performance, browser behavior, APIs, deployment, or anything else that
only becomes obvious after the product is in front of real users.

## Disable password manager suggestions on non-login text fields

If a field is for search, filtering, tagging, naming a project, writing a
note, or entering any text that is not authentication data, tell password
managers to leave it alone.

The common attributes are:

- 1Password: `data-1p-ignore` or `data-op-ignore`
- LastPass: `data-lpignore="true"`
- Bitwarden: `data-bwignore`
- Dashlane: `data-form-type="other"`

In practice, I usually put the set on text inputs that should never open
a credential picker:

```html
<input
  type="text"
  name="project_name"
  autocomplete="off"
  data-1p-ignore
  data-op-ignore
  data-lpignore="true"
  data-bwignore
  data-form-type="other"
/>
```

This is not a replacement for good form semantics. Login forms should
still use proper `autocomplete` values like `username`,
`current-password`, and `new-password`.

The point is simpler: do not let authentication tooling interrupt fields
that have nothing to do with authentication.
