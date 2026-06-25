+++
title = "How a 'Send Test Email' button turned into an SMTP encryption rewrite"
date = 2026-06-17
[taxonomies]
tags = ["laravel", "symfony-mailer", "smtp", "security", "tls"]
[extra]
filename = "smtp-encryption-blog-post.md"
icon = "md"
+++

# How a "Send Test Email" button turned into an SMTP encryption rewrite

This started as a tiny quality-of-life task and snowballed into a proper fix of how my app handles SMTP and connection encryption, plus a real security finding along the way. Here's the whole story, from a one-line annoyance to a hardened mail pipeline.

## It began with a small annoyance

All I wanted was for the **"Send Test Email"** button to reuse the SMTP password that was *already saved*, instead of forcing me to retype it every time.

But while I was in the settings screen, something caught my eye: the encryption selector listed **SSL** and **TLS** as two separate options. In practice those terms are used interchangeably, since mail clients tend to show them together, so seeing them split apart was a red flag that something underneath wasn't modelled correctly. I decided to investigate that first.

## The real bug: I was driving Symfony Mailer by port, not by scheme

The investigation turned up a genuine mistake. I was using Laravel's Symfony Mailer incorrectly: **I never set a transport `scheme`**, so the entire encryption behaviour was being decided by the SMTP **port** alone.

Laravel 12 ignores the legacy `mail.encryption` config key entirely and derives TLS behaviour from the transport scheme, only falling back to the port (`465 => smtps`) when no scheme is set. So in my setup:

- **Port 465** forced implicit SSL/TLS.
- **Any other port** got opportunistic STARTTLS, where Symfony negotiates TLS only if the server advertises it, and otherwise carries on in plaintext.

In other words, the SSL/TLS dropdown was effectively a no-op. The encryption mode was pinned to whatever port happened to be configured, and the admin's choice was ignored.

## Fixing it properly: scheme-driven encryption on any port

Rather than patch around the symptom, I implemented the mail feature the way it should have been from the start. `EmailService` now sets the transport scheme explicitly, decoupled from the port:

- **SSL/TLS** maps to `smtps` (implicit TLS from connect)
- **STARTTLS** maps to `smtp` (opportunistic upgrade on the connection)
- **None** maps to `smtp` (plaintext, no TLS required)

Because the scheme is now independent of the port, encryption works on **custom SMTP ports** too. An admin can force SSL/TLS, STARTTLS, or None on whatever port they want, and the app obeys the explicit choice instead of guessing from `465` vs. everything else. I also relabelled the UI to match what mail clients actually show ("SSL/TLS" and "STARTTLS") and made it auto-fill the conventional port (465 / 587 / 25) on change, which the admin can still override.

## And finally, the original task

With encryption behaving correctly, I circled back to the thing that kicked all this off. The **"Send Test Email"** button no longer demands the password: if SMTP settings are already saved and working, a blank password field simply reuses the stored credential. The button is gated on having a saved configuration, so the fallback always has something to fall back to.

## Was that the end? No, there was the security review

Before shipping, I ran Claude's `/security-review` over the changes, and it surfaced a real issue with the **STARTTLS** path.

When an admin picks STARTTLS, the app should **require** STARTTLS and **fail** if encryption can't be established. As I'd implemented it, just selecting the `smtp` scheme, Symfony's STARTTLS is *opportunistic*: if the server doesn't advertise STARTTLS, the connection silently continues in **plaintext**.

That's exploitable. A network attacker positioned between the app and the SMTP server can **strip STARTTLS** from the server's plaintext EHLO capability response, tricking the app into talking to the relay in cleartext. From there the attacker can read the SMTP credentials and the full message body, which in this app includes **email-verification codes, password-reset codes, and passwordless login codes**. A classic STARTTLS stripping / downgrade attack.

The fix is to make STARTTLS **fail closed**. When the admin selects STARTTLS, the app now sets `require_tls`, which Laravel passes through to the DSN and Symfony honours via `setRequireTls`, so if TLS can't be negotiated, the send **fails** instead of leaking everything over plaintext.

The three modes now behave like this:

| Mode      | Scheme  | TLS required? |
|-----------|---------|---------------|
| SSL/TLS   | `smtps` | implicit (always encrypted) |
| STARTTLS  | `smtp`  | **yes**, fails if it can't upgrade |
| None      | `smtp`  | no, explicit opt-out |

If an admin genuinely wants an unencrypted connection (a local relay, say), they pick **None**. Symfony will still *attempt* a TLS upgrade if the server offers it, but will fall back to plaintext, because that's the admin's explicit, informed choice rather than a silent downgrade.

## Takeaways

A few lessons worth keeping:

1. **A confusing UI label is often a symptom.** The SSL/TLS-vs-STARTTLS muddle in the dropdown was the visible tip of a misconfigured transport.
2. **Know how your framework picks TLS.** With Symfony Mailer, the *scheme* drives encryption, not the legacy `encryption` key, and ideally not the port by accident.
3. **Opportunistic isn't the same as required.** If a security setting says "use encryption," it had better *fail* when encryption is unavailable. Otherwise it's just a suggestion an attacker can decline on your behalf.

What started as a button tweak ended with encryption that actually respects the admin's choice, works on any port, and fails safely under attack. Not a bad trade.
