# Contact Form

The contact form sends emails via any SMTP server. No third-party service required.

## Gmail Setup

1. **Enable 2-Step Verification** at https://myaccount.google.com/security
2. **Generate an App Password** at https://myaccount.google.com/apppasswords
   - Select "Other" → name it `Phos` → copy the 16-character password
3. **Log into the admin dashboard** at `/admin` and navigate to the **Contact** tab
4. Fill in the SMTP fields:

| Field | Value |
|---|---|
| `smtp.host` | `smtp.gmail.com` |
| `smtp.port` | `587` |
| `smtp.user` | `your.email@gmail.com` |
| `smtp.pass` | The 16-character app password (spaces optional) |
| `smtp.fromEmail` | `your.email@gmail.com` |
| `smtp.toEmail` | Where you want to receive messages (any address) |

## Other Providers

Any SMTP provider works — SendGrid, Mailgun, your hosting provider's mail server, etc. Fill in the same six fields with your provider's credentials.

## Demo Mode

When `site.toggle_demo` is enabled in the admin dashboard, form submissions are silently accepted without sending emails — useful for testing.
